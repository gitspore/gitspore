import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AddressInfo } from "node:net";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  TerminalDataPayload,
  TerminalOpenAck,
} from "@gitspore/shared";
import { FakePty } from "../../../test/fake-pty";
import { SPAWN_PTY, TerminalService } from "../terminal/terminal.service";
import { GatewayModule } from "./gateway.module";
import { SessionAuth } from "./session-auth.service";

const ORIGIN = "http://localhost:3000";

type BrowserTab = Socket<ServerToClientEvents, ClientToServerEvents>;

describe("TerminalGateway", () => {
  let app: INestApplication;
  let url: string;
  let token: string;
  let service: TerminalService;
  let ptys: FakePty[];
  const browserTabs: BrowserTab[] = [];

  beforeEach(async () => {
    ptys = [];
    const moduleRef = await Test.createTestingModule({
      imports: [GatewayModule],
    })
      .overrideProvider(SPAWN_PTY)
      .useValue(() => {
        const pty = new FakePty();
        ptys.push(pty);
        return pty;
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, "127.0.0.1");
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
    token = app.get(SessionAuth).token;
    service = app.get(TerminalService);
  });

  afterEach(async () => {
    browserTabs.splice(0).forEach((browserTab) => browserTab.close());
    await app.close();
  });

  const spawn = (agentId: string) =>
    service.spawn({ agentId, cwd: "/repo", command: "claude", args: [] });

  // Resolves once the socket is connected, so socket.id is set.
  const connect = () =>
    new Promise<BrowserTab>((resolve, reject) => {
      const browserTab: BrowserTab = io(url, {
        transports: ["websocket"],
        reconnection: false,
        auth: { token },
        extraHeaders: { Origin: ORIGIN },
      });
      browserTabs.push(browserTab);
      browserTab.on("connect", () => resolve(browserTab));
      browserTab.on("connect_error", reject);
    });

  // The batcher flushes every 16 ms (real timers).
  const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

  it("acks terminal:open with the session id, then sends the scrollback", async () => {
    spawn("agent-1");
    ptys[0].output("before");
    await flush();
    const browserTab = await connect();
    const seen: string[] = [];

    const data = new Promise<TerminalDataPayload>((resolve) =>
      browserTab.on("terminal:data", (payload) => {
        seen.push("data");
        resolve(payload);
      }),
    );
    const ack = new Promise<TerminalOpenAck>((resolve) =>
      browserTab.emit("terminal:open", { agentId: "agent-1" }, (response) => {
        seen.push("ack");
        resolve(response);
      }),
    );

    const payload = await data;
    expect(await ack).toEqual({ sessionId: payload.sessionId });
    expect(payload.chunk).toBe("before");
    expect(seen).toEqual(["ack", "data"]);
  });
});
