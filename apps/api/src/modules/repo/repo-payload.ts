import type { RepoChoosePayload } from "@gitspore/shared";

// Generous limits; they only stop nonsense, not real paths or branches.
const MAX_PATH = 4096;
const MAX_BRANCH = 255;

/**
 * The payload of `repo:check` and `repo:choose` as the daemon can use it, or
 * null when it isn't one. It comes from a browser tab, so nothing about its
 * shape is trusted. The branch goes into `refs/heads/<branch>` as one git
 * argument, never through a shell; refusing spaces and a leading "-" keeps
 * it a plain branch name.
 */
export function parseRepoPayload(
  payload: unknown,
): Required<RepoChoosePayload> | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { path, baseBranch = "main" } = payload as Record<string, unknown>;

  if (typeof path !== "string") return null;
  const trimmed = path.trim();
  if (trimmed === "" || trimmed.length > MAX_PATH) return null;

  if (typeof baseBranch !== "string") return null;
  if (
    baseBranch === "" ||
    baseBranch.length > MAX_BRANCH ||
    /\s/.test(baseBranch) ||
    baseBranch.startsWith("-")
  ) {
    return null;
  }

  return { path: trimmed, baseBranch };
}
