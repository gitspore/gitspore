import type { RepoProblem } from "@gitspore/shared";
import type { RepoRoot } from "@/config/find-repo";

// One text per problem, for the lines of a check and the refusal of a
// switch, so the setup screen and the daemon never say different things.
// loadRepoConfig keeps its own: they are about GITSPORE_REPO, for the log.

type RootProblem = Extract<RepoRoot, { problem: unknown }>["problem"];

export function rootProblem(path: string, problem: RootProblem): RepoProblem {
  return problem === "not_found"
    ? { code: "not_found", message: `${path} does not exist.` }
    : {
        code: "not_a_repo",
        message: `${path} is not a git repository. Run git init there, or choose another folder.`,
      };
}

export function branchProblem(branch: string): RepoProblem {
  return {
    code: "no_base_branch",
    message: `Branch "${branch}" does not exist. Choose another base branch.`,
  };
}

export const NO_CLAUDE: RepoProblem = {
  code: "no_claude",
  message: "Claude Code was not found. Install it, then check again.",
};
