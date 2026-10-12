import { io } from "socket.io-client";
import { SocketClient } from "./SocketClient";

jest.mock("socket.io-client", () => ({ io: jest.fn() }));

function setup() {
  const socket = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  };
  jest.mocked(io).mockReturnValue(socket as never);
  return { socket, client: new SocketClient("http://daemon:1234") };
}

describe("SocketClient", () => {
  it("opens the socket for the given url without connecting", () => {
    const { socket } = setup();

    expect(io).toHaveBeenCalledWith("http://daemon:1234", {
      autoConnect: false,
    });
    expect(socket.connect).not.toHaveBeenCalled();
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
});
