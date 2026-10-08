import { applyPatch } from "@gitspore/shared";
import type { Agent, Issue, PatchOp } from "@gitspore/shared";
import { StateStore } from "./state.store";

const issue = (number: number, title = `Issue ${number}`): Issue => ({
  number,
  title,
  url: `https://github.com/gitspore/gitspore/issues/${number}`,
  labels: [],
});

const agent = (id: string, slotIndex: number | null = 0): Agent => ({
  id,
  slotIndex,
  issueNumber: 1,
  branch: "spore/1-test",
  worktreePath: "/tmp/worktree",
  status: "working",
  statusSince: "2026-10-08T10:00:00.000Z",
  startedAt: "2026-10-08T10:00:00.000Z",
});

describe("StateStore", () => {
  let store: StateStore;

  beforeEach(() => {
    store = new StateStore();
  });

  describe("initial state", () => {
    it("starts at version 0 without agents and issues", () => {
      expect(store.snapshot()).toEqual({ version: 0, agents: [], issues: [] });
    });
  });

  describe("apply", () => {
    it("raises the version by exactly one per call", () => {
      expect(
        store.apply([{ type: "issue:upsert", issue: issue(1) }])?.version,
      ).toBe(1);
      expect(
        store.apply([{ type: "issue:upsert", issue: issue(2) }])?.version,
      ).toBe(2);
      expect(store.snapshot().version).toBe(2);
    });

    it("raises the version once for a patch with several ops", () => {
      store.apply([
        { type: "issue:upsert", issue: issue(1) },
        { type: "issue:upsert", issue: issue(2) },
        { type: "issue:upsert", issue: issue(3) },
      ]);

      expect(store.snapshot().version).toBe(1);
      expect(store.snapshot().issues).toHaveLength(3);
    });

    it("applies the ops in order", () => {
      store.apply([
        { type: "issue:upsert", issue: issue(1, "first") },
        { type: "issue:upsert", issue: issue(1, "second") },
      ]);
      expect(store.snapshot().issues).toEqual([issue(1, "second")]);

      store.apply([
        { type: "issue:upsert", issue: issue(2) },
        { type: "issue:remove", issueNumber: 2 },
      ]);
      expect(store.snapshot().issues).toEqual([issue(1, "second")]);
    });

    it("returns the patch with the ops it was given", () => {
      const ops: PatchOp[] = [{ type: "agent:upsert", agent: agent("a1") }];

      expect(store.apply(ops)).toEqual({ version: 1, ops });
    });

    it("keeps agents and issues apart", () => {
      store.apply([
        { type: "agent:upsert", agent: agent("a1") },
        { type: "issue:upsert", issue: issue(1) },
      ]);

      const state = store.snapshot();
      expect(state.agents.map((a) => a.id)).toEqual(["a1"]);
      expect(state.issues.map((i) => i.number)).toEqual([1]);
    });

    it("returns null and keeps the version for an empty ops list", () => {
      expect(store.apply([])).toBeNull();
      expect(store.snapshot().version).toBe(0);
    });
  });

  describe("snapshot", () => {
    it("returns a copy: changing it does not change the store", () => {
      store.apply([{ type: "issue:upsert", issue: issue(1) }]);

      const copy = store.snapshot();
      copy.version = 99;
      copy.issues.push(issue(2));
      copy.issues[0].title = "changed";

      expect(store.snapshot()).toEqual({
        version: 1,
        agents: [],
        issues: [issue(1)],
      });
    });

    it("is not changed by a later apply", () => {
      const before = store.snapshot();

      store.apply([{ type: "issue:upsert", issue: issue(1) }]);

      expect(before).toEqual({ version: 0, agents: [], issues: [] });
    });
  });

  describe("patches and clients", () => {
    it("produces a patch that applyPatch accepts on the previous snapshot", () => {
      const before = store.snapshot();

      const patch = store.apply([{ type: "issue:upsert", issue: issue(1) }]);
      const result = applyPatch(before, patch!);

      expect(result.status).toBe("applied");
      if (result.status === "applied") {
        expect(result.state).toEqual(store.snapshot());
      }
    });

    it("keeps a client in sync over several patches", () => {
      let client = store.snapshot();

      const batches: PatchOp[][] = [
        [{ type: "issue:upsert", issue: issue(1) }],
        [{ type: "agent:upsert", agent: agent("a1") }],
        [{ type: "issue:remove", issueNumber: 1 }],
      ];

      for (const ops of batches) {
        const patch = store.apply(ops)!;
        const result = applyPatch(client, patch);
        expect(result.status).toBe("applied");
        if (result.status === "applied") client = result.state;
      }

      expect(client).toEqual(store.snapshot());
    });

    it("reports a gap to a client that missed a patch", () => {
      const stale = store.snapshot();

      store.apply([{ type: "issue:upsert", issue: issue(1) }]);
      const second = store.apply([{ type: "issue:upsert", issue: issue(2) }])!;

      expect(applyPatch(stale, second).status).toBe("gap");
    });
  });

  describe("onPatch", () => {
    it("notifies listeners of every patch in order", () => {
      const versions: number[] = [];
      store.onPatch((patch) => versions.push(patch.version));

      store.apply([{ type: "issue:upsert", issue: issue(1) }]);
      store.apply([{ type: "issue:upsert", issue: issue(2) }]);

      expect(versions).toEqual([1, 2]);
    });

    it("notifies every listener", () => {
      const first = jest.fn();
      const second = jest.fn();
      store.onPatch(first);
      store.onPatch(second);

      store.apply([{ type: "issue:upsert", issue: issue(1) }]);

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
    });

    it("does not notify for an empty ops list", () => {
      const listener = jest.fn();
      store.onPatch(listener);

      store.apply([]);

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
