import { MAX_SLOTS } from "@gitspore/shared";

//
//
//
// Where each slot's pot stands on the table
// used for pots and click targets
const COLUMNS = 3;
const POT_GAP = 2.15;
const BACK_ROW_Z = -1.5;
const ROW_GAP = 1.92;

// How far from a pot's centre a dropped
// seed packet still lands in it:
// a bit more than the rim (0.74),
// less than half the row gap (0.96),
// so no two pots claim the same point
const DROP_RADIUS = 0.9;
// The floor under the table, where the legs end and the grass grows
export const FLOOR_Y = -2;
// The table's top: half its width (x) and its back and front edges (z)
export const TABLE_HALF_WIDTH = 3.9;
export const TABLE_BACK = -2.6;
export const TABLE_FRONT = 3.3;
// Where the overview book lies: front, a little left of the middle, its
// back corner clear of the front pots (z ≈ 1.16), its front corner inside
// the table's edge (z ≈ 3.3)
export const BOOK_SPOT: [number, number] = [-0.4, 2.3];
// How far the book is turned on the table (around y, counter-clockwise
// from above), so it lies diagonally
export const BOOK_TURN = 0.2;

// seed packets position,
// [x, z, turn]: six left of the book and six
// right of the map, in two rows of three each.
const SEED_COLUMNS = [-3.3, -2.55, -1.8, 2.0, 2.7, 3.4];
const SEED_ROWS = [1.62, 2.52];

// git map position.
// under the book's right edge.
// Front edge hanging a little
// over the table's front edge (z ≈ 3.33)
export const MAP_SPOT: [number, number] = [0.8, 2.85];

// The cup of tea: on the table's back right corner, right of pot 3
export const TEACUP_SPOT: [number, number] = [3.3, -2.05];

// The pond in the grass, left of the table's front left leg, where the
// camera sees it in the bottom left of the picture, clear of the
// mushrooms at the leg's foot; and its water's radius
export const POND_SPOT: [number, number] = [-5.3, 2.3];
export const POND_RADIUS = 0.7;

export const POT_SPOTS: [number, number][] = Array.from(
  { length: MAX_SLOTS },
  (_, slot) => {
    const column = slot % COLUMNS;
    const row = Math.floor(slot / COLUMNS);
    const x = (column - (COLUMNS - 1) / 2) * POT_GAP;
    const z = BACK_ROW_Z + row * ROW_GAP;
    return [x, z];
  },
);

// The slot whose pot stands at (x, z),
// or null between and beside the pots.
// Where a dragged seed packet lands
export function potAt(x: number, z: number): number | null {
  const slot = POT_SPOTS.findIndex(
    ([potX, potZ]) => Math.hypot(x - potX, z - potZ) <= DROP_RADIUS,
  );
  return slot === -1 ? null : slot;
}

// Small fixed jitter in place and turn,
// so packets look laid down by hand.
export const SEED_SPOTS: [number, number, number][] = SEED_ROWS.flatMap(
  (z, row) =>
    SEED_COLUMNS.map((x, column): [number, number, number] => {
      const index = row * SEED_COLUMNS.length + column;
      const jitterX = ((index * 13) % 5) * 0.02 - 0.04;
      const jitterZ = ((index * 7) % 3) * 0.04 - 0.04;
      const turn = (((index * 29) % 7) - 3) * 0.035;
      return [x + jitterX, z + jitterZ, turn];
    }),
);
