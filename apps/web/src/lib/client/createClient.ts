import { getScenario } from "../../../mocks/scenarios";
import { MockClient } from "../mock/MockClient";
import type { ClientMode } from "./clientMode";
import type { GreenhouseClient } from "./GreenhouseClient";

/**
 * Builds the client for a mode from resolveClientMode(). Components get a
 * GreenhouseClient and never learn which one it is.
 *
 * The mock is not connected yet; call connect() once the listeners are
 * registered. A dev overlay can check `client instanceof MockClient` for the
 * playback controls.
 */
export function createClient(mode: ClientMode): GreenhouseClient {
  if (mode.kind === "mock") {
    // Throws with a clear message if the scenario file is invalid.
    const client = new MockClient(getScenario(mode.scenario));
    client.setSpeed(mode.speed);
    return client;
  }

  throw new Error(
    "The client for the real daemon (SocketClient) is not built yet. " +
      "Open the app with ?mock=<scenario> to use the mock.",
  );
}
