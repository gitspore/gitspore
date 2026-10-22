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

// Where the overview book lies: front, a little left of the middle, its
// back corner clear of the front pots (z ≈ 1.16), its front corner inside
// the table's edge (z ≈ 3.3)
export const BOOK_SPOT: [number, number] = [-0.4, 2.3];
// How far the book is turned on the table (around y, counter-clockwise
// from above), so it lies diagonally
export const BOOK_TURN = 0.2;
// Where the git map lies: front right of the book, its back left corner
// tucked under the book's right edge, its front edge hanging a little
// over the table's front edge (z ≈ 3.33)
export const MAP_SPOT: [number, number] = [0.8, 2.85];

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
