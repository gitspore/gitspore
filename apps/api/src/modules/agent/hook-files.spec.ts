import { HOOK_EVENTS, hookSettings, statusLineCommand } from "./hook-files";

describe("hookSettings", () => {
  const settings = hookSettings(
    "/usr/bin/node",
    "/app/hook-script.mjs",
    "/app/statusline-script.mjs",
  );

  it("registers the script for every event the status mapping reads", () => {
    expect(Object.keys(settings.hooks).sort()).toEqual([...HOOK_EVENTS].sort());
  });

  it("runs node with the script as its only argument, without a shell", () => {
    for (const groups of Object.values(settings.hooks)) {
      expect(groups).toEqual([
        {
          hooks: [
            {
              type: "command",
              command: "/usr/bin/node",
              args: ["/app/hook-script.mjs"],
              timeout: 5,
            },
          ],
        },
      ]);
    }
  });

  it("keeps paths with spaces as one argument each", () => {
    const windows = hookSettings(
      "C:\\Program Files\\nodejs\\node.exe",
      "D:\\my repo\\hook-script.mjs",
      "D:\\my repo\\statusline-script.mjs",
    );

    expect(windows.hooks.Stop[0].hooks[0]).toMatchObject({
      command: "C:\\Program Files\\nodejs\\node.exe",
      args: ["D:\\my repo\\hook-script.mjs"],
    });
  });

  it("registers the statusline script as the statusline", () => {
    expect(settings.statusLine).toEqual({
      type: "command",
      command: "node '/app/statusline-script.mjs'",
      padding: 0,
    });
  });
});

describe("statusLineCommand", () => {
  it("quotes a Windows path with spaces and turns its backslashes", () => {
    expect(statusLineCommand("D:\\my repo\\dist\\statusline-script.mjs")).toBe(
      "node 'D:/my repo/dist/statusline-script.mjs'",
    );
  });

  it("keeps characters a shell would read in double quotes", () => {
    expect(statusLineCommand("/home/dev/$HOME `x`/s.mjs")).toBe(
      "node '/home/dev/$HOME `x`/s.mjs'",
    );
  });

  it("refuses a path with a single quote", () => {
    expect(() => statusLineCommand("/home/dev/it's/s.mjs")).toThrow(
      /path with '/,
    );
  });
});
