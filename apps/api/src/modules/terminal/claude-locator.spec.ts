import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFakeClaude } from "../../../test/fake-claude";
import {
  ClaudeLocator,
  systemDeps,
  findOnPath,
  type LocatorDeps,
} from "./claude-locator";

// An exists() that knows a fixed list of files.
const filesExisting =
  (...files: string[]) =>
  async (file: string) =>
    files.includes(file);

describe("findOnPath", () => {
  it("finds a file in the PATH on Windows, reading Path", async () => {
    const found = await findOnPath(
      ["claude.exe", "claude.cmd"],
      { Path: "C:\\a;C:\\b" },
      "win32",
      filesExisting("C:\\b\\claude.exe"),
    );

    expect(found).toBe("C:\\b\\claude.exe");
  });

  it("prefers claude.exe over claude.cmd, whatever the folder order", async () => {
    const found = await findOnPath(
      ["claude.exe", "claude.cmd"],
      { Path: "C:\\a;C:\\b" },
      "win32",
      filesExisting("C:\\a\\claude.cmd", "C:\\b\\claude.exe"),
    );

    expect(found).toBe("C:\\b\\claude.exe");
  });

  it("finds a file in the PATH on Unix", async () => {
    const found = await findOnPath(
      ["claude"],
      { PATH: "/usr/bin:/home/x/.local/bin" },
      "linux",
      filesExisting("/home/x/.local/bin/claude"),
    );

    expect(found).toBe("/home/x/.local/bin/claude");
  });

  it("takes the first folder that has the file", async () => {
    const found = await findOnPath(
      ["claude"],
      { PATH: "/a:/b" },
      "linux",
      filesExisting("/a/claude", "/b/claude"),
    );

    expect(found).toBe("/a/claude");
  });

  it("ignores quotes around an entry and empty entries", async () => {
    const found = await findOnPath(
      ["claude.exe"],
      { Path: ';"C:\\Program Files\\x";' },
      "win32",
      filesExisting("C:\\Program Files\\x\\claude.exe"),
    );

    expect(found).toBe("C:\\Program Files\\x\\claude.exe");
  });

  it.each([{}, { PATH: "" }, { PATH: "/a:/b" }])(
    "returns null when nothing is found (%j)",
    async (env) => {
      expect(
        await findOnPath(["claude"], env, "linux", filesExisting()),
      ).toBeNull();
    },
  );
});

function deps(overrides: Partial<LocatorDeps> = {}): LocatorDeps {
  return {
    env: { PATH: "/bin" },
    platform: "linux",
    exists: filesExisting("/bin/claude"),
    checkVersion: jest.fn(async () => true),
    ...overrides,
  };
}

describe("ClaudeLocator", () => {
  it("finds Claude in the PATH and checks its version", async () => {
    const checkVersion = jest.fn(async () => true);
    const locator = new ClaudeLocator(deps({ checkVersion }));

    expect(await locator.resolve()).toBe("/bin/claude");
    expect(checkVersion).toHaveBeenCalledWith("/bin/claude");
  });

  it("looks only once, also for callers at the same time", async () => {
    const checkVersion = jest.fn(async () => true);
    const locator = new ClaudeLocator(deps({ checkVersion }));

    await Promise.all([locator.resolve(), locator.resolve()]);
    await locator.resolve();

    expect(checkVersion).toHaveBeenCalledTimes(1);
  });

  it("looks again after invalidate", async () => {
    const checkVersion = jest.fn(async () => true);
    const locator = new ClaudeLocator(deps({ checkVersion }));
    await locator.resolve();

    locator.invalidate();
    await locator.resolve();

    expect(checkVersion).toHaveBeenCalledTimes(2);
  });

  it("uses GITSPORE_CLAUDE_BIN instead of the PATH", async () => {
    const locator = new ClaudeLocator(
      deps({
        env: { PATH: "/bin", GITSPORE_CLAUDE_BIN: "/opt/fake-claude" },
        exists: filesExisting("/bin/claude", "/opt/fake-claude"),
      }),
    );

    expect(await locator.resolve()).toBe("/opt/fake-claude");
  });

  it("does not fall back to the PATH when GITSPORE_CLAUDE_BIN points nowhere", async () => {
    const locator = new ClaudeLocator(
      deps({
        env: { PATH: "/bin", GITSPORE_CLAUDE_BIN: "/opt/typo" },
        exists: filesExisting("/bin/claude"),
      }),
    );

    await expect(locator.resolve()).rejects.toMatchObject({
      code: "claude_not_found",
    });
  });

  it("explains how to install Claude when it is not found", async () => {
    const locator = new ClaudeLocator(deps({ exists: filesExisting() }));

    await expect(locator.resolve()).rejects.toMatchObject({
      code: "claude_not_found",
      message: expect.stringContaining("Install"),
    });
  });

  it("refuses a file whose --version fails", async () => {
    const locator = new ClaudeLocator(
      deps({ checkVersion: jest.fn(async () => false) }),
    );

    await expect(locator.resolve()).rejects.toMatchObject({
      code: "claude_not_found",
    });
  });

  it("does not remember a failure", async () => {
    let installed = false;
    const locator = new ClaudeLocator(
      deps({ exists: async (file) => installed && file === "/bin/claude" }),
    );
    await expect(locator.resolve()).rejects.toBeDefined();

    installed = true;

    expect(await locator.resolve()).toBe("/bin/claude");
  });
});

describe("ClaudeLocator with the real system", () => {
  let dir: string;

  beforeEach(() => {
    // A space in the folder name: the normal case for npm's folder on Windows.
    dir = mkdtempSync(join(tmpdir(), "gitspore fake claude "));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("finds the fake Claude through GITSPORE_CLAUDE_BIN and runs --version", async () => {
    const fake = createFakeClaude(dir);
    const locator = new ClaudeLocator({
      ...systemDeps(),
      env: { GITSPORE_CLAUDE_BIN: fake },
    });

    expect(await locator.resolve()).toBe(fake);
  });

  it("says claude_not_found for a file that does not exist", async () => {
    const locator = new ClaudeLocator({
      ...systemDeps(),
      env: { GITSPORE_CLAUDE_BIN: join(dir, "missing") },
    });

    await expect(locator.resolve()).rejects.toMatchObject({
      code: "claude_not_found",
    });
  });
});
