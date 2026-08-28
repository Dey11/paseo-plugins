import { describe, expect, test } from "bun:test";

const contributionFiles = [
  "plugins/workspace-companion/index.ts",
  "plugins/linear/index.ts",
  "plugins/dev-ports/index.ts",
];
const documentedLucideIcons = new Set([
  "Blocks",
  "CircleDot",
  "ListPlus",
  "PanelsTopLeft",
]);

describe("Paseo client contributions", () => {
  test("uses exported PascalCase Lucide icon names", async () => {
    for (const file of contributionFiles) {
      const source = await Bun.file(file).text();
      const icons = [...source.matchAll(/icon:\s*"([^"]+)"/g)].map(
        (match) => match[1],
      );

      expect(icons.length, `${file} has no registered icons`).toBeGreaterThan(
        0,
      );
      for (const icon of icons) {
        expect(icon, `${file} registers an invalid Lucide icon`).toMatch(
          /^[A-Z][A-Za-z0-9]*$/,
        );
        expect(
          documentedLucideIcons.has(icon ?? ""),
          `${file} uses an icon not demonstrated in the current Paseo docs`,
        ).toBe(true);
      }
    }
  });

  test("keeps Paseo API page requests within the daemon limit", async () => {
    const source = await Bun.file("plugins/dev-ports/ports.server.ts").text();
    const limits = [...source.matchAll(/limit:\s*(\d+)/g)].map((match) =>
      Number(match[1]),
    );

    expect(limits.length).toBeGreaterThan(0);
    for (const limit of limits) expect(limit).toBeLessThanOrEqual(200);
  });

  test("exposes notes and Linear in the workspace tab launcher", async () => {
    const expectations = [
      ["plugins/workspace-companion/index.ts", "notes"],
      ["plugins/linear/index.ts", "linear"],
    ] as const;

    for (const [file, panelId] of expectations) {
      const source = await Bun.file(file).text();
      expect(source).toMatch(
        new RegExp(
          `addWorkspacePanel\\(\\{[\\s\\S]*?id: "${panelId}"[\\s\\S]*?context: "workspace"[\\s\\S]*?\\}\\)`,
        ),
      );
    }
  });

  test("does not execute server-only imports while loading a client entry", async () => {
    for (const file of contributionFiles.filter((path) =>
      path.endsWith("/index.ts"),
    )) {
      const source = await Bun.file(file).text();
      const entryBody = source.slice(
        source.lastIndexOf("import "),
        source.indexOf("export default function contribute"),
      );
      const serverImports = [
        ...source.matchAll(
          /import\s+\{([\s\S]*?)\}\s+from\s+"[^"]+\.server";/g,
        ),
      ].flatMap((match) =>
        (match[1] ?? "")
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean),
      );

      for (const name of serverImports) {
        expect(
          entryBody,
          `${file} executes server-only ${name} while the client bundle loads`,
        ).not.toMatch(new RegExp(`(?:new\\s+)?\\b${name}\\s*\\(`));
      }
    }
  });
});
