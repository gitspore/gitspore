import { realClock, type Clock, type TimerHandle } from "./clock";
import type { Scenario, ScenarioEntry } from "./scenario";
import { shiftScenario } from "./shiftTimestamps";

export class ScenarioPlayer {
  private shifted: Scenario | null = null;
  private startedAt = 0;
  private index = 0;
  private timer: TimerHandle | null = null;

  constructor(
    private readonly scenario: Scenario,
    private readonly onEntry: (entry: ScenarioEntry) => void,
    private readonly clock: Clock = realClock,
  ) {}

  start(): void {
    this.stop();
    this.startedAt = this.clock.now();
    // Shift a copy: the scenario is a shared singleton, so a second start()
    // must begin from the original timestamps.
    this.shifted = shiftScenario(
      this.scenario,
      this.startedAt - Date.parse(this.scenario.anchor),
    );

    this.index = 0;

    this.onEntry({
      at: 0,
      event: "state:snapshot",
      payload: this.shifted.snapshot,
    });
    // onEntry may have called stop().
    if (this.shifted) this.scheduleNext();
  }
  stop(): void {
    if (this.timer !== null) {
      this.clock.clearTimeout(this.timer);
      this.timer = null;
    }

    this.shifted = null;
    this.index = 0;
  }
  private scheduleNext(): void {
    const events = this.shifted?.events;

    if (!events || this.index >= events.length) return;

    const elapsed = this.clock.now() - this.startedAt;
    const delay = Math.max(0, events[this.index].at - elapsed);

    this.timer = this.clock.setTimeout(() => this.flush(), delay);
  }
  private flush(): void {
    this.timer = null;

    // Re-read the time instead of trusting the planned delay: real timers
    // fire late, and this also delivers entries with the same `at` together.

    const elapsed = this.clock.now() - this.startedAt;
    while (this.shifted && this.index < this.shifted.events.length) {
      const entry = this.shifted.events[this.index];
      if (entry.at > elapsed) break;

      this.index++;
      this.onEntry(entry);
    }

    if (this.shifted) this.scheduleNext();
  }
}
