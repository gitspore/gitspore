import { HOOK_EVENTS, hookSettings } from "./hook-files";

describe("hookSettings", () => {
  const settings = hookSettings("/usr/bin/node", "/app/hook-script.mjs");

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
    );

    expect(windows.hooks.Stop[0].hooks[0]).toMatchObject({
      command: "C:\\Program Files\\nodejs\\node.exe",
      args: ["D:\\my repo\\hook-script.mjs"],
    });
  });
});
