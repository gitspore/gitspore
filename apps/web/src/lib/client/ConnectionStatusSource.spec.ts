import { ConnectionStatusSource } from "./ConnectionStatusSource";
import type { ConnectionStatus } from "./GreenhouseClient";

const INITIAL: ConnectionStatus = {
  kind: "offline",
  reason: "Not connected yet",
};

describe("ConnectionStatusSource", () => {
  it("returns the initial status", () => {
    const source = new ConnectionStatusSource(INITIAL);

    expect(source.get()).toBe(INITIAL);
  });

  it("sets the current status", () => {
    const source = new ConnectionStatusSource(INITIAL);

    const newStatus: ConnectionStatus = { kind: "connected" };

    source.set(newStatus);
    expect(source.get()).toBe(newStatus);
  });

  it("calls the listener when the status changes", () => {
    const source = new ConnectionStatusSource(INITIAL);
    const listener = jest.fn();
    source.subscribe(listener);
    const newStatus: ConnectionStatus = { kind: "connected" };
    source.set(newStatus);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes from a listener", () => {
    const source = new ConnectionStatusSource(INITIAL);
    const listener = jest.fn();
    const unsubscribe = source.subscribe(listener);
    unsubscribe();
    source.set({ kind: "connected" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not call the listener when the same status is set again", () => {
    const source = new ConnectionStatusSource(INITIAL);
    const listener = jest.fn();
    source.subscribe(listener);
    const first: ConnectionStatus = { kind: "reconnecting" };
    source.set(first);
    source.set({ kind: "reconnecting" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(source.get()).toBe(first);
  });

  it("calls the listener when only the reason of an offline status changes", () => {
    const source = new ConnectionStatusSource(INITIAL);
    const listener = jest.fn();
    source.subscribe(listener);
    const newOffline: ConnectionStatus = {
      kind: "offline",
      reason: "Just a test",
    };
    source.set(newOffline);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
