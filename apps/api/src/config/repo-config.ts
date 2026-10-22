// The repository gitspore works in, or none yet: then the setup screen
// shows (#58). Services ask for the path; the ones that keep it
// (WorktreeService, GitHubService) restart when RepoService switches repos.

export class RepoConfig {
  constructor(
    private repo: string | null,
    private base: string,
  ) {}

  isSet(): boolean {
    return this.repo !== null;
  }

  /** Throws while no repo is chosen; ask isSet() first. */
  repoPath(): string {
    if (this.repo === null) throw new Error("No repository chosen yet.");
    return this.repo;
  }

  baseBranch(): string {
    return this.base;
  }

  /** null goes back to no repo, when a failed switch is undone. */
  set(repo: string | null, base: string): void {
    this.repo = repo;
    this.base = base;
  }
}
