// The repository gitspore works in. Services ask for the path
//on every call instead of storing it,
//so a later setup screen only has to swap this provider.

export class RepoConfig {
  constructor(
    private readonly repo: string,
    private readonly base: string,
  ) {}

  repoPath(): string {
    return this.repo;
  }

  baseBranch(): string {
    return this.base;
  }
}
