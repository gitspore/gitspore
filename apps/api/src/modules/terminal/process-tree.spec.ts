import {
  descendantsOf,
  killTree,
  parseProcessTable,
  victims,
  type ProcessInfo,
} from "./process-tree";

describe("parseProcessTable", () => {
  it("reads pid and ppid per line (ps) and skips the rest", () => {
    const output = "    1     0\n  412     1\n\n  413   412\ngarbage\n";

    expect(parseProcessTable(output)).toEqual([
      { pid: 1, ppid: 0 },
      { pid: 412, ppid: 1 },
      { pid: 413, ppid: 412 },
    ]);
  });

  it("reads the start time as a third column (Windows)", () => {
    const output = "412 4 1793187755619\r\n413 412 1793187756000\r\n";

    expect(parseProcessTable(output)).toEqual([
      { pid: 412, ppid: 4, started: 1793187755619 },
      { pid: 413, ppid: 412, started: 1793187756000 },
    ]);
  });
});

describe("descendantsOf", () => {
  it("finds children and grandchildren, not the process itself", () => {
    const table: ProcessInfo[] = [
      { pid: 10, ppid: 1 },
      { pid: 11, ppid: 10 },
      { pid: 12, ppid: 10 },
      { pid: 13, ppid: 11 },
      { pid: 20, ppid: 1 },
    ];

    expect(descendantsOf(10, table).sort()).toEqual([11, 12, 13]);
  });

  it("is empty for a process without children", () => {
    expect(descendantsOf(20, [{ pid: 20, ppid: 1 }])).toEqual([]);
  });

  it("stops at a loop instead of running forever", () => {
    const table: ProcessInfo[] = [
      { pid: 11, ppid: 10 },
      { pid: 10, ppid: 11 },
    ];

    expect(descendantsOf(10, table)).toEqual([11]);
  });

  // Windows never updates a parent pid: 11 and its child are left from a
  // process that had pid 10 before ours did.
  it("skips a child that started before its parent, and its children", () => {
    const table: ProcessInfo[] = [
      { pid: 10, ppid: 1, started: 5_000 },
      { pid: 11, ppid: 10, started: 1_000 },
      { pid: 14, ppid: 11, started: 6_000 },
      { pid: 12, ppid: 10, started: 5_000 },
      { pid: 13, ppid: 12, started: 7_000 },
    ];

    expect(descendantsOf(10, table).sort()).toEqual([12, 13]);
  });
});

describe("victims", () => {
  const table: ProcessInfo[] = [
    { pid: 10, ppid: 1, started: 5_000 },
    { pid: 11, ppid: 10, started: 6_000 },
  ];

  it("is the tree, the process last, when the start time matches", () => {
    expect(victims(10, 5_000, table)).toEqual([11, 10]);
  });

  it("is empty when the pid went to a process that started at another time", () => {
    expect(victims(10, 4_000, table)).toEqual([]);
  });

  it("is empty without a start time, and for a pid that is gone", () => {
    expect(victims(10, undefined, table)).toEqual([]);
    expect(victims(99, 5_000, table)).toEqual([]);
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
