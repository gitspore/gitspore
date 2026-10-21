// The repository gitspore works in. Services ask for the path; the ones
// that keep it (WorktreeService, GitHubService) restart when RepoService
// switches repos (#58).

export class RepoConfig {
  constructor(
    private repo: string,
    private base: string,
  ) {}

  repoPath(): string {
    return this.repo;
  }

  baseBranch(): string {
    return this.base;
  }

  set(repo: string, base: string): void {
    this.repo = repo;
    this.base = base;
  }
}
