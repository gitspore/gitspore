import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepoTokens } from "./repo-tokens";

describe("RepoTokens", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gitspore-repo-tokens-"));
    // A folder that doesn't exist yet, like ~/.gitspore on a first start
    file = join(dir, ".gitspore", "usage.json");
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("is 0 for a repo with nothing counted", () => {
    expect(new RepoTokens(file).total("/repo")).toBe(0);
  });

  it("adds each request once, with its largest count", () => {
    const totals = new RepoTokens(file);

    expect(
      totals.add("/repo", [
        ["req-1", 100],
        ["req-2", 50],
      ]),
    ).toBe(true);
    // The same requests again, as from a log copied by --continue, and one
    // that grew.
    expect(totals.add("/repo", [["req-1", 100]])).toBe(false);
    expect(totals.add("/repo", [["req-2", 80]])).toBe(true);

    expect(totals.total("/repo")).toBe(180);
  });

  it("keeps the repos apart", () => {
    const totals = new RepoTokens(file);

    totals.add("/a", [["req-1", 100]]);
    totals.add("/b", [["req-1", 7]]);

    expect(totals.total("/a")).toBe(100);
    expect(totals.total("/b")).toBe(7);
  });

  it("skips counts that aren't positive whole numbers", () => {
    const totals = new RepoTokens(file);

    totals.add("/repo", [
      ["zero", 0],
      ["negative", -5],
      ["text", "100"],
      ["fraction", 1.5],
    ]);

    expect(totals.total("/repo")).toBe(0);
  });

  it("gives back what it saved", async () => {
    const totals = new RepoTokens(file);
    totals.add("/repo", [
      ["req-1", 100],
      ["req-2", 50],
    ]);
    await totals.save();

    const loaded = new RepoTokens(file);
    await loaded.load();

    expect(loaded.total("/repo")).toBe(150);
    // The ids came along: the same request isn't counted again.
    expect(loaded.add("/repo", [["req-1", 100]])).toBe(false);
  });

  it("keeps the last of several saves", async () => {
    const totals = new RepoTokens(file);
    totals.add("/repo", [["req-1", 100]]);
    const first = totals.save();
    totals.add("/repo", [["req-2", 50]]);
    await Promise.all([first, totals.save()]);

    const loaded = new RepoTokens(file);
    await loaded.load();

    expect(loaded.total("/repo")).toBe(150);
  });

  it.each([
    ["no file", null],
    ["broken JSON", "{ nope"],
    ["no repos", '{ "repos": 3 }'],
    ["null", "null"],
  ])("starts empty with %s", async (_, text) => {
    if (text !== null) {
      await new RepoTokens(file).save();
      await writeFile(file, text);
    }
    const totals = new RepoTokens(file);

    await totals.load();

    expect(totals.total("/repo")).toBe(0);
  });

  it("skips a repo whose requests aren't an object", async () => {
    await new RepoTokens(file).save();
    await writeFile(
      file,
      JSON.stringify({ repos: { "/bad": 3, "/repo": { "req-1": 100 } } }),
    );
    const totals = new RepoTokens(file);

    await totals.load();

    expect(totals.total("/repo")).toBe(100);
    expect(totals.total("/bad")).toBe(0);
  });
});
