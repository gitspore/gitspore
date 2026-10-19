import { findOnPath } from "./claude-locator";

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
