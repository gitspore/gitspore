import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AddressInfo } from "node:net";
import { io, type Socket } from "socket.io-client";
import { GatewayModule } from "./gateway.module";
import { SessionAuth } from "./session-auth.service";

const ORIGIN = "http://localhost:3000";

describe("StateGateway", () => {
  let app: INestApplication;
  let auth: SessionAuth;
  let url: string;
  const sockets: Socket[] = [];

  const connect = (options: {
    token?: string;
    origin?: string;
    host?: string;
  }) => {
    const headers: Record<string, string> = {};
    if (options.origin) headers.Origin = options.origin;
    if (options.host) headers.Host = options.host;

    const socket = io(url, {
      transports: ["websocket"],
      reconnection: false,
      auth: options.token === undefined ? {} : { token: options.token },
      extraHeaders: headers,
    });
    sockets.push(socket);
    return socket;
  };

  const outcome = (socket: Socket) =>
    new Promise<"snapshot" | "rejected">((resolve) => {
      socket.on("state:snapshot", () => resolve("snapshot"));
      socket.on("connect_error", () => resolve("rejected"));
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GatewayModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, "127.0.0.1");

    const { address, port } = app.getHttpServer().address() as AddressInfo;
    expect(address).toBe("127.0.0.1");
    url = `http://127.0.0.1:${port}`;
    auth = app.get(SessionAuth);
  });

  afterEach(() => sockets.splice(0).forEach((socket) => socket.close()));
  afterAll(() => app.close());

  it("sends the snapshot to a client with token and allowed origin", async () => {
    const socket = connect({ token: auth.token, origin: ORIGIN });
    await expect(outcome(socket)).resolves.toBe("snapshot");
  });

  it("rejects a missing token", async () => {
    await expect(outcome(connect({ origin: ORIGIN }))).resolves.toBe(
      "rejected",
    );
  });

  it("rejects a wrong token", async () => {
    const socket = connect({ token: "nope", origin: ORIGIN });
    await expect(outcome(socket)).resolves.toBe("rejected");
  });

  it("rejects a foreign origin", async () => {
    const socket = connect({ token: auth.token, origin: "http://evil.test" });
    await expect(outcome(socket)).resolves.toBe("rejected");
  });

  it("rejects a missing origin", async () => {
    await expect(outcome(connect({ token: auth.token }))).resolves.toBe(
      "rejected",
    );
  });

  it("rejects a non-loopback Host (DNS rebinding)", async () => {
    const socket = connect({
      token: auth.token,
      origin: ORIGIN,
      host: "evil.test",
    });
    await expect(outcome(socket)).resolves.toBe("rejected");
  });
});
