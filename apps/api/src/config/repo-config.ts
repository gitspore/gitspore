// The repository gitspore works in. Services ask for the path
//a later setup screen has to swap this provider.

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
