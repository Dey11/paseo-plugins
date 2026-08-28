const TASK_LINE = /^(\s*[-*]\s+\[)([ xX])(\]\s.*)$/;

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
