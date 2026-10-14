// Manual test, not part of the daemon or the Jest suite: your own terminal plays one browser tab of an agent's terminal, through TerminalService and a real PTY. Keys go to write, window size to resize, output comes back through the tab's onData. Unix only for now.
//
//   npm run terminal:manual -w @gitspore/api            (types "echo gitspore")
//   npm run terminal:manual -w @gitspore/api -- claude  (starts Claude Code)
//
// End it with "exit" or Ctrl+D in the shell. Quitting the command alone
// leaves you at the shell prompt, like in the real app.
import { spawn } from "node-pty";
import { TerminalService } from "./terminal.service";

//
const OWNER_ID = "socket-1";
const [command = "echo", ...args] =
  process.argv.length > 2 ? process.argv.slice(2) : ["echo", "gitspore"];

const service = new TerminalService(spawn);
service.onExited((agentId, exitCode) => {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  console.log(`\n[onExited] ${agentId} exited with ${exitCode}`);
  process.exit(0);
});

service.spawn({ agentId: "agent-1", cwd: process.cwd(), command, args });
const browserTab = service.attach("agent-1", {
  ownerId: OWNER_ID,
  onData: (chunk) => process.stdout.write(chunk),
  onExit: (exitCode) => console.log(`\n[browserTab onExit] ${exitCode}`),
});

const resizeToWindow = () =>
  service.resize(
    browserTab.sessionId,
    OWNER_ID,
    process.stdout.columns ?? 80,
    process.stdout.rows ?? 24,
  );
resizeToWindow();
process.stdout.on("resize", resizeToWindow);

// Raw mode: keys (Ctrl+C too) go to the shell instead of being handled here.
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.on("data", (bytes) =>
  service.write(browserTab.sessionId, OWNER_ID, bytes.toString("utf8")),
);
