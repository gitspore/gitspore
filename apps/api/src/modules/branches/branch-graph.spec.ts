import { parseCommits, parseHeads } from "./branch-graph";

const record = (fields: string[]) => fields.join("\x1f") + "\x1e\n";

const A = "a".repeat(40);
const B = "b".repeat(40);
const C = "c".repeat(40);

describe("parseCommits", () => {
  it("reads hash, parents, author, date and subject per commit", () => {
    const output =
      record([
        B,
        A,
        "Claude",
        "2026-10-23T11:15:00+02:00",
        "toggle in header",
      ]) + record([A, "", "Thomas", "2026-10-22T08:00:00+00:00", "initial"]);

    expect(parseCommits(output)).toEqual([
      {
        sha: B,
        parents: [A],
        author: "Claude",
        date: "2026-10-23T09:15:00.000Z",
        subject: "toggle in header",
      },
      {
        sha: A,
        parents: [],
        author: "Thomas",
        date: "2026-10-22T08:00:00.000Z",
        subject: "initial",
      },
    ]);
  });

  it("keeps both parents of a merge commit", () => {
    const output = record([
      C,
      `${A} ${B}`,
      "Thomas",
      "2026-10-23T09:00:00Z",
      "Merge pull request #9",
    ]);

    expect(parseCommits(output)[0].parents).toEqual([A, B]);
  });

  it("keeps tabs and commas in the subject", () => {
    const output = record([A, "", "Thomas", "2026-10-23T09:00:00Z", "a,\tb"]);

    expect(parseCommits(output)[0].subject).toBe("a,\tb");
  });

  it("returns nothing for empty output", () => {
    expect(parseCommits("")).toEqual([]);
  });
});

describe("parseHeads", () => {
  const output = [
    "111 refs/heads/main",
    "222 refs/heads/spore/12-login-redirect",
    "333 refs/heads/spore/21-dark-mode",
    "444 refs/remotes/origin/main",
    "",
  ].join("\n");

  it("takes the base branch from origin, then the spore branches", () => {
    expect(parseHeads(output, "main")).toEqual([
      { branch: "main", sha: "444" },
      { branch: "spore/12-login-redirect", sha: "222" },
      { branch: "spore/21-dark-mode", sha: "333" },
    ]);
  });

  it("falls back to the local base branch without origin", () => {
    expect(parseHeads("111 refs/heads/main\n", "main")).toEqual([
      { branch: "main", sha: "111" },
    ]);
  });

  it("leaves the base branch out if it doesn't exist", () => {
    expect(parseHeads("222 refs/heads/spore/12-x\n", "main")).toEqual([
      { branch: "spore/12-x", sha: "222" },
    ]);
  });
});
