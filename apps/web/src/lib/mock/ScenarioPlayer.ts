import { realClock, type Clock, type TimerHandle } from "./clock";
import type { Scenario, ScenarioEntry } from "./scenario";
import { shiftScenario } from "./shiftTimestamps";

export class ScenarioPlayer {
  private shifted: Scenario | null = null;
  private startedAt = 0;
  private index = 0;
  private timer: TimerHandle | null = null;

  // Scenario time is what the `at` values count. It runs `speed` times as
  // fast as the clock. Instead of ticking, it is kept as the time elapsed up
  // to `resumedAt` plus (clock time since then) * speed. Pausing and changing
  // the speed only have to move that anchor.
  private speedFactor = 1;
  private paused = false;
  private elapsedAtResume = 0;
  private resumedAt = 0;

  constructor(
    private readonly scenario: Scenario,
    private readonly onEntry: (entry: ScenarioEntry) => void,
    private readonly clock: Clock = realClock,
  ) {}

  get speed(): number {
    return this.speedFactor;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /**
   * "Now" inside the scenario, in the same timeline as the shifted
   * timestamps. It runs faster than the clock at speed > 1 and stands still
   * while paused. Use it instead of Date.now() to derive waiting times.
   */
  virtualNow(): number {
    return this.startedAt + this.elapsed();
  }

  /** Starts from the beginning. Calling it again restarts, and plays. */
  start(): void {
    this.stop();
    this.startedAt = this.clock.now();
    this.resumedAt = this.startedAt;
    // Shift a copy: the scenario is a shared singleton, so a second start()
    // must begin from the original timestamps.
    this.shifted = shiftScenario(
      this.scenario,
      this.startedAt - Date.parse(this.scenario.anchor),
    );

    this.onEntry({
      at: 0,
      event: "state:snapshot",
      payload: this.shifted.snapshot,
    });
    // onEntry may have called stop().
    if (this.shifted) this.scheduleNext();
  }

  stop(): void {
    this.clearTimer();
    this.shifted = null;
    this.index = 0;
    this.paused = false;
    this.elapsedAtResume = 0;
  }

  pause(): void {
    if (!this.shifted || this.paused) return;

    this.elapsedAtResume = this.elapsed();
    this.paused = true;
    this.clearTimer();
  }

  resume(): void {
    if (!this.shifted || !this.paused) return;

    this.paused = false;
    this.resumedAt = this.clock.now();
    this.scheduleNext();
  }

  /**
   * Plays `factor` times as fast, e.g. 10 shows a 60 s stage in 6 s. Also
   * allowed before start(); it is kept across stop() and start().
   */
  setSpeed(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) {
      throw new RangeError(`speed must be a positive number, got ${factor}`);
    }

    // Close the time played so far at the old speed, then run on at the new.
    this.elapsedAtResume = this.elapsed();
    this.resumedAt = this.clock.now();
    this.speedFactor = factor;

    if (this.shifted && !this.paused) {
      this.clearTimer();
      this.scheduleNext();
    }
  }

  private elapsed(): number {
    if (!this.shifted) return 0;
    if (this.paused) return this.elapsedAtResume;

    return (
      this.elapsedAtResume +
      (this.clock.now() - this.resumedAt) * this.speedFactor
    );
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.clock.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(): void {
    const events = this.shifted?.events;
    if (!events || this.index >= events.length) return;

    // Scenario time left until the entry, as clock time. Rounded up so a
    // timer never fires a hair early and finds the entry not yet due.
    const delay = Math.max(
      0,
      Math.ceil((events[this.index].at - this.elapsed()) / this.speedFactor),
    );
    this.timer = this.clock.setTimeout(() => this.flush(), delay);
  }

  private flush(): void {
    this.timer = null;

    // Re-read the time instead of trusting the planned delay: real timers
    // fire late, and this also delivers entries with the same `at` together.
    const elapsed = this.elapsed();
    while (this.shifted && this.index < this.shifted.events.length) {
      const entry = this.shifted.events[this.index];
      if (entry.at > elapsed) break;

      this.index++; // before the call, so a throwing listener cannot repeat it
      this.onEntry(entry); // may call stop() or pause()
    }

    if (this.shifted && !this.paused) this.scheduleNext();
  }
}
