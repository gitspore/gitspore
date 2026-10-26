import { SEED_SPOTS } from "./layout";

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
