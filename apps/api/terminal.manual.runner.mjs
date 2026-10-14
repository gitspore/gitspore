// Starts src/modules/terminal/terminal.manual.ts on every OS. An npm script
// can't set environment variables portably (VAR=value fails in cmd.exe),
// so they are set here before ts-node and tsconfig-paths read them.

import { createRequire } from "node:module";
import process from "node:process";

const require = createRequire(import.meta.url);

// tsconfig.json has "paths" but no "baseUrl"; tsconfig-paths needs one.
process.env.TS_NODE_BASEURL = ".";
// Skip type checking: faster start, and lint/typecheck cover it anyway.
process.env.TS_NODE_TRANSPILE_ONLY = "1";

require("ts-node/register");
require("tsconfig-paths/register");
require("./src/modules/terminal/terminal.manual.ts");
