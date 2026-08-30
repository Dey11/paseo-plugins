const TASK_LINE = /^(\s*[-*]\s+\[)([ xX])(\]\s.*)$/;

export type MarkdownTableAlignment = "left" | "center" | "right";

export interface MarkdownTable {
  headers: string[];
  alignments: MarkdownTableAlignment[];
  rows: string[][];
  endIndex: number;
}

export type MarkdownInlineToken =
  | { kind: "text"; value: string }
  | { kind: "strong"; value: string }
  | { kind: "code"; value: string }
  | { kind: "external-link"; label: string; target: string }
  | { kind: "file"; label: string; target: string };

const FILE_EXTENSION = String.raw`(?:c|cc|cpp|cs|css|csv|go|graphql|h|hpp|html|java|js|jsx|json|kt|lock|lua|md|mdx|mjs|mts|php|prisma|py|rb|rs|scss|sh|sql|svelte|swift|toml|ts|tsx|txt|vue|xml|yaml|yml|zsh)`;
const PATH_SEGMENT = String.raw`(?:\.[A-Za-z0-9_@+-]|[A-Za-z0-9_@])(?:[A-Za-z0-9_@.+-]*[A-Za-z0-9_@+-])?`;
const PATH_WITH_DIRECTORY = String.raw`(?:\.\.?\/|~\/|\/)?(?:${PATH_SEGMENT}\/)+${PATH_SEGMENT}`;
const ROOT_FILE = String.raw`(?:${PATH_SEGMENT}\.${FILE_EXTENSION}|\.(?:env|gitignore|npmrc)|Dockerfile|Makefile)`;
const FILE_POSITION = String.raw`(?::\d+(?::\d+)?)?(?:#L\d+(?:-L\d+)?)?`;
const FILE_LOCATION_SOURCE = String.raw`(?:${PATH_WITH_DIRECTORY}|${ROOT_FILE})${FILE_POSITION}`;
const INLINE_TOKEN_PATTERN = new RegExp(
  String.raw`(\*\*[^*\n]+\*\*|` +
    String.raw`\x60[^\x60\n]+\x60|` +
    String.raw`\[[^\]\n]+\]\([^\s)]+\)|` +
    FILE_LOCATION_SOURCE +
    String.raw`)`,
  "g",
);
const TABLE_DELIMITER = /^:?-{3,}:?$/;

/** Toggles one Markdown task line while preserving its indentation and bullet marker. */
export function toggleMarkdownTask(
  markdown: string,
  lineIndex: number,
): string {
  const lines = markdown.split("\n");
  const line = lines[lineIndex];
  if (line === undefined) return markdown;

  const task = TASK_LINE.exec(line);
  if (!task) return markdown;
  const checked = task[2]?.toLowerCase() === "x";
  lines[lineIndex] = `${task[1]}${checked ? " " : "x"}${task[3]}`;
  return lines.join("\n");
}

/** Parses a GitHub-style pipe table beginning at the requested line. */
export function parseMarkdownTable(
  lines: readonly string[],
  startIndex: number,
): MarkdownTable | null {
  const header = splitTableRow(lines[startIndex] ?? "");
  const delimiter = splitTableRow(lines[startIndex + 1] ?? "");
  if (
    header.length < 2 ||
    delimiter.length !== header.length ||
    !delimiter.every((cell) => TABLE_DELIMITER.test(cell))
  ) {
    return null;
  }

  const rows: string[][] = [];
  let endIndex = startIndex + 1;
  for (let index = startIndex + 2; index < lines.length; index += 1) {
    const cells = splitTableRow(lines[index] ?? "");
    if (cells.length === 0) break;
    rows.push(normalizeTableRow(cells, header.length));
    endIndex = index;
  }

  return {
    headers: header,
    alignments: delimiter.map(tableAlignment),
    rows,
    endIndex,
  };
}

/** Splits the inline Markdown subset used by Notes preview into renderable tokens. */
export function tokenizeMarkdownInline(value: string): MarkdownInlineToken[] {
  const tokens: MarkdownInlineToken[] = [];
  let cursor = 0;
  for (const match of value.matchAll(INLINE_TOKEN_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      tokens.push({ kind: "text", value: value.slice(cursor, start) });
    }

    const raw = match[0];
    const markdownLink = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(raw);
    if (markdownLink) {
      const label = markdownLink[1] ?? "";
      const target = markdownLink[2] ?? "";
      if (/^https?:\/\//i.test(target)) {
        tokens.push({ kind: "external-link", label, target });
      } else if (isFileLocation(target)) {
        tokens.push({ kind: "file", label, target });
      } else {
        tokens.push({ kind: "text", value: raw });
      }
    } else if (raw.startsWith("**")) {
      tokens.push({ kind: "strong", value: raw.slice(2, -2) });
    } else if (raw.startsWith("`")) {
      tokens.push({ kind: "code", value: raw.slice(1, -1) });
    } else {
      tokens.push({ kind: "file", label: raw, target: raw });
    }
    cursor = start + raw.length;
  }
  if (cursor < value.length) {
    tokens.push({ kind: "text", value: value.slice(cursor) });
  }
  return tokens;
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return [];

  let source = trimmed;
  if (source.startsWith("|")) source = source.slice(1);
  if (endsWithUnescapedPipe(source)) source = source.slice(0, -1);

  const cells: string[] = [];
  let cell = "";
  let insideCode = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    if (character === "\\" && source[index + 1] === "|") {
      cell += "|";
      index += 1;
      continue;
    }
    if (character === "`") {
      insideCode = !insideCode;
      cell += character;
      continue;
    }
    if (character === "|" && !insideCode) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += character;
  }
  cells.push(cell.trim());
  return cells;
}

function endsWithUnescapedPipe(value: string): boolean {
  let precedingBackslashes = 0;
  for (let index = value.length - 2; index >= 0; index -= 1) {
    if (value[index] !== "\\") break;
    precedingBackslashes += 1;
  }
  return value.endsWith("|") && precedingBackslashes % 2 === 0;
}

function normalizeTableRow(cells: string[], columnCount: number): string[] {
  return Array.from({ length: columnCount }, (_, index) => cells[index] ?? "");
}

function tableAlignment(delimiter: string): MarkdownTableAlignment {
  const left = delimiter.startsWith(":");
  const right = delimiter.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  return "left";
}

function isFileLocation(value: string): boolean {
  return new RegExp(`^${FILE_LOCATION_SOURCE}$`, "i").test(value);
}
