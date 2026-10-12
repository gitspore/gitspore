import {
  isScenarioName,
  SCENARIO_NAMES,
  type ScenarioName,
} from "../../../mocks/scenarios";

export type ClientMode =
  { kind: "socket" } | { kind: "mock"; scenario: ScenarioName; speed: number };

/** The scenario for `?mock=true` and for NEXT_PUBLIC_USE_MOCK without a name. */
export const DEFAULT_SCENARIO: ScenarioName = "all-states";

/** The URL or the environment asked for something that does not exist. */
export class ClientModeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientModeError";
  }
}

export type ClientModeInput = {
  /**
   * NEXT_PUBLIC_USE_MOCK. Pass `process.env.NEXT_PUBLIC_USE_MOCK` as it is
   * written here: Next replaces that exact expression at build time, so it
   * cannot be read through a variable.
   */
  useMockEnv: string | undefined;
  /** `window.location.search`. Only known in the browser, never at build time. */
  search: string;
};

/**
 * Decides whether the UI talks to the daemon or to the mock.
 *
 * - The default is the build-time NEXT_PUBLIC_USE_MOCK: "true" means mock,
 *   anything else the daemon.
 * - The URL wins over it, so switching needs no rebuild:
 *   `?mock=core-loop` plays that scenario, `?mock=true` the default one and
 *   `?mock=false` forces the daemon.
 * - `?speed=10` sets the playback speed of the mock (default 1). It is
 *   ignored for the daemon.
 *
 * Throws a ClientModeError for an unknown scenario or an invalid speed,
 * instead of quietly falling back to something else.
 */
export function resolveClientMode({
  useMockEnv,
  search,
}: ClientModeInput): ClientMode {
  const params = new URLSearchParams(search);
  const mock = params.get("mock");

  if (mock === "false") return { kind: "socket" };
  if (mock === null && useMockEnv !== "true") return { kind: "socket" };

  const scenario = mock === null || mock === "true" ? DEFAULT_SCENARIO : mock;
  if (!isScenarioName(scenario)) {
    throw new ClientModeError(
      `Unknown mock scenario "${scenario}". Available: ${SCENARIO_NAMES.join(", ")}.`,
    );
  }

  return { kind: "mock", scenario, speed: parseSpeed(params.get("speed")) };
}

function parseSpeed(raw: string | null): number {
  if (raw === null) return 1;

  // Number("") is 0 and Number(" ") too, both are rejected below.
  const speed = Number(raw);
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new ClientModeError(
      `Invalid speed "${raw}". Use a positive number, e.g. speed=10.`,
    );
  }
  return speed;
}
