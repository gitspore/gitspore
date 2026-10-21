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

// Where the overview book lies: front middle, its back edge clear of
// the front pots (z ≈ 1.16), its front edge 0.25 from the table's (z ≈ 3.3)
export const BOOK_SPOT: [number, number] = [0, 2.3];

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
