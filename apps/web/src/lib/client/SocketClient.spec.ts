import { io } from "socket.io-client";
import { SocketClient } from "./SocketClient";

jest.mock("socket.io-client", () => ({ io: jest.fn() }));

function setup(token = "test-token") {
  const socket = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    active: true,
    io: { on: jest.fn() },
  };
  jest.mocked(io).mockReturnValue(socket as never);
  const client = new SocketClient("http://daemon:1234", token);
  function handlerFor(on: jest.Mock, event: string) {
    const call = on.mock.calls.find(([name]) => name === event);
    if (!call) throw new Error(`No listener registered for "${event}"`);
    return call[1];
  }

  function fire(event: string, ...args: unknown[]) {
    handlerFor(socket.on, event)(...args);
  }

  function fireManager(event: string, ...args: unknown[]) {
    handlerFor(socket.io.on, event)(...args);
  }

  return { socket, client, fire, fireManager };
}

describe("SocketClient", () => {
  it("opens the socket for the given url without connecting", () => {
    const { socket } = setup();

    expect(io).toHaveBeenCalledWith("http://daemon:1234", {
      autoConnect: false,
      auth: { token: "test-token" },
    });
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it("sends the session token in the handshake auth", () => {
    setup("my-session-token");

    expect(io).toHaveBeenCalledWith(
      "http://daemon:1234",
      expect.objectContaining({ auth: { token: "my-session-token" } }),
    );
  });

  it("connects and disconnects the socket", () => {
    const { client, socket } = setup();

    client.connect();
    client.disconnect();

    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it("passes commands and their ack on unchanged", () => {
    const { client, socket } = setup();
    const ack = jest.fn();

    client.emit("agent:dispatch", { issueNumber: 1, slotIndex: 0 }, ack);

    expect(socket.emit).toHaveBeenCalledWith(
      "agent:dispatch",
      { issueNumber: 1, slotIndex: 0 },
      ack,
    );
  });

  it("adds and removes listeners on the socket", () => {
    const { client, socket } = setup();
    const listener = jest.fn();

    client.on("state:patch", listener);
    client.off("state:patch", listener);

    expect(socket.on).toHaveBeenCalledWith("state:patch", listener);
    expect(socket.off).toHaveBeenCalledWith("state:patch", listener);
  });

  describe("now", () => {
    let nowSpy: jest.SpyInstance<number, []>;

    beforeEach(() => {
      nowSpy = jest.spyOn(Date, "now").mockReturnValue(1234);
    });

    afterEach(() => {
      nowSpy.mockRestore();
    });

    it("returns Date.now()", () => {
      const { client } = setup();

      expect(client.now()).toBe(1234);
    });
  });

  describe("connection status", () => {
    it("starts offline before connect", () => {
      const { client } = setup();

      expect(client.getStatus()).toEqual({
        kind: "offline",
        reason: "Not connected yet",
      });
    });

    it("returns the same object while the status is unchanged", () => {
      const { client } = setup();

      const status = client.getStatus();

      expect(client.getStatus()).toBe(status);
    });

    it("returns connected after connection", () => {
      const { client, fire } = setup();

      fire("connect");

      expect(client.getStatus()).toEqual({ kind: "connected" });
    });

    it("returns reconnecting while socket is active", () => {
      const { client, fire } = setup();

      fire("disconnect", "transport close");

      expect(client.getStatus()).toEqual({ kind: "reconnecting" });
    });

    it("returns offline with reason disconnected, if socket is not active", () => {
      const { client, fire, socket } = setup();
      socket.active = false;

      fire("disconnect", "io client disconnect");

      expect(client.getStatus()).toEqual({
        kind: "offline",
        reason: "Disconnected",
      });
    });

    it("is reconnecting when the connection fails but the socket keeps retrying", () => {
      const { client, fire } = setup();

      fire("connect_error", new Error("xhr poll error"));

      expect(client.getStatus()).toEqual({
        kind: "reconnecting",
      });
    });

    it("is offline with a token message when the connection fails and the socket gives up", () => {
      const { client, fire, socket } = setup();
      socket.active = false;
      fire("connect_error", new Error("unautherized"));

      expect(client.getStatus()).toEqual({
        kind: "offline",
        reason: "Session token invalid – reopen GitSpore from the daemon",
      });
    });

    it("is reconnecting when the manager starts a reconnect attempt", () => {
      const { client, fireManager } = setup();

      fireManager("reconnect_attempt");

      expect(client.getStatus()).toEqual({ kind: "reconnecting" });
    });

    it("keeps the same status object when an event does not change it", () => {
      const { client, fire } = setup();
      fire("connect");
      const status = client.getStatus();

      fire("connect");

      expect(client.getStatus()).toBe(status);
    });

    it("notifies subscribers when the status changes", () => {
      const { client, fire } = setup();
      const listener = jest.fn();
      client.subscribeStatus(listener);

      fire("connect");

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("does not notify subscribers when an event leaves the status unchanged", () => {
      const { client, fire } = setup();
      fire("connect");
      const listener = jest.fn();
      client.subscribeStatus(listener);

      fire("connect");

      expect(listener).not.toHaveBeenCalled();
    });

    it("stops notifying after unsubscribing", () => {
      const { client, fire } = setup();
      const listener = jest.fn();
      const unsubscribe = client.subscribeStatus(listener);

      unsubscribe();
      fire("connect");

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
