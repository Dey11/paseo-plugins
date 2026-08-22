import { describe, expect, test } from "bun:test";
import { resolveQaAgentConfig } from "./qa-config.server";

describe("QA agent configuration", () => {
  test("uses portable file settings when the daemon environment is empty", () => {
    expect(
      resolveQaAgentConfig(
        {},
        "PASEO_QA_PROVIDER=codex/gpt-5.5\nPASEO_QA_MODE=review\nPASEO_QA_THINKING=medium",
      ),
    ).toEqual({
      provider: "codex/gpt-5.5",
      modeId: "review",
      thinkingOptionId: "medium",
    });
  });

  test("prefers environment values and lets optional IDs be omitted", () => {
    expect(
      resolveQaAgentConfig(
        {
          PASEO_QA_PROVIDER: "opencode/model",
          PASEO_QA_MODE: "",
          PASEO_QA_THINKING: "",
        },
        "PASEO_QA_PROVIDER=codex/gpt-5.5\nPASEO_QA_MODE=review",
      ),
    ).toEqual({ provider: "opencode/model" });
  });
});
