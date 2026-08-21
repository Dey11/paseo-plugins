import { LinearClient, type Issue, type IssueSearchResult } from "@linear/sdk";
import type {
  LinearIssue,
  LinearIssueSummary,
  LinearMutation,
} from "./contracts";
import { loadLinearCredential } from "./credential.server";

export async function linearStatus() {
  const credential = await loadLinearCredential();
  return { configured: credential.apiKey !== null, source: credential.source };
}

export async function searchIssues(
  query: string,
  cursor: string | null,
): Promise<{ items: LinearIssueSummary[]; nextCursor: string | null }> {
  return runLinearOperation(async () => {
    const client = await clientForRequest();
    if (!query.trim()) {
      const page = await client.issues({
        first: 50,
        after: cursor,
        includeArchived: false,
      });
      return summarizePage(page);
    }
    const page = await client.searchIssues(query.trim(), {
      first: 50,
      after: cursor,
      includeArchived: false,
      includeComments: false,
    });
    return summarizePage(page);
  });
}

export async function getIssue(id: string): Promise<LinearIssue> {
  return runLinearOperation(async () => {
    const client = await clientForRequest();
    return toDetail(await client.issue(id));
  });
}

export async function mutateIssue(
  mutation: LinearMutation,
): Promise<LinearIssue> {
  return runLinearOperation(async () => {
    const client = await clientForRequest();
    const issue = await client.issue(mutation.issueId);
    if (mutation.type === "comment") {
      const payload = await client.createComment({
        issueId: issue.id,
        body: mutation.body,
      });
      if (!payload.success)
        throw new Error("Linear did not accept the comment.");
    } else if (mutation.type === "state") {
      const payload = await issue.update({ stateId: mutation.stateId });
      if (!payload.success)
        throw new Error("Linear did not update the issue state.");
    } else {
      const payload = await issue.update({ priority: mutation.priority });
      if (!payload.success)
        throw new Error("Linear did not update the issue priority.");
    }
    return toDetail(await client.issue(issue.id));
  });
}

export async function runLinearOperation<Result>(
  operation: () => Promise<Result>,
): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    const redacted = detail.replace(/lin_api_[A-Za-z0-9_-]+/g, "[redacted]");
    throw new Error(`Linear request failed: ${redacted}`);
  }
}

async function clientForRequest(): Promise<LinearClient> {
  const { apiKey } = await loadLinearCredential();
  if (!apiKey)
    throw new Error("LINEAR_API_KEY is not configured for the Paseo daemon.");
  return new LinearClient({ apiKey });
}

async function summarizePage(page: {
  nodes: Array<Issue | IssueSearchResult>;
  pageInfo: {
    hasNextPage: boolean;
    endCursor?: string;
  };
}): Promise<{ items: LinearIssueSummary[]; nextCursor: string | null }> {
  return {
    items: await Promise.all(page.nodes.map(toSummary)),
    nextCursor: nextCursorForPage(page.pageInfo),
  };
}

export function nextCursorForPage(pageInfo: {
  hasNextPage: boolean;
  endCursor?: string;
}): string | null {
  return pageInfo.hasNextPage ? (pageInfo.endCursor ?? null) : null;
}

async function toSummary(
  issue: Issue | IssueSearchResult,
): Promise<LinearIssueSummary> {
  const state = issue.state ? await issue.state : undefined;
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    state: state?.name ?? "Unknown",
    priority: issue.priority,
    priorityLabel: issue.priorityLabel,
    updatedAt: issue.updatedAt.toISOString(),
  };
}

async function toDetail(issue: Issue): Promise<LinearIssue> {
  const [state, team, assignee, comments] = await Promise.all([
    issue.state,
    issue.team,
    issue.assignee,
    issue.comments({ first: 50 }),
  ]);
  if (!team) throw new Error("The Linear issue has no team.");
  const states = await team.states({ first: 100 });
  return {
    ...(await toSummary(issue)),
    description: issue.description ?? "",
    teamId: team.id,
    teamName: team.name,
    assignee: assignee?.name ?? null,
    comments: await Promise.all(
      comments.nodes.map(async (comment) => ({
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        user: (await comment.user)?.name ?? "Unknown",
      })),
    ),
    states: states.nodes
      .sort((a, b) => a.position - b.position)
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        type: candidate.type,
        color: candidate.color,
      })),
  };
}
