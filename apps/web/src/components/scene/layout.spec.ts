import { POT_SPOTS, SEED_SPOTS, potAt } from "./layout";

//
//
//
// The table top, from Table.tsx:
// planks 7.8 long (x ±3.9), nine rows
// from z −2.27 at 0.66 apart,
// each 0.64 deep (z −2.59 to 3.33).
// A packet reaches at most its half diagonal
// (√(0.26² + 0.34²) ≈ 0.43)
// from its centre, whatever its turn
const TABLE_HALF_LENGTH = 3.9;
const TABLE_BACK_Z = -2.59;
const TABLE_FRONT_Z = 3.33;
const PACKET_REACH = 0.43;

describe("SEED_SPOTS", () => {
  it("has twelve spots", () => {
    expect(SEED_SPOTS).toHaveLength(12);
  });

  it("keeps every packet on the table", () => {
    for (const [x, z] of SEED_SPOTS) {
      expect(Math.abs(x) + PACKET_REACH).toBeLessThan(TABLE_HALF_LENGTH);
      expect(z - PACKET_REACH).toBeGreaterThan(TABLE_BACK_Z);
      expect(z + PACKET_REACH).toBeLessThan(TABLE_FRONT_Z);
    }
  });
});

describe("potAt", () => {
  it("finds each pot at its centre", () => {
    POT_SPOTS.forEach(([x, z], slot) => {
      expect(potAt(x, z)).toBe(slot);
    });
  });

  it("finds a pot just inside its rim", () => {
    const [x, z] = POT_SPOTS[4];
    expect(potAt(x + 0.85, z)).toBe(4);
  });

  it("misses the strip between neighbouring pots", () => {
    const [backLeft, backMiddle] = POT_SPOTS;
    const frontLeft = POT_SPOTS[3];
    expect(potAt((backLeft[0] + backMiddle[0]) / 2, backLeft[1])).toBeNull();
    expect(potAt(backLeft[0], (backLeft[1] + frontLeft[1]) / 2)).toBeNull();
  });
});
