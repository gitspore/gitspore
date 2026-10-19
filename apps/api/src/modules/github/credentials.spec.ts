import { EnvOrGhCredentials } from "./credentials";

describe("EnvOrGhCredentials", () => {
  it("returns GITHUB_TOKEN when it is set", async () => {
    const runGh = jest.fn().mockResolvedValue("gho_from_gh\n");
    const credentials = new EnvOrGhCredentials(
      { GITHUB_TOKEN: "ghp_from_env" },
      runGh,
    );

    const token = await credentials.getToken();

    expect(token).toBe("ghp_from_env");
  });

  it("does not call gh when GITHUB_TOKEN is set", async () => {
    const runGh = jest.fn().mockResolvedValue("gho_from_gh\n");
    const credentials = new EnvOrGhCredentials(
      { GITHUB_TOKEN: "ghp_from_env" },
      runGh,
    );

    await credentials.getToken();

    expect(runGh).not.toHaveBeenCalled();
  });

  it("uses gh auth token when GITHUB_TOKEN is not set", async () => {
    const runGh = jest.fn().mockResolvedValue("gho_from_gh");
    const credentials = new EnvOrGhCredentials({}, runGh);

    const token = await credentials.getToken();

    expect(token).toBe("gho_from_gh");
  });

  it("uses gh auth token when GITHUB_TOKEN is empty", async () => {
    const runGh = jest.fn().mockResolvedValue("gho_from_gh");
    const credentials = new EnvOrGhCredentials({ GITHUB_TOKEN: "  " }, runGh);

    const token = await credentials.getToken();

    expect(token).toBe("gho_from_gh");
  });

  it("trims the output of gh", async () => {
    const runGh = jest.fn().mockResolvedValue("gho_from_gh\r\n");
    const credentials = new EnvOrGhCredentials({}, runGh);

    const token = await credentials.getToken();

    expect(token).toBe("gho_from_gh");
  });

  it("returns null when gh fails", async () => {
    const runGh = jest.fn().mockRejectedValue(new Error("not logged in"));
    const credentials = new EnvOrGhCredentials({}, runGh);

    const token = await credentials.getToken();

    expect(token).toBeNull();
  });

  it("returns null when gh prints nothing", async () => {
    const runGh = jest.fn().mockResolvedValue("\n");
    const credentials = new EnvOrGhCredentials({}, runGh);

    const token = await credentials.getToken();

    expect(token).toBeNull();
  });
});
