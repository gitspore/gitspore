import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlanMemory } from "./plan-memory";

const PLAN = {
  fiveHour: { usedPercent: 41, resetsAt: "2026-10-27T12:00:00.000Z" },
  sevenDay: { usedPercent: 12, resetsAt: "2026-10-30T10:00:00.000Z" },
};

describe("PlanMemory", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gitspore-plan-"));
    // A folder that doesn't exist yet, like ~/.gitspore on a first start
    file = join(dir, ".gitspore", "plan.json");
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("knows no plan without a file", async () => {
    expect(await new PlanMemory(file).load()).toBeNull();
  });

  it("gives back the plan it saved", async () => {
    await new PlanMemory(file).save(PLAN);

    expect(await new PlanMemory(file).load()).toEqual(PLAN);
  });

  it("keeps the last of several saves", async () => {
    const memory = new PlanMemory(file);
    const later = { ...PLAN, sevenDay: null };

    await Promise.all([memory.save(PLAN), memory.save(later)]);

    expect(await memory.load()).toEqual(later);
  });

  it.each([
    ["broken JSON", "{ nope"],
    ["no object", "3"],
    ["null", "null"],
  ])("treats a file with %s as none", async (_, text) => {
    const memory = new PlanMemory(file);
    await memory.save(PLAN);
    await writeFile(file, text);

    expect(await memory.load()).toBeNull();
  });

  it("drops a window with odd values and keeps the other", async () => {
    const memory = new PlanMemory(file);
    await memory.save(PLAN);
    await writeFile(
      file,
      JSON.stringify({
        fiveHour: { usedPercent: "41", resetsAt: PLAN.fiveHour.resetsAt },
        sevenDay: PLAN.sevenDay,
      }),
    );

    expect(await memory.load()).toEqual({
      fiveHour: null,
      sevenDay: PLAN.sevenDay,
    });
  });

  it("drops a window without a valid reset time", async () => {
    const memory = new PlanMemory(file);
    await memory.save({
      fiveHour: { usedPercent: 41, resetsAt: "soon" },
      sevenDay: null,
    });

    expect(await memory.load()).toEqual({ fiveHour: null, sevenDay: null });
  });
});
