import type {
  ClientToServerEvents,
  ServerError,
  ServerToClientEvents,
} from "@gitspore/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AddressInfo } from "node:net";
import { io, type Socket } from "socket.io-client";
import { AgentError } from "./agent-error";
import { AgentGateway } from "./agent.gateway";
import { AgentService } from "./agent.service";

type BrowserTab = Socket<ServerToClientEvents, ClientToServerEvents>;

describe("AgentGateway", () => {
  let app: INestApplication;
  let tab: BrowserTab;
  const agents = { dispatch: jest.fn(), stop: jest.fn() };

  beforeEach(async () => {
    agents.dispatch.mockReset();
    agents.stop.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [AgentGateway, { provide: AgentService, useValue: agents }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, "127.0.0.1");
    const { port } = app.getHttpServer().address() as AddressInfo;
    tab = io(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      reconnection: false,
    });
    await new Promise<void>((resolve) => tab.on("connect", () => resolve()));
  });

  afterEach(async () => {
    tab.close();
    await app.close();
  });

  it("passes agent:dispatch to the service and acks its answer", async () => {
    agents.dispatch.mockResolvedValue({ agentId: "agent-1" });

    const ack = await tab.emitWithAck("agent:dispatch", {
      issueNumber: 42,
      slotIndex: 0,
    });

    expect(ack).toEqual({ agentId: "agent-1" });
    expect(agents.dispatch).toHaveBeenCalledWith({
      issueNumber: 42,
      slotIndex: 0,
    });
  });

  it("acks internal when dispatch throws after all", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    agents.dispatch.mockRejectedValue(new Error("bug"));

    const ack = await tab.emitWithAck("agent:dispatch", {
      issueNumber: 42,
      slotIndex: 0,
    });

    expect(ack).toMatchObject({ error: { code: "internal" } });
  });

  it("sends a failed agent:stop back as an error event", async () => {
    agents.stop.mockRejectedValue(
      new AgentError("worktree_dirty", "Uncommitted changes", {
        agentId: "agent-1",
      }),
    );
    const error = new Promise<ServerError>((resolve) =>
      tab.on("error", resolve),
    );

    tab.emit("agent:stop", { agentId: "agent-1", removeWorktree: true });

    expect(await error).toEqual({
      code: "worktree_dirty",
      message: "Uncommitted changes",
      context: { agentId: "agent-1" },
    });
  });

  it("sends nothing back for a stop that works", async () => {
    agents.stop.mockResolvedValue(undefined);
    agents.dispatch.mockResolvedValue({ agentId: "agent-2" });
    const errors: ServerError[] = [];
    tab.on("error", (error) => errors.push(error));

    tab.emit("agent:stop", { agentId: "agent-1", removeWorktree: false });
    await tab.emitWithAck("agent:dispatch", { issueNumber: 42, slotIndex: 0 });

    expect(agents.stop).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([]);
  });
});
