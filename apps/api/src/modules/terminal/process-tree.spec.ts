import { descendantsOf, killTree, parseProcessTable } from "./process-tree";

describe("parseProcessTable", () => {
  it("reads pid and ppid per line and skips the rest", () => {
    const output = "    1     0\n  412     1\n\n  413   412\ngarbage\n";

    expect(parseProcessTable(output)).toEqual([
      [1, 0],
      [412, 1],
      [413, 412],
    ]);
  });
});

describe("descendantsOf", () => {
  it("finds children and grandchildren, not the process itself", () => {
    const table: [number, number][] = [
      [10, 1],
      [11, 10],
      [12, 10],
      [13, 11],
      [20, 1],
    ];

    expect(descendantsOf(10, table).sort()).toEqual([11, 12, 13]);
  });

  it("is empty for a process without children", () => {
    expect(descendantsOf(20, [[20, 1]])).toEqual([]);
  });

  it("stops at a loop instead of running forever", () => {
    const table: [number, number][] = [
      [11, 10],
      [10, 11],
    ];

    expect(descendantsOf(10, table)).toEqual([11]);
  });
});

describe("killTree", () => {
  it("never signals pid 0 or 1, which would hit our own group or init", async () => {
    const kill = jest.spyOn(process, "kill");

    await killTree(0, "linux");
    await killTree(1, "linux");

    expect(kill).not.toHaveBeenCalled();
    kill.mockRestore();
  });
});
