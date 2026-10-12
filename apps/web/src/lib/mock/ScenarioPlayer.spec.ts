import { createFakeClock } from "./clock.fake";
import type { ScenarioEntry } from "./scenario";
import { ANCHOR, data, makeScenario } from "./scenarioFixtures";
import { ScenarioPlayer } from "./ScenarioPlayer";

function setup(events: ScenarioEntry[] = []) {
  const clock = createFakeClock(Date.parse(ANCHOR));
  const received: ScenarioEntry[] = [];
  const player = new ScenarioPlayer(
    makeScenario(events),
    (entry) => received.push(entry),
    clock,
  );
  return { clock, received, player };
}

const chunks = (received: ScenarioEntry[]) =>
  received.flatMap((e) =>
    e.event === "terminal:data" ? [e.payload.chunk] : [],
  );

describe("ScenarioPlayer", () => {
  it("sends the snapshot immediately on start", () => {
    const { player, received } = setup([data(100, "a")]);

    player.start();

    expect(received).toHaveLength(1);
    expect(received[0].event).toBe("state:snapshot");
  });

  it("delivers an entry exactly when it is due", () => {
    const { player, clock, received } = setup([data(100, "a")]);
    player.start();

    clock.advance(99);
    expect(chunks(received)).toEqual([]);

    clock.advance(1);
    expect(chunks(received)).toEqual(["a"]);
  });

  it("keeps array order, also for entries with the same at", () => {
    const { player, clock, received } = setup([
      data(100, "a"),
      data(100, "b"),
      data(200, "c"),
    ]);
    player.start();

    clock.advance(200);

    expect(chunks(received)).toEqual(["a", "b", "c"]);
  });

  it("delivers everything that is due after one big advance", () => {
    const { player, clock, received } = setup([data(100, "a"), data(300, "b")]);
    player.start();

    clock.advance(500);

    expect(chunks(received)).toEqual(["a", "b"]);
  });

  it("shifts timestamps relative to the clock at start", () => {
    const clock = createFakeClock(Date.parse(ANCHOR) + 5 * 60_000);
    const received: ScenarioEntry[] = [];
    new ScenarioPlayer(makeScenario(), (e) => received.push(e), clock).start();

    const [snapshot] = received;
    expect(
      snapshot.event === "state:snapshot" &&
        snapshot.payload.agents[0].statusSince,
    ).toBe("2026-10-09T09:05:00.000Z");
  });

  it("delivers nothing after stop", () => {
    const { player, clock, received } = setup([data(100, "a")]);
    player.start();

    player.stop();
    clock.advance(1000);

    expect(chunks(received)).toEqual([]);
  });

  it("starts from the beginning after stop and start", () => {
    const { player, clock, received } = setup([data(100, "a")]);
    player.start();
    clock.advance(100);

    player.stop();
    received.length = 0;
    player.start();
    clock.advance(100);

    expect(received.map((e) => e.event)).toEqual([
      "state:snapshot",
      "terminal:data",
    ]);
  });

  it("sends only the snapshot for a scenario without events", () => {
    const { player, clock, received } = setup([]);
    player.start();

    clock.advance(100_000);

    expect(received).toHaveLength(1);
  });

  it("stops cleanly when onEntry calls stop", () => {
    const clock = createFakeClock(Date.parse(ANCHOR));
    const received: ScenarioEntry[] = [];
    const player: ScenarioPlayer = new ScenarioPlayer(
      makeScenario([data(100, "a"), data(100, "b")]),
      (entry) => {
        received.push(entry);
        if (entry.event === "terminal:data") player.stop();
      },
      clock,
    );
    player.start();

    clock.advance(1000);

    expect(chunks(received)).toEqual(["a"]);
  });

  describe("speed", () => {
    it("delivers entries sooner at a higher speed", () => {
      const { player, clock, received } = setup([data(1000, "a")]);
      player.setSpeed(10);
      player.start();

      clock.advance(99);
      expect(chunks(received)).toEqual([]);

      clock.advance(1);
      expect(chunks(received)).toEqual(["a"]);
    });

    it("plays slower below 1", () => {
      const { player, clock, received } = setup([data(100, "a")]);
      player.setSpeed(0.5);
      player.start();

      clock.advance(199);
      expect(chunks(received)).toEqual([]);

      clock.advance(1);
      expect(chunks(received)).toEqual(["a"]);
    });

    it("applies a speed change to the time still to come only", () => {
      const { player, clock, received } = setup([data(1000, "a")]);
      player.start();

      clock.advance(500); // 500 of 1000 played
      player.setSpeed(10); // 500 left, now 50 ms of clock time
      clock.advance(49);
      expect(chunks(received)).toEqual([]);

      clock.advance(1);
      expect(chunks(received)).toEqual(["a"]);
    });

    it("keeps the speed across stop and start", () => {
      const { player, clock, received } = setup([data(1000, "a")]);
      player.setSpeed(10);
      player.start();
      player.stop();

      player.start();
      clock.advance(100);

      expect(player.speed).toBe(10);
      expect(chunks(received)).toEqual(["a"]);
    });

    it.each([0, -1, NaN, Infinity])("rejects the speed %p", (factor) => {
      const { player } = setup();

      expect(() => player.setSpeed(factor)).toThrow(RangeError);
    });

    it("runs virtualNow at the same speed", () => {
      const { player, clock } = setup();
      player.setSpeed(60);
      player.start();
      const start = player.virtualNow();

      clock.advance(1000);

      expect(player.virtualNow() - start).toBe(60_000);
    });
  });

  describe("pause and resume", () => {
    it("delivers nothing while paused", () => {
      const { player, clock, received } = setup([data(100, "a")]);
      player.start();

      player.pause();
      clock.advance(1000);

      expect(player.isPaused).toBe(true);
      expect(chunks(received)).toEqual([]);
    });

    it("continues with the remaining time after resume", () => {
      const { player, clock, received } = setup([data(100, "a")]);
      player.start();
      clock.advance(60);

      player.pause();
      clock.advance(5000);
      player.resume();

      clock.advance(39);
      expect(chunks(received)).toEqual([]);

      clock.advance(1);
      expect(chunks(received)).toEqual(["a"]);
      expect(player.isPaused).toBe(false);
    });

    it("stands virtualNow still while paused", () => {
      const { player, clock } = setup();
      player.start();
      clock.advance(100);
      player.pause();
      const paused = player.virtualNow();

      clock.advance(5000);

      expect(player.virtualNow()).toBe(paused);
    });

    it("keeps a speed change made while paused", () => {
      const { player, clock, received } = setup([data(1000, "a")]);
      player.start();
      player.pause();

      player.setSpeed(10);
      clock.advance(5000);
      expect(chunks(received)).toEqual([]);

      player.resume();
      clock.advance(100);
      expect(chunks(received)).toEqual(["a"]);
    });

    it("ignores pause and resume when not running", () => {
      const { player } = setup([data(100, "a")]);

      expect(() => {
        player.pause();
        player.resume();
      }).not.toThrow();
      expect(player.isPaused).toBe(false);
    });

    it("plays again after a restart from pause", () => {
      const { player, clock, received } = setup([data(100, "a")]);
      player.start();
      player.pause();

      player.start();
      clock.advance(100);

      expect(player.isPaused).toBe(false);
      expect(chunks(received)).toEqual(["a"]);
    });

    it("does not schedule further entries when onEntry pauses", () => {
      const clock = createFakeClock(Date.parse(ANCHOR));
      const received: ScenarioEntry[] = [];
      const player: ScenarioPlayer = new ScenarioPlayer(
        makeScenario([data(100, "a"), data(200, "b")]),
        (entry) => {
          received.push(entry);
          if (entry.event === "terminal:data") player.pause();
        },
        clock,
      );
      player.start();

      clock.advance(1000);
      expect(chunks(received)).toEqual(["a"]);

      player.resume();
      clock.advance(1000);
      expect(chunks(received)).toEqual(["a", "b"]);
    });
  });
});
