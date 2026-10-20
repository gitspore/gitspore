import {
  ClientModeError,
  DEFAULT_SCENARIO,
  resolveClientMode,
} from "./clientMode";

const resolve = (search: string, useMockEnv?: string) =>
  resolveClientMode({ useMockEnv, search });

describe("resolveClientMode", () => {
  describe("without the environment", () => {
    it("uses the daemon by default", () => {
      expect(resolve("")).toEqual({ kind: "socket" });
    });

    it("plays the scenario named in the URL", () => {
      expect(resolve("?mock=core-loop")).toEqual({
        kind: "mock",
        scenario: "core-loop",
        speed: 1,
      });
    });

    it("plays the default scenario for ?mock=true", () => {
      expect(resolve("?mock=true")).toEqual({
        kind: "mock",
        scenario: DEFAULT_SCENARIO,
        speed: 1,
      });
    });

    it("reads the speed", () => {
      expect(resolve("?mock=core-loop&speed=60")).toEqual({
        kind: "mock",
        scenario: "core-loop",
        speed: 60,
      });
    });

    it("accepts a speed below 1", () => {
      expect(resolve("?mock=stress&speed=0.5")).toMatchObject({ speed: 0.5 });
    });

    it("accepts a search string without the question mark", () => {
      expect(resolve("mock=stress")).toMatchObject({ scenario: "stress" });
    });

    it("ignores the speed for the daemon", () => {
      expect(resolve("?speed=abc")).toEqual({ kind: "socket" });
    });
  });

  describe("with NEXT_PUBLIC_USE_MOCK=true", () => {
    it("plays the default scenario", () => {
      expect(resolve("", "true")).toEqual({
        kind: "mock",
        scenario: DEFAULT_SCENARIO,
        speed: 1,
      });
    });

    it("lets the URL pick another scenario and a speed", () => {
      expect(resolve("?mock=stress&speed=10", "true")).toEqual({
        kind: "mock",
        scenario: "stress",
        speed: 10,
      });
    });

    it("lets ?mock=false switch back to the daemon", () => {
      expect(resolve("?mock=false", "true")).toEqual({ kind: "socket" });
    });
  });

  describe("with another value of NEXT_PUBLIC_USE_MOCK", () => {
    it.each(["false", "1", "yes", ""])("%p means the daemon", (value) => {
      expect(resolve("", value)).toEqual({ kind: "socket" });
    });
  });

  describe("invalid input", () => {
    it("names the available scenarios for an unknown one", () => {
      expect(() => resolve("?mock=nope")).toThrow(ClientModeError);
      expect(() => resolve("?mock=nope")).toThrow(
        'Unknown mock scenario "nope". Available: empty, all-states, core-loop, stress, no-repo.',
      );
    });

    it("rejects an empty scenario name", () => {
      expect(() => resolve("?mock=")).toThrow(ClientModeError);
    });

    it.each(["abc", "0", "-5", "", "Infinity", "NaN"])(
      "rejects the speed %p",
      (speed) => {
        expect(() => resolve(`?mock=core-loop&speed=${speed}`)).toThrow(
          ClientModeError,
        );
      },
    );

    it("rejects a bad speed when the mock comes from the environment", () => {
      expect(() => resolve("?speed=0", "true")).toThrow(ClientModeError);
    });
  });
});
