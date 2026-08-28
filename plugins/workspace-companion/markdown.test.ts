import { describe, expect, test } from "bun:test";
import { toggleMarkdownTask } from "./markdown";

describe("workspace note Markdown tasks", () => {
  test("checks and unchecks a task without changing the surrounding note", () => {
    const note = ["## QA", "", "- [ ] Test checkout", "* [x] Test refund"].join(
      "\n",
    );

    expect(toggleMarkdownTask(note, 2)).toBe(
      ["## QA", "", "- [x] Test checkout", "* [x] Test refund"].join("\n"),
    );
    expect(toggleMarkdownTask(note, 3)).toBe(
      ["## QA", "", "- [ ] Test checkout", "* [ ] Test refund"].join("\n"),
    );
  });

  test("preserves indentation and ignores non-task lines", () => {
    expect(toggleMarkdownTask("  - [ ] Nested task", 0)).toBe(
      "  - [x] Nested task",
    );
    expect(toggleMarkdownTask("- ordinary bullet", 0)).toBe(
      "- ordinary bullet",
    );
    expect(toggleMarkdownTask("- [ ] Task", 4)).toBe("- [ ] Task");
  });
});
