import { describe, expect, test } from "bun:test";
import { parseLinearCredential } from "./credential.server";
import type { LinearIssue } from "./contracts";
import { runLinearOperation } from "./linear.server";
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
  });

  test("surfaces Linear failures without exposing credentials", async () => {
    const operation = runLinearOperation(async () => {
      throw new Error("GraphQL forbidden for lin_api_should_not_escape");
    });

    await expect(operation).rejects.toThrow(
      "Linear request failed: GraphQL forbidden for [redacted]",
    );
  });
});
