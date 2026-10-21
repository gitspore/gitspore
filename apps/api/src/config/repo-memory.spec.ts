import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepoMemory } from "./repo-memory";

describe("RepoMemory", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gitspore-memory-"));
    // A folder that doesn't exist yet, like ~/.gitspore on a first start
    file = join(dir, ".gitspore", "config.json");
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("knows no repo without a file", async () => {
    expect(await new RepoMemory(file).recent()).toEqual([]);
  });

  it("remembers the last chosen repo first, each repo once", async () => {
    const memory = new RepoMemory(file);

    await memory.remember({ path: "/a", baseBranch: "main" });
    await memory.remember({ path: "/b", baseBranch: "main" });
    await memory.remember({ path: "/a", baseBranch: "develop" });

    expect(await new RepoMemory(file).recent()).toEqual([
      { path: "/a", baseBranch: "develop" },
      { path: "/b", baseBranch: "main" },
    ]);
  });

  it("keeps five repos", async () => {
    const memory = new RepoMemory(file);
    for (const path of ["/1", "/2", "/3", "/4", "/5", "/6"]) {
      await memory.remember({ path, baseBranch: "main" });
    }

    const paths = (await memory.recent()).map((repo) => repo.path);

    expect(paths).toEqual(["/6", "/5", "/4", "/3", "/2"]);
  });

  it.each([
    ["broken JSON", "{ nope"],
    ["no list", '{ "recent": 3 }'],
  ])("treats a file with %s as none and overwrites it", async (_, text) => {
    const memory = new RepoMemory(file);
    await memory.remember({ path: "/a", baseBranch: "main" });
    await writeFile(file, text);

    expect(await memory.recent()).toEqual([]);
    await memory.remember({ path: "/b", baseBranch: "main" });
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      recent: [{ path: "/b", baseBranch: "main" }],
    });
  });

  it("skips entries that are not repos", async () => {
    const memory = new RepoMemory(file);
    await memory.remember({ path: "/a", baseBranch: "main" });
    await writeFile(
      file,
      JSON.stringify({
        recent: [{ path: 1 }, { path: "/a", baseBranch: "main" }],
      }),
    );

    expect(await memory.recent()).toEqual([{ path: "/a", baseBranch: "main" }]);
  });
});
