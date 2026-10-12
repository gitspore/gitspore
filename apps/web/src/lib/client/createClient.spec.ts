import { MockClient } from "../mock/MockClient";
import { createClient } from "./createClient";

describe("createClient", () => {
  it("builds a MockClient with the scenario and speed of the mode", () => {
    const client = createClient({
      kind: "mock",
      scenario: "core-loop",
      speed: 60,
    });

    expect(client).toBeInstanceOf(MockClient);
    expect((client as MockClient).scenarioName).toBe("core-loop");
    expect((client as MockClient).speed).toBe(60);
  });

  it("builds a client for every scenario that ships", () => {
    for (const scenario of [
      "empty",
      "all-states",
      "core-loop",
      "stress",
    ] as const) {
      expect(() =>
        createClient({ kind: "mock", scenario, speed: 1 }),
      ).not.toThrow();
    }
  });

  it("does not connect on its own", () => {
    const client = createClient({ kind: "mock", scenario: "empty", speed: 1 });
    const onSnapshot = jest.fn();
    client.on("state:snapshot", onSnapshot);

    expect(onSnapshot).not.toHaveBeenCalled();
    client.connect();
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    client.disconnect();
  });

  it("says that the daemon client is missing", () => {
    expect(() => createClient({ kind: "socket" })).toThrow(/SocketClient/);
  });
});
