export type GitHubRepo = { owner: string; repo: string };

const PREFIXES = [
  "https://github.com/",
  "git@github.com:",
  "ssh://git@github.com/",
];

export function parseGitHubRemote(url: string): GitHubRepo | null {
  const trimmedUrl = url.trim();
  const prefix = PREFIXES.find((p) => trimmedUrl.startsWith(p));

  if (!prefix) return null;

  const path = trimmedUrl.slice(prefix.length);
  const withoutGit = path.endsWith(".git") ? path.slice(0, -4) : path;
  const parts = withoutGit.split("/");

  if (parts.length !== 2 || parts.includes("")) return null;

  const [owner, repo] = parts;

  return { owner, repo };
}
