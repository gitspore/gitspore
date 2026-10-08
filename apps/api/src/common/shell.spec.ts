import { getDefaultShell } from "./shell";

describe("getDefaultShell", () => {
  it("uses PowerShell on Windows, ignoring $SHELL", () => {
    expect(getDefaultShell("win32", { SHELL: "/bin/zsh" })).toBe(
      "powershell.exe",
    );
  });

  it("uses $SHELL elsewhere", () => {
    expect(getDefaultShell("darwin", { SHELL: "/bin/zsh" })).toBe("/bin/zsh");
  });

  it("falls back to /bin/sh when $SHELL is unset or empty", () => {
    expect(getDefaultShell("linux", {})).toBe("/bin/sh");
    expect(getDefaultShell("linux", { SHELL: "" })).toBe("/bin/sh");
  });
});
