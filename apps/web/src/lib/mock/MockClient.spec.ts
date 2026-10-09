import { ANCHOR, data, makeScenario } from "./scenarioFixtures";
import { createFakeClock } from "./clock.fake";
import { MockClient } from "./MockClient";

describe("MockClient", () => {
  it("delivers the snapshot to a listener registered before connect", () => {
    const clock = createFakeClock(Date.parse(ANCHOR));
    const client = new MockClient(makeScenario(), clock);
    const listener = jest.fn();
    client.on("state:snapshot", listener);

    client.connect();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("delivers events only to listeners of that event", () => {
    const clock = createFakeClock(Date.parse(ANCHOR));
    const client = new MockClient(makeScenario([data(100, "a")]), clock);
    const onData = jest.fn();
    const onError = jest.fn();
    client.on("terminal:data", onData);
    client.on("error", onError);
    client.connect();

    clock.advance(100);

    expect(onData).toHaveBeenCalledWith({ sessionId: "s", chunk: "a" });
    expect(onError).not.toHaveBeenCalled();
  });

  it("stops delivering to a listener after off", () => {
    const clock = createFakeClock(Date.parse(ANCHOR));
    const client = new MockClient(makeScenario([data(100, "a")]), clock);
    const listener = jest.fn();
    client.on("terminal:data", listener);
    client.connect();

    client.off("terminal:data", listener);
    clock.advance(100);

    expect(listener).not.toHaveBeenCalled();
  });

  it("delivers nothing after disconnect", () => {
    const clock = createFakeClock(Date.parse(ANCHOR));
    const client = new MockClient(makeScenario([data(100, "a")]), clock);
    const listener = jest.fn();
    client.on("terminal:data", listener);
    client.connect();

    client.disconnect();
    clock.advance(100);

    expect(listener).not.toHaveBeenCalled();
  });

  it("ignores emit", () => {
    const client = new MockClient(makeScenario());

    expect(() => client.emit("state:request", {})).not.toThrow();
  });
});
