import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildReviewPlan } from "./review";

const execFileAsync = promisify(execFile);

export async function inspectGitDiff(workspaceId: string, cwd: string) {
  const gitAvailable = await succeeds(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (!gitAvailable) {
    return buildReviewPlan({ workspaceId, generatedAt: new Date().toISOString(), nameStatus: "", numStat: "", porcelain: "", gitAvailable: false });
  }

  const hasHead = await succeeds(cwd, ["rev-parse", "--verify", "HEAD"]);
  const baseArgs = hasHead ? ["HEAD", "--"] : ["--cached", "--"];
  const [nameStatus, numStat, porcelain] = await Promise.all([
    git(cwd, ["diff", "--name-status", ...baseArgs]),
    git(cwd, ["diff", "--numstat", ...baseArgs]),
    git(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]),
  ]);
  return buildReviewPlan({ workspaceId, generatedAt: new Date().toISOString(), nameStatus, numStat, porcelain, gitAvailable: true });
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 5_000_000 });
  return stdout;
}

async function succeeds(cwd: string, args: string[]): Promise<boolean> {
  try {
    await git(cwd, args);
    return true;
  } catch {
    return false;
  }
}
