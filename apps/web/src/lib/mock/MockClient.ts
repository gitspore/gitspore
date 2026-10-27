import {
  Agent,
  applyPatch,
  BRANCH_PREFIX,
  type ClientToServerEvents,
  type GreenhouseState,
  type PatchOp,
  type RepoCheck,
  type RepoInfo,
  type RepoProblem,
  type ServerToClientEvents,
  type StatePatch,
} from "@gitspore/shared";
import { ConnectionStatus, GreenhouseClient } from "../client/GreenhouseClient";
import { ScenarioPlayer } from "./ScenarioPlayer";
import { Scenario, ScenarioEntry } from "./scenario";
import { Clock, realClock, TimerHandle } from "./clock";
import { ConnectionStatusSource } from "../client/ConnectionStatusSource";

type AnyListener = ServerToClientEvents[keyof ServerToClientEvents];

// How long a dispatched agent stays in "starting" before it is "working".
const WORKING_AFTER_MS = 1500;
// What a freshly opened terminal prints, one chunk per LINE_DELAY_MS.
const GREETING = ["Claude Code (mock)\r\n", "> ready\r\n", "$ "];
const LINE_DELAY_MS = 150;

// One handler per command the UI can send (ClientToServerEvents). Commands
// without an entry are ignored.

type Handlers = {
  [E in keyof ClientToServerEvents]?: (
    ...args: Parameters<ClientToServerEvents[E]>
  ) => void;
};

/**
 * A GreenhouseClient without a daemon. It plays a scenario from
 * apps/web/mocks/scenarios/ and answers the UI's commands itself, so
 * components use it exactly like the real socket client.
 *
 * What the UI receives:
 * - connect() sends `state:snapshot` with the scenario's start state, then
 *   the scenario's events at their `at` times (`state:patch`, `terminal:data`,
 *   `error`, ...). The timestamps are shifted so the scenario's anchor is the
 *   moment of connect(): an agent that waited 20 minutes before the anchor has
 *   waited 20 minutes when the UI connects.
 * - Commands are answered locally, see `handlers`: `agent:dispatch`,
 *   `agent:stop`, `repo:check`, `repo:choose`, `terminal:open`, `terminal:input`, `terminal:close`,
 *   `state:request` and `issues:refresh`. Every other command
 *   (`terminal:resize`) does nothing.
 * - Versions follow the contract: a patch is numbered after the one before.
 *   A command like `agent:dispatch` adds patches of its own, and the
 *   scenario's later patches are renumbered behind them, so nothing arrives
 *   stale. A version the scenario skips on purpose (the `stress` scenario)
 *   stays skipped: the UI sees the gap, sends `state:request`, and gets a
 *   snapshot of the state as of the latest patch it was sent.
 *
 * Register listeners with on() before connect(). The snapshot is sent
 * synchronously inside connect(), so a listener added afterwards misses it.
 * Commands sent before connect() are kept and run right after the snapshot,
 * like the send buffer of Socket.io.
 */
export class MockClient implements GreenhouseClient {
  private readonly listeners = new Map<
    keyof ServerToClientEvents,
    Set<AnyListener>
  >();
  private readonly player: ScenarioPlayer;
  /** Name of the scenario being played, for a dev overlay. */
  readonly scenarioName: string;

  // The state as the UI has it: every patch sent is applied here as well.
  // This is what a snapshot on request contains.
  private state: GreenhouseState = {
    agents: [],
    issues: [],
    version: 0,
    repo: null,
    plan: null,
    repoTokens: null,
  };
  // How far the mock's own patches have pushed the scenario's version
  // numbers. A scenario patch is sent as `version + versionOffset`.
  private versionOffset = 0;
  // Counter for the ids of agents and sessions the mock makes up.
  private nextId = 1;
  // Terminal sessions that are open, by id.
  private sessions = new Set<string>();
  // Timers the mock plans itself (new agent turns "working", terminal
  // greeting), so disconnect() can cancel them.
  private timers = new Set<TimerHandle>();
  // True between connect() and disconnect().
  private connected = false;
  // The current connection status
  private statusSource = new ConnectionStatusSource({
    kind: "offline",
    reason: "Not connected yet",
  });
  // Commands emitted while not connected, run by the next connect().
  private queued: (() => void)[] = [];
  private readonly handlers: Handlers = {
    // The UI asks for the full state, e.g. after it saw a version gap.
    "state:request": () => this.sendSnapshot(),
    // There is no GitHub here. The snapshot contains the issue list, and a
    // patch would take a version number the scenario still plans to use.
    "issues:refresh": () => this.sendSnapshot(),
    // Acks with a new agent id, then sends the agent as a patch: first
    // "starting", WORKING_AFTER_MS later "working". The slot and the issue
    // are not checked, so the same slot can be dispatched twice.
    "agent:dispatch": (payload, ack) => {
      const agentId = `mock-agent-${this.nextId++}`;
      const now = new Date(this.player.virtualNow()).toISOString();
      const agent: Agent = {
        id: agentId,
        slotIndex: payload.slotIndex,
        issueNumber: payload.issueNumber,
        branch: `${BRANCH_PREFIX}${payload.issueNumber}-mock`,
        worktreePath: `/mock/.worktrees/${payload.issueNumber}`,
        status: "starting",
        statusSince: now,
        startedAt: now,
        pullRequest: null,
        statusReason: null,
        usage: null,
      };
      ack({ agentId });
      this.sendPatch([{ type: "agent:upsert", agent }]);
      this.later(() => {
        const at = new Date(this.player.virtualNow()).toISOString();
        this.sendPatch([
          {
            type: "agent:upsert",
            agent: { ...agent, status: "working", statusSince: at },
          },
        ]);
      }, WORKING_AFTER_MS);
    },
    // Removes the agent with an `agent:remove` patch. The worktree is not
    // checked, so a stop is never refused. An unknown agent arrives as an
    // `error` event, as with the real daemon. A later scenario patch for the
    // same agent brings it back: the scenario does not know it was stopped.
    "agent:stop": ({ agentId }) => {
      if (!this.state.agents.some((a) => a.id === agentId)) {
        this.deliver("error", {
          code: "agent_not_found",
          message: `No agent ${agentId}`,
          context: { agentId },
        });
        return;
      }
      this.sendPatch([{ type: "agent:remove", agentId }]);
    },

    // The texts are the daemon's (apps/api/src/modules/repo/repo-problems.ts).
    // There is no disk here: words in the path say what the check finds:
    // "missing", "not-git", "no-branch", "no-github", "no-claude". Every
    // other path is a git repo with the branch, GitHub and Claude Code.
    "repo:check": ({ path, baseBranch = "main" }, ack) => {
      const name = path.split("/").filter(Boolean).at(-1) ?? path;
      const checks: RepoCheck[] = [];
      if (path.includes("missing")) {
        checks.push({
          item: "git",
          result: "fail",
          detail: `${path} does not exist.`,
        });
      } else if (path.includes("not-git")) {
        checks.push({
          item: "git",
          result: "fail",
          detail: `${path} is not a git repository. Run git init there, or choose another folder.`,
        });
      } else {
        checks.push(
          { item: "git", result: "ok", detail: name },
          path.includes("no-branch")
            ? {
                item: "base_branch",
                result: "fail",
                detail: `Branch "${baseBranch}" does not exist. Choose another base branch.`,
              }
            : {
                item: "base_branch",
                result: "ok",
                detail: `${baseBranch} exists`,
              },
          path.includes("no-github")
            ? {
                item: "github",
                result: "warn",
                detail: "No GitHub remote. Agents work, issues don't sync.",
              }
            : {
                item: "github",
                result: "ok",
                detail: `gitspore/${name} · ${this.state.issues.length} open`,
              },
        );
      }
      checks.push(
        path.includes("no-claude")
          ? {
              item: "claude",
              result: "fail",
              detail:
                "Claude Code was not found. Install it, then check again.",
            }
          : { item: "claude", result: "ok", detail: "found" },
      );
      ack({ checks });
    },

    // The path words of repo:check apply here too. Agents with a slot block
    // a switch, the overview agent does not (the switch restarts it). On
    // success the mock "moves into" the repo: the scenario stops, the agents
    // go, the issues stay so the greenhouse has something to plant, and
    // every listener gets a snapshot.
    "repo:choose": ({ path, baseBranch = "main" }, ack) => {
      const problems: RepoProblem[] = [];
      if (path.includes("missing")) {
        problems.push({
          code: "not_found",
          message: `${path} does not exist.`,
        });
      } else if (path.includes("not-git")) {
        problems.push({
          code: "not_a_repo",
          message: `${path} is not a git repository. Run git init there, or choose another folder.`,
        });
      } else if (path.includes("no-branch")) {
        problems.push({
          code: "no_base_branch",
          message: `Branch "${baseBranch}" does not exist. Choose another base branch.`,
        });
      }
      if (path.includes("no-claude")) {
        problems.push({
          code: "no_claude",
          message: "Claude Code was not found. Install it, then check again.",
        });
      }
      if (this.state.agents.some((a) => a.slotIndex !== null)) {
        problems.push({
          code: "agents_running",
          message: "Agents are still running. Stop them before switching.",
        });
      }
      if (problems.length > 0) {
        ack({ problems });
        return;
      }

      const repo: RepoInfo = {
        path,
        baseBranch,
        github: path.includes("no-github") ? "off" : "on",
      };
      ack({ repo });
      // The scenario plays in the old repo; its later events don't belong here.
      this.player.stop();
      this.state = {
        ...this.state,
        version: this.state.version + 1,
        repo,
        agents: [],
      };
      this.sendSnapshot();
    },

    // Acks with a session id for a known agent (from the scenario or from a
    // dispatch), then prints GREETING. An unknown agent gets an error ack.
    "terminal:open": (payload, ack) => {
      if (!this.state.agents.some((a) => a.id === payload.agentId)) {
        ack({
          error: {
            code: "agent_not_found",
            message: `No agent ${payload.agentId}`,
          },
        });
        return;
      }
      const sessionId = `mock-session-${this.nextId++}`;
      this.sessions.add(sessionId);
      ack({ sessionId });
      GREETING.forEach((chunk, i) => {
        this.later(
          () => {
            // The client may have closed the session in the meantime.
            if (this.sessions.has(sessionId)) {
              this.deliver("terminal:data", { sessionId, chunk });
            }
          },
          (i + 1) * LINE_DELAY_MS,
        );
      });
    },
    // The "shell" only echoes what was typed. Input to a session that is not
    // open arrives as an `error` event, as with the real daemon.
    "terminal:input": ({ sessionId, data }) => {
      if (!this.sessions.has(sessionId)) {
        this.deliver("error", {
          code: "session_not_found",
          message: `No session ${sessionId}`,
        });
        return;
      }
      // xterm reports Enter as \r; a terminal shows it as \r\n.
      this.deliver("terminal:data", {
        sessionId,
        chunk: data.replace(/\r/g, "\r\n"),
      });
    },
    // Detaches the session. Pending greeting lines are dropped.
    "terminal:close": ({ sessionId }) => {
      this.sessions.delete(sessionId);
    },
  };

  /**
   * @param scenario What to play, e.g. `getScenario("core-loop")`.
   * @param clock Time source. The default is the real clock; specs pass a
   *   fake one to run a scenario without waiting.
   */
  constructor(
    scenario: Scenario,
    private readonly clock: Clock = realClock,
  ) {
    this.scenarioName = scenario.name;
    this.player = new ScenarioPlayer(
      scenario,
      (entry) => this.dispatch(entry),
      clock,
    );
  }

  /**
   * Starts the scenario: `state:snapshot` now, the rest as time passes. Like
   * the real socket, listeners must be registered before connect(). Calling
   * it again restarts the scenario from the beginning and drops what the
   * mock had planned or opened (see disconnect()). The speed is kept.
   *
   * Commands that were emitted while not connected run now, in their order,
   * after the snapshot.
   */
  connect(): void {
    this.reset();
    this.statusSource.set({ kind: "connected" });
    this.player.start();
    this.connected = true;

    const queued = this.queued;
    this.queued = [];
    queued.forEach((run) => run());
  }

  /**
   * Stops playing and drops everything the mock had planned: scenario
   * events, the "working" turn of a dispatched agent, open terminal sessions.
   * Listeners stay registered, so connect() can be called again.
   */
  disconnect(): void {
    this.reset();
    this.statusSource.set({ kind: "offline", reason: "Disconnected" });
  }

  private reset(): void {
    this.connected = false;
    this.player.stop();
    this.timers.forEach((t) => this.clock.clearTimeout(t));
    this.timers.clear();
    this.sessions.clear();
  }

  // --- Playback controls (dev overlay) ---------------------------------
  // Not part of GreenhouseClient: the real socket has nothing like them. Code
  // that wants them checks `client instanceof MockClient`.
  // They steer the scenario only. What the mock plans itself (a dispatched
  // agent turning "working", the terminal greeting) runs in real time.

  /** Same as connect(): plays the scenario again from the start. */
  restart(): void {
    this.connect();
  }

  /** Holds the scenario back until resume(). Does nothing if not playing. */
  pause(): void {
    this.player.pause();
  }

  resume(): void {
    this.player.resume();
  }

  /**
   * Plays the scenario `factor` times as fast: 10 shows a 60 s stage in 6 s.
   * Allowed at any time; it is kept across restart().
   */
  setSpeed(factor: number): void {
    this.player.setSpeed(factor);
  }

  get speed(): number {
    return this.player.speed;
  }

  get isPaused(): boolean {
    return this.player.isPaused;
  }

  /**
   * "Now" inside the scenario, in the same timeline as the timestamps of
   * statusSince and startedAt. At speed above 1 it runs faster than the
   * clock and it stands still while paused, so derive an agent's waiting time
   * as `virtualNow() - Date.parse(statusSince)`, not from Date.now(). That is
   * what makes the wilting stages play at speed.
   */
  virtualNow(): number {
    return this.player.virtualNow();
  }

  now(): number {
    return this.virtualNow();
  }

  getStatus(): ConnectionStatus {
    return this.statusSource.get();
  }

  subscribeStatus(listener: () => void): () => void {
    return this.statusSource.subscribe(listener);
  }

  /**
   * Sends a command. It is answered right away (acks run synchronously) and
   * anything that follows arrives as a normal event. Commands the mock does
   * not know are ignored and their ack is never called.
   *
   * Before connect() (or after disconnect()) the command waits and runs when
   * connect() is called. Answering it earlier would have no state to work on,
   * and the snapshot of connect() would wipe out what it did.
   */
  emit<E extends keyof ClientToServerEvents>(
    event: E,
    ...args: Parameters<ClientToServerEvents[E]>
  ): void {
    const handler = this.handlers[event] as
      ((...a: typeof args) => void) | undefined;
    if (!handler) return;

    if (this.connected) {
      handler(...args);
    } else {
      this.queued.push(() => handler(...args));
    }
  }

  on<E extends keyof ServerToClientEvents>(
    event: E,
    listener: ServerToClientEvents[E],
  ): void {
    const set = this.listeners.get(event) ?? new Set<AnyListener>();
    set.add(listener);
    this.listeners.set(event, set);
  }

  off<E extends keyof ServerToClientEvents>(
    event: E,
    listener: ServerToClientEvents[E],
  ): void {
    this.listeners.get(event)?.delete(listener);
  }

  // Hands an event to every listener registered for it.
  private deliver<E extends keyof ServerToClientEvents>(
    event: E,
    payload: Parameters<ServerToClientEvents[E]>[0],
  ) {
    this.listeners.get(event)?.forEach((listener) => {
      // The map stores listeners of all events, so the one cast lives here.
      (listener as (p: typeof payload) => void)(payload);
    });
  }

  // Runs `fn` after `ms` on the mock's clock. Unlike a bare setTimeout, the
  // timer is remembered, so disconnect() can cancel it.
  private later(fn: () => void, ms: number): void {
    const handle = this.clock.setTimeout(() => {
      this.timers.delete(handle);
      fn();
    }, ms);
    this.timers.add(handle);
  }

  // Sends the state the UI is at now, in the form of a snapshot.
  private sendSnapshot(): void {
    this.deliver("state:snapshot", this.state);
  }

  // Sends a patch the mock makes up itself (a command's effect), numbered
  // right after the current state.
  private sendPatch(ops: PatchOp[]): void {
    const patch: StatePatch = { version: this.state.version + 1, ops };
    // The scenario does not know about this patch, so its next version has to
    // be moved behind it.
    this.versionOffset++;
    this.track(patch);
    this.deliver("state:patch", patch);
  }

  // Applies a patch that has been sent to this.state, so the mock knows what
  // the UI knows.
  private track(patch: StatePatch): void {
    const result = applyPatch(this.state, patch);

    if (result.status === "applied") {
      this.state = result.state;
      return;
    }
    if (result.status === "gap") {
      // A scenario may skip a version on purpose (stress). The daemon would
      // have the missing ops, the mock does not, so it applies what it has.
      const forced = applyPatch(this.state, {
        ...patch,
        version: this.state.version + 1,
      });
      if (forced.status === "applied") {
        this.state = { ...forced.state, version: patch.version };
      }
    }
  }

  // Receives everything the scenario player plays and sends it to the UI.
  // Snapshots and patches also update the mock's own state; a snapshot starts
  // the numbering over. The rest (terminal output, errors) goes through as is.
  private dispatch(entry: ScenarioEntry) {
    if (entry.event === "state:snapshot") {
      this.state = entry.payload;
      this.versionOffset = 0;
      this.deliver(entry.event, entry.payload);
      return;
    }

    if (entry.event === "state:patch") {
      const patch = {
        ...entry.payload,
        version: entry.payload.version + this.versionOffset,
      };

      this.track(patch);
      this.deliver("state:patch", patch);
      return;
    }
    this.deliver(entry.event, entry.payload);
  }
}
