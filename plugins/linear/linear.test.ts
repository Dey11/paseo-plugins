import { describe, expect, test } from "bun:test";
import {
  linearCredentialFiles,
  parseLinearCredential,
} from "./credential.server";
import type { LinearIssue } from "./contracts";
import { nextCursorForPage, runLinearOperation } from "./linear.server";
import { describeMutation } from "./mutations";

const issue: LinearIssue = {
  id: "i",
  identifier: "ENG-42",
  title: "Fix sync",
  url: "https://linear.app/example/issue/ENG-42",
  state: "In progress",
  priority: 2,
  priorityLabel: "High",
  updatedAt: "2026-08-21",
  description: "",
  teamId: "t",
  teamName: "Engineering",
  assignee: null,
  assignees: [
    { id: "ada", name: "Ada Lovelace" },
    { id: "grace", name: "Grace Hopper" },
  ],
  comments: [],
  states: [{ id: "done", name: "Done", type: "completed", color: "#fff" }],
};

describe("Linear integration", () => {
  test("loads only the named credential and supports quoted env files", () => {
    expect(
      parseLinearCredential(
        "OTHER=x\nexport LINEAR_API_KEY='lin_api_test'\nSECRET=y",
      ),
    ).toBe("lin_api_test");
    expect(parseLinearCredential("OTHER=x")).toBeNull();
    expect(linearCredentialFiles("/home/ada")).toEqual([
      "/home/ada/.config/paseo-plugins/linear.env",
      "/home/ada/.config/hosting/credentials.env",
    ]);
  });

  test("describes an external mutation before it is sent", () => {
    expect(
      describeMutation(issue, { type: "state", issueId: "i", stateId: "done" }),
    ).toContain("In progress to Done");
    expect(
      describeMutation(issue, { type: "priority", issueId: "i", priority: 1 }),
    ).toContain("Urgent");
    expect(
      describeMutation(issue, {
        type: "comment",
        issueId: "i",
        body: "Please verify the retry path.",
      }),
    ).toContain("Please verify");
    expect(
      describeMutation(issue, {
        type: "assignee",
        issueId: "i",
        assigneeId: "ada",
      }),
    ).toContain("Unassigned to Ada Lovelace");
    expect(
      describeMutation(
        { ...issue, assignee: { id: "ada", name: "Ada Lovelace" } },
        { type: "assignee", issueId: "i", assigneeId: null },
      ),
    ).toContain("Ada Lovelace to Unassigned");
  });

  test("surfaces Linear failures without exposing credentials", async () => {
    const operation = runLinearOperation(async () => {
      throw new Error("GraphQL forbidden for lin_api_should_not_escape");
    });

    await expect(operation).rejects.toThrow(
      "Linear request failed: GraphQL forbidden for [redacted]",
    );
  });

  test("exposes a cursor only while another issue page exists", () => {
    expect(
      nextCursorForPage({ hasNextPage: true, endCursor: "next-page" }),
    ).toBe("next-page");
    expect(
      nextCursorForPage({ hasNextPage: false, endCursor: "last-page" }),
    ).toBeNull();
    expect(nextCursorForPage({ hasNextPage: true })).toBeNull();
  });
});
