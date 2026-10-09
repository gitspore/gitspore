import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@gitspore/shared";
import { GreenhouseClient } from "../client/GreenhouseClient";
import { ScenarioPlayer } from "./ScenarioPlayer";
import { Scenario, ScenarioEntry } from "./scenario";
import { Clock, realClock } from "./clock";

type AnyListener = ServerToClientEvents[keyof ServerToClientEvents];

export class MockClient implements GreenhouseClient {
  private readonly listeners = new Map<
    keyof ServerToClientEvents,
    Set<AnyListener>
  >();
  private readonly player: ScenarioPlayer;

  constructor(scenario: Scenario, clock: Clock = realClock) {
    this.player = new ScenarioPlayer(
      scenario,
      (entry) => this.dispatch(entry),
      clock,
    );
  }
  /** Like the real socket, listeners must be registered before connect(). */
  connect(): void {
    this.player.start();
  }

  disconnect(): void {
    this.player.stop();
  }

  /**
   * The scenario is fixed, so commands have no effect. Events with an ack
   * (agent:dispatch, terminal:open) are never answered.
   */
  emit<E extends keyof ClientToServerEvents>(
    event: E,
    ...args: Parameters<ClientToServerEvents[E]>
  ): void {
    void event;
    void args;
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

  private dispatch(entry: ScenarioEntry) {
    this.deliver(entry.event, entry.payload);
  }

  private deliver<E extends keyof ServerToClientEvents>(
    event: E,
    payload: Parameters<ServerToClientEvents[E]>[0],
  ) {
    this.listeners.get(event)?.forEach((listener) => {
      // The map stores listeners of all events, so the one cast lives here.
      (listener as (p: typeof payload) => void)(payload);
    });
  }
}
