import { create } from "zustand";

//
//
//
// The seed packet being dragged.
// issue:
// the dragged packet's issue number,
// null when no drag
// target: the free pot it would land in,
// null over the table
type SeedDrag = {
  issue: number | null;
  target: number | null;
  start: (issue: number) => void;
  aim: (target: number | null) => void;
  end: () => void;
};

// Not the global store: only the scene needs it
// (packet, camera, pots), and the pointer's position
// never goes in here, only which pot it's over
export const useSeedDrag = create<SeedDrag>()((set) => ({
  issue: null,
  target: null,
  start: (issue) => set({ issue, target: null }),
  aim: (target) => set({ target }),
  end: () => set({ issue: null, target: null }),
}));
