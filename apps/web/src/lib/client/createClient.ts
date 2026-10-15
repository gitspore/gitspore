import { getScenario } from "../../../mocks/scenarios";
import { MockClient } from "../mock/MockClient";
import type { ClientMode } from "./clientMode";
import type { GreenhouseClient } from "./GreenhouseClient";
import { SocketClient } from "./SocketClient";

// apps/api listens on 3001 unless PORT says otherwise.
const DEFAULT_DAEMON_URL = "http://localhost:3001";

/**
 * Builds the client for a mode from resolveClientMode(). Components get a
 * GreenhouseClient and never learn which one it is.
 *
 * `token` is the session token for the daemon (see resolveSessionToken), null
 * if there is none. The mock ignores it. Without one the daemon client stays
 * offline and says why. It is a parameter so this function does not touch the
 * browser.
 *
 * The client is not connected yet; call connect() once the listeners are
 * registered. A dev overlay can check `client instanceof MockClient` for the
 * playback controls.
 */
export function createClient(
  mode: ClientMode,
  token: string | null,
): GreenhouseClient {
  if (mode.kind === "mock") {
    // Throws with a clear message if the scenario file is invalid.
    const client = new MockClient(getScenario(mode.scenario));
    client.setSpeed(mode.speed);
    return client;
  }

  // Written out in full: Next replaces exactly this expression at build time.
  return new SocketClient(
    process.env.NEXT_PUBLIC_DAEMON_URL ?? DEFAULT_DAEMON_URL,
    token,
  );
}
