// node-pty 1.1.0 ships its macOS spawn-helper without the executable bit,
// so spawning a PTY fails with "posix_spawnp failed". Restore it after
// install. Remove this script once node-pty publishes a fixed package.
import { chmodSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") process.exit(0);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const prebuilds = join(root, "node_modules", "node-pty", "prebuilds");
if (!existsSync(prebuilds)) process.exit(0);

const fixed = [];
for (const dir of readdirSync(prebuilds, { withFileTypes: true })) {
  if (!dir.isDirectory() || !dir.name.startsWith("darwin-")) continue;
  const helper = join(prebuilds, dir.name, "spawn-helper");
  if (!existsSync(helper)) continue;
  chmodSync(helper, 0o755);
  fixed.push(relative(root, helper));
}

if (fixed.length > 0) {
  console.log(`fix-node-pty-permissions: chmod 755 ${fixed.join(", ")}`);
}
