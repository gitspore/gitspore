import { parseRepoPayload } from "./repo-payload";

describe("parseRepoPayload", () => {
  it("takes a path and a branch, main by default, the path trimmed", () => {
    expect(parseRepoPayload({ path: " /r ", baseBranch: "dev" })).toEqual({
      path: "/r",
      baseBranch: "dev",
    });
    expect(parseRepoPayload({ path: "/r" })).toEqual({
      path: "/r",
      baseBranch: "main",
    });
  });

  it("keeps branch names with slashes and dots", () => {
    expect(
      parseRepoPayload({ path: "/r", baseBranch: "release/1.2" }),
    ).toMatchObject({ baseBranch: "release/1.2" });
  });

  it.each([
    ["no payload", undefined],
    ["null", null],
    ["a string", "/r"],
    ["no path", {}],
    ["a path that is not a string", { path: 42 }],
    ["an empty path", { path: "   " }],
    ["a very long path", { path: "/" + "a".repeat(5000) }],
    ["a branch that is not a string", { path: "/r", baseBranch: 1 }],
    ["an empty branch", { path: "/r", baseBranch: "" }],
    ["a branch with a space", { path: "/r", baseBranch: "my branch" }],
    ["a branch that looks like an option", { path: "/r", baseBranch: "-x" }],
  ])("refuses %s", (_, payload) => {
    expect(parseRepoPayload(payload)).toBeNull();
  });
});
