import { describe, expect, test } from "bun:test";
import {
  parseMarkdownTable,
  toggleMarkdownTask,
  tokenizeMarkdownInline,
} from "./markdown";

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

describe("workspace note Markdown tables", () => {
  test("parses headers, alignment, and body rows", () => {
    expect(
      parseMarkdownTable(
        [
          "| File | Owner | State |",
          "| :--- | :---: | ---: |",
          "| src/app.ts | Dey | Ready |",
          "| README.md | Team | Draft |",
          "",
        ],
        0,
      ),
    ).toEqual({
      headers: ["File", "Owner", "State"],
      alignments: ["left", "center", "right"],
      rows: [
        ["src/app.ts", "Dey", "Ready"],
        ["README.md", "Team", "Draft"],
      ],
      endIndex: 3,
    });
  });

  test("keeps escaped and code-span pipes inside their cells", () => {
    expect(
      parseMarkdownTable(["Name | Value", "--- | ---", "A \\| B | `x|y`"], 0)
        ?.rows,
    ).toEqual([["A | B", "`x|y`"]]);
  });

  test("does not treat an ordinary pipe sentence as a table", () => {
    expect(parseMarkdownTable(["one | two", "not a delimiter"], 0)).toBeNull();
  });
});

describe("workspace note file locations", () => {
  test("recognizes bare paths and Markdown file links", () => {
    expect(
      tokenizeMarkdownInline(
        "Check src/screens/cart.tsx:42 and [the schema](db/schema.sql).",
      ),
    ).toEqual([
      { kind: "text", value: "Check " },
      {
        kind: "file",
        label: "src/screens/cart.tsx:42",
        target: "src/screens/cart.tsx:42",
      },
      { kind: "text", value: " and " },
      { kind: "file", label: "the schema", target: "db/schema.sql" },
      { kind: "text", value: "." },
    ]);
  });

  test("keeps sentence punctuation outside paths and supports hidden files", () => {
    expect(
      tokenizeMarkdownInline("Edit .github/workflows/ci.yml, then check .env."),
    ).toEqual([
      { kind: "text", value: "Edit " },
      {
        kind: "file",
        label: ".github/workflows/ci.yml",
        target: ".github/workflows/ci.yml",
      },
      { kind: "text", value: ", then check " },
      { kind: "file", label: ".env", target: ".env" },
      { kind: "text", value: "." },
    ]);
  });

  test("keeps external links and code spans distinct from file locations", () => {
    expect(
      tokenizeMarkdownInline(
        "[Docs](https://example.com/docs) uses `src/index.ts`.",
      ),
    ).toEqual([
      {
        kind: "external-link",
        label: "Docs",
        target: "https://example.com/docs",
      },
      { kind: "text", value: " uses " },
      { kind: "code", value: "src/index.ts" },
      { kind: "text", value: "." },
    ]);
  });
});
