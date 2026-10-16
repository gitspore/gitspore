import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Where the GitHub token comes from. A later GitHub login (device flow)
// replaces only the provider, not the service that uses it.
export abstract class GitHubCredentialsProvider {
  abstract getToken(): Promise<string | null>;
}

// Throws when gh is missing, not logged in or too slow.
type RunGhAuthToken = () => Promise<string>;

// GITHUB_TOKEN from the environment, then `gh auth token`, otherwise none.
export class EnvOrGhCredentials extends GitHubCredentialsProvider {
  constructor(
    private readonly env: NodeJS.ProcessEnv,
    private readonly runGhAuthToken: RunGhAuthToken,
  ) {
    super();
  }

  async getToken(): Promise<string | null> {
    const fromEnv = this.env.GITHUB_TOKEN?.trim();
    if (fromEnv) return fromEnv;

    try {
      const fromGh = (await this.runGhAuthToken()).trim();
      return fromGh || null;
    } catch {
      // The error of gh is dropped on purpose: nothing from this path may
      // end up in a log.
      return null;
    }
  }
}

// execFile, not exec: no shell. The timeout keeps a hanging gh from
// blocking the daemon's start.
export async function ghAuthToken(): Promise<string> {
  const { stdout } = await execFileAsync("gh", ["auth", "token"], {
    timeout: 5_000,
  });
  return stdout;
}
