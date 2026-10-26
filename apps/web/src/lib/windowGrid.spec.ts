import {
  rowsOfTiles,
  tilesPerRow,
  tileWindows,
  type TileArea,
} from "./windowGrid";

// xterm's default font today, measured in #106: 9.03 × 18 px per cell. A
// tile's chrome: 12 px padding on each side, the 40 px header and its 2 px
// line. The areas are the windows area of these screens, side panel closed
// unless named.
function area(width: number, height: number): TileArea {
  return {
    width,
    height,
    gap: 8,
    chrome: { x: 24, y: 66 },
    cell: { width: 9.03, height: 18 },
  };
}
const laptop = area(1350, 716); // 1440 × 900
const laptopShort = area(1350, 536); // 1440 × 720
const fullHd = area(1830, 896); // 1920 × 1080
const fullHdPanel = area(1416, 896); // 1920 × 1080, side panel open
const wide = area(2470, 896); // 2560 × 1080
const band = area(1350, 392); // scene mode's band

describe("tilesPerRow", () => {
  it("fits 2 on a laptop by falling back to 60 columns", () => {
    expect(tilesPerRow(laptop)).toBe(2);
  });

  it("fits 2 at 1920 px, also with the side panel open", () => {
    expect(tilesPerRow(fullHd)).toBe(2);
    expect(tilesPerRow(fullHdPanel)).toBe(2);
  });

  it("fits 3 at 80 columns on 2560 px", () => {
    expect(tilesPerRow(wide)).toBe(3);
  });

  it("keeps one tile where not even 60 columns fit twice", () => {
    expect(tilesPerRow(area(1000, 716))).toBe(1);
  });
});

describe("rowsOfTiles", () => {
  it("holds one row in scene mode", () => {
    expect(rowsOfTiles("scene", fullHd)).toBe(1);
  });

  it("stacks as many rows in focus mode as keep 10 rows each", () => {
    expect(rowsOfTiles("focus", laptopShort)).toBe(2);
    expect(rowsOfTiles("focus", fullHd)).toBe(3);
  });
});

describe("tileWindows", () => {
  it("places nothing without windows", () => {
    expect(tileWindows([], null, "focus", laptop)).toMatchObject({
      rows: 0,
      placements: [],
      overflow: [],
    });
  });

  it("gives one window the whole area", () => {
    const tiling = tileWindows(["a"], "a", "scene", band);

    expect(tiling.rows).toBe(1);
    expect(tiling.placements).toEqual([
      { agentId: "a", column: 1, columnSpan: tiling.columns, row: 1 },
    ]);
  });

  it("puts two side by side", () => {
    const { placements } = tileWindows(["a", "b"], "b", "scene", band);

    expect(placements.map((p) => [p.column, p.columnSpan, p.row])).toEqual([
      [1, 1, 1],
      [2, 1, 1],
    ]);
  });

  it("puts a third on top as a second row in focus mode (1440 × 720)", () => {
    const tiling = tileWindows(["a", "b", "c"], "c", "focus", laptopShort);

    expect(tiling.rows).toBe(2);
    expect(tiling.placements.map((p) => [p.agentId, p.row])).toEqual([
      ["a", 2],
      ["b", 2],
      ["c", 1],
    ]);
    // Alone on top, it spans the row
    expect(tiling.placements[2].columnSpan).toBe(tiling.columns);
  });

  it("puts three side by side on 2560 px", () => {
    const tiling = tileWindows(["a", "b", "c"], "c", "focus", wide);

    expect(tiling.rows).toBe(1);
    expect(tiling.placements.map((p) => p.column)).toEqual([1, 3, 5]);
    expect(tiling.placements.every((p) => p.columnSpan === 2)).toBe(true);
  });

  it("puts a fourth on top of three on 2560 px", () => {
    const tiling = tileWindows(["a", "b", "c", "d"], "d", "focus", wide);

    // Three in the bottom row, the fourth on top across it
    expect(tiling.placements.map((p) => [p.agentId, p.row])).toEqual([
      ["a", 2],
      ["b", 2],
      ["c", 2],
      ["d", 1],
    ]);
    expect(tiling.placements[3].columnSpan).toBe(tiling.columns);
  });

  it("says when scene mode would need a second row", () => {
    expect(tileWindows(["a", "b"], "b", "scene", band).needsSecondRow).toBe(
      false,
    );
    expect(
      tileWindows(["a", "b", "c"], "c", "scene", band).needsSecondRow,
    ).toBe(true);
  });

  it("returns the oldest windows that don't fit, to minimise", () => {
    const tiling = tileWindows(["a", "b", "c"], "c", "scene", band);

    expect(tiling.overflow).toEqual(["a"]);
    expect(tiling.placements.map((p) => p.agentId)).toEqual(["b", "c"]);
  });

  it("never minimises the focused window, even the oldest", () => {
    const tiling = tileWindows(["a", "b", "c"], "a", "scene", band);

    expect(tiling.overflow).toEqual(["b"]);
  });

  it("shows at most four tiles", () => {
    const tiling = tileWindows(["a", "b", "c", "d", "e"], "e", "focus", fullHd);

    expect(tiling.overflow).toEqual(["a"]);
    expect(tiling.placements).toHaveLength(4);
  });

  it("keeps every tile at 60 columns and 10 rows from 1030 px", () => {
    for (const a of [laptop, laptopShort, fullHd, fullHdPanel, wide]) {
      const tiling = tileWindows(["a", "b", "c", "d"], "d", "focus", a);
      const columnWidth = a.width / tiling.columns;
      const rowHeight = a.height / tiling.rows;
      for (const p of tiling.placements) {
        const width = p.columnSpan * columnWidth - a.gap;
        const height = rowHeight - a.gap;
        expect((width - a.chrome.x) / a.cell.width).toBeGreaterThanOrEqual(60);
        expect((height - a.chrome.y) / a.cell.height).toBeGreaterThanOrEqual(
          10,
        );
      }
    }
  });
});
