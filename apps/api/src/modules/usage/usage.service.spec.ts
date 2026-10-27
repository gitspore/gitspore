import type { Agent, PatchOp, PlanUsage } from "@gitspore/shared";
import { Logger } from "@nestjs/common";
import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HookService } from "../hooks/hook.service";
import { StateStore } from "../state/state.store";
import type { PlanMemory } from "./plan-memory";
import { UsageService } from "./usage.service";

const NOW = Date.parse("2026-10-27T10:00:00.000Z");
const HOUR = 3600;
// Unix seconds, as Claude Code sends them.
const inHours = (hours: number) => NOW / 1000 + hours * HOUR;
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

const agent = (id: string, overrides: Partial<Agent> = {}): Agent => ({
  id,
  slotIndex: 0,
  issueNumber: 1,
  branch: "spore/1-test",
  worktreePath: "/tmp/worktree",
  status: "working",
  statusSince: "2026-10-27T09:00:00.000Z",
  startedAt: "2026-10-27T09:00:00.000Z",
  pullRequest: null,
  statusReason: null,
  usage: null,
  ...overrides,
});

const statusline = (overrides: Record<string, unknown> = {}) => ({
  session_id: "session-1",
  model: { display_name: "Opus" },
  context_window: { used_percentage: 22 },
  rate_limits: {
    five_hour: { used_percentage: 41, resets_at: inHours(2) },
    seven_day: { used_percentage: 12, resets_at: inHours(72) },
  },
  ...overrides,
});

// Stands in for PlanMemory: keeps the plan in memory, not in ~/.gitspore.
class FakeMemory {
  stored: PlanUsage | null = null;
  readonly save = jest.fn(async (plan: PlanUsage) => {
    this.stored = plan;
  });
  load = async () => this.stored;
}

describe("UsageService", () => {
  let store: StateStore;
  let hooks: HookService;
  let memory: FakeMemory;
  let service: UsageService;
  let ops: PatchOp[];

  // What Nest does at startup: build the service, then call the hook.
  const startService = async () => {
    service = new UsageService(store, hooks, memory as unknown as PlanMemory);
    await service.onModuleInit();
  };

  beforeEach(async () => {
    jest.useFakeTimers({ now: NOW });
    store = new StateStore();
    hooks = new HookService();
    memory = new FakeMemory();
    await startService();
    store.apply([{ type: "agent:upsert", agent: agent("a1") }]);
    ops = [];
    store.onPatch((patch) => ops.push(...patch.ops));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const send = (agentId: string, payload: unknown = statusline()) =>
    hooks.receiveStatusline(agentId, payload);
  const usageOf = (id: string) =>
    store.snapshot().agents.find((a) => a.id === id)?.usage;

  describe("plan limits", () => {
    it("puts both windows into the state", () => {
      send("a1");

      expect(store.snapshot().plan).toEqual({
        fiveHour: { usedPercent: 41, resetsAt: iso(inHours(2)) },
        sevenDay: { usedPercent: 12, resetsAt: iso(inHours(72)) },
      });
    });

    it("sends nothing when the limits haven't changed", () => {
      send("a1");
      ops = [];

      send("a1");

      expect(ops).toEqual([]);
    });

    it("keeps the limits when a statusline has no rate_limits", () => {
      send("a1");
      store.apply([{ type: "agent:upsert", agent: agent("a2") }]);

      // A second agent before its first answer, or one with an API key.
      send("a2", statusline({ rate_limits: undefined }));

      expect(store.snapshot().plan?.fiveHour?.usedPercent).toBe(41);
    });

    it("stays null with an API key", () => {
      send("a1", statusline({ rate_limits: undefined }));

      expect(store.snapshot().plan).toBeNull();
    });

    it("takes the newest statusline of any agent", () => {
      store.apply([{ type: "agent:upsert", agent: agent("a2") }]);
      send("a1");

      send(
        "a2",
        statusline({
          rate_limits: {
            five_hour: { used_percentage: 43, resets_at: inHours(2) },
          },
        }),
      );

      expect(store.snapshot().plan).toEqual({
        fiveHour: { usedPercent: 43, resetsAt: iso(inHours(2)) },
        sevenDay: null,
      });
    });

    it("drops a window at its reset time, also without a new statusline", () => {
      send("a1");

      jest.advanceTimersByTime(2 * HOUR * 1000);

      expect(store.snapshot().plan).toEqual({
        fiveHour: null,
        sevenDay: { usedPercent: 12, resetsAt: iso(inHours(72)) },
      });

      jest.advanceTimersByTime(70 * HOUR * 1000);

      expect(store.snapshot().plan).toEqual({ fiveHour: null, sevenDay: null });
    });

    it("drops a window whose reset time has passed in a late statusline", () => {
      send(
        "a1",
        statusline({
          rate_limits: {
            five_hour: { used_percentage: 100, resets_at: inHours(-1) },
          },
        }),
      );

      expect(store.snapshot().plan).toEqual({ fiveHour: null, sevenDay: null });
    });

    it("saves the limits each time they change", () => {
      send("a1");
      send("a1");
      send(
        "a1",
        statusline({
          rate_limits: {
            five_hour: { used_percentage: 43, resets_at: inHours(2) },
          },
        }),
      );

      expect(memory.save).toHaveBeenCalledTimes(2);
      expect(memory.stored).toEqual({
        fiveHour: { usedPercent: 43, resetsAt: iso(inHours(2)) },
        sevenDay: null,
      });
    });

    it("saves a window dropped at its reset time", () => {
      send("a1");

      jest.advanceTimersByTime(2 * HOUR * 1000);

      expect(memory.stored?.fiveHour).toBeNull();
    });

    it("logs a failed save and keeps the limits in the state", async () => {
      const warn = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => {});
      memory.save.mockRejectedValueOnce(new Error("disk full"));

      send("a1");
      await Promise.resolve();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining("disk full"));
      expect(store.snapshot().plan?.fiveHour?.usedPercent).toBe(41);
    });

    it("keeps the limits across a repo switch", () => {
      send("a1");

      store.setRepo({ path: "/other", baseBranch: "main", github: "off" });

      expect(store.snapshot().plan?.fiveHour?.usedPercent).toBe(41);
    });
  });

  describe("limits from before the start", () => {
    const saved: PlanUsage = {
      fiveHour: { usedPercent: 41, resetsAt: iso(inHours(2)) },
      sevenDay: { usedPercent: 12, resetsAt: iso(inHours(72)) },
    };

    // A fresh daemon: nothing in the state yet.
    beforeEach(() => {
      store = new StateStore();
      hooks = new HookService();
    });

    it("are in the state before any statusline", async () => {
      memory.stored = saved;

      await startService();

      expect(store.snapshot().plan).toEqual(saved);
    });

    it("leave out a window whose reset time passed meanwhile", async () => {
      memory.stored = {
        ...saved,
        fiveHour: { ...saved.fiveHour!, resetsAt: iso(inHours(-1)) },
      };

      await startService();

      expect(store.snapshot().plan).toEqual({
        fiveHour: null,
        sevenDay: saved.sevenDay,
      });
    });

    it("stay away when both windows have passed", async () => {
      memory.stored = {
        fiveHour: { usedPercent: 41, resetsAt: iso(inHours(-1)) },
        sevenDay: null,
      };

      await startService();

      expect(store.snapshot().plan).toBeNull();
    });

    it("still drop a window at its reset time", async () => {
      memory.stored = saved;
      await startService();

      jest.advanceTimersByTime(2 * HOUR * 1000);

      expect(store.snapshot().plan?.fiveHour).toBeNull();
    });

    it("give way to the next statusline", async () => {
      memory.stored = saved;
      await startService();
      store.apply([{ type: "agent:upsert", agent: agent("a1") }]);

      send(
        "a1",
        statusline({
          rate_limits: {
            five_hour: { used_percentage: 60, resets_at: inHours(2) },
          },
        }),
      );

      expect(store.snapshot().plan).toEqual({
        fiveHour: { usedPercent: 60, resetsAt: iso(inHours(2)) },
        sevenDay: null,
      });
    });
  });

  describe("agent usage", () => {
    it("puts context and model on the agent, with no tokens yet", () => {
      send("a1");

      expect(usageOf("a1")).toEqual({
        contextPercent: 22,
        model: "Opus",
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      });
    });

    it("keeps the rest of the agent as it is", () => {
      store.apply([
        {
          type: "agent:upsert",
          agent: agent("a1", { status: "needs_input" }),
        },
      ]);

      send("a1");

      expect(store.snapshot().agents[0]).toMatchObject({
        status: "needs_input",
        usage: { contextPercent: 22 },
      });
    });

    it("sends an agent:upsert only when the usage changed", () => {
      send("a1");
      send("a1");
      send("a1", statusline({ context_window: { used_percentage: 30 } }));

      const upserts = ops.filter((op) => op.type === "agent:upsert");
      expect(upserts).toHaveLength(2);
      expect(usageOf("a1")?.contextPercent).toBe(30);
    });

    it("has no context percentage early in a session", () => {
      send("a1", statusline({ context_window: { used_percentage: null } }));

      expect(usageOf("a1")?.contextPercent).toBeNull();
    });

    it("keeps the usage when a later status change upserts the agent", () => {
      send("a1");
      const [current] = store.snapshot().agents;

      // What AgentService does: the agent from the snapshot, spread.
      store.apply([
        { type: "agent:upsert", agent: { ...current, status: "done" } },
      ]);

      expect(usageOf("a1")?.contextPercent).toBe(22);
    });
  });

  describe("tokens from the session log", () => {
    const USAGE = {
      input_tokens: 2,
      output_tokens: 300,
      cache_read_input_tokens: 40_000,
      cache_creation_input_tokens: 1_000,
    };
    const answer = (requestId: string) =>
      JSON.stringify({
        type: "assistant",
        requestId,
        message: { usage: USAGE },
      }) + "\n";
    let projects: string;
    let log: string;

    // File reads need real timers: fake ones hold back process.nextTick.
    beforeEach(async () => {
      jest.useRealTimers();
      projects = await mkdtemp(join(tmpdir(), "gitspore-projects-"));
      await mkdir(join(projects, "repo"));
      log = join(projects, "repo", "session-1.jsonl");
      service.projectsDir = projects;
    });

    afterEach(async () => {
      await rm(projects, { recursive: true, force: true });
    });

    const sendWithLog = async (path = log) => {
      send("a1", statusline({ transcript_path: path }));
      await service.idle();
    };

    it("puts the tokens of the session log on the agent", async () => {
      await writeFile(log, answer("req-1") + answer("req-1") + answer("req-2"));

      await sendWithLog();

      expect(usageOf("a1")).toEqual({
        contextPercent: 22,
        model: "Opus",
        tokens: {
          input: 4,
          output: 600,
          cacheRead: 80_000,
          cacheWrite: 2_000,
          total: 82_604,
        },
      });
    });

    it("adds what was written since the last statusline", async () => {
      await writeFile(log, answer("req-1"));
      await sendWithLog();

      await appendFile(log, answer("req-2"));
      await sendWithLog();

      expect(usageOf("a1")?.tokens.total).toBe(2 * 41_302);
    });

    it("keeps the tokens when the next statusline changes the context", async () => {
      await writeFile(log, answer("req-1"));
      await sendWithLog();

      send("a1", statusline({ context_window: { used_percentage: 30 } }));

      expect(usageOf("a1")).toMatchObject({
        contextPercent: 30,
        tokens: { total: 41_302 },
      });
    });

    it("reads one more time for a statusline that came during a read", async () => {
      await writeFile(log, answer("req-1"));
      send("a1", statusline({ transcript_path: log }));
      await appendFile(log, answer("req-2"));
      send("a1", statusline({ transcript_path: log }));

      await service.idle();

      expect(usageOf("a1")?.tokens.total).toBe(2 * 41_302);
    });

    it("waits for a log that doesn't exist yet", async () => {
      await sendWithLog();

      expect(usageOf("a1")?.tokens.total).toBe(0);

      await writeFile(log, answer("req-1"));
      await sendWithLog();

      expect(usageOf("a1")?.tokens.total).toBe(41_302);
    });

    it("reads no file outside Claude Code's projects folder", async () => {
      const outside = join(tmpdir(), `gitspore-outside-${process.pid}.jsonl`);
      await writeFile(outside, answer("req-1"));

      try {
        await sendWithLog(outside);
        expect(usageOf("a1")?.tokens.total).toBe(0);
      } finally {
        await rm(outside, { force: true });
      }
    });

    it("starts over for an agent that was removed", async () => {
      await writeFile(log, answer("req-1"));
      await sendWithLog();
      store.apply([{ type: "agent:remove", agentId: "a1" }]);
      store.apply([{ type: "agent:upsert", agent: agent("a1") }]);

      await sendWithLog();

      // A fresh count from the start, not 0 because the old counter has
      // already read the file.
      expect(usageOf("a1")?.tokens.total).toBe(41_302);
    });
  });

  it.each([
    ["an unknown agent", "nobody", statusline()],
    ["a payload that isn't an object", "a1", "not json"],
  ])("ignores %s", (_, agentId, payload) => {
    send(agentId, payload);

    expect(ops).toEqual([]);
    expect(store.snapshot().plan).toBeNull();
  });
});
