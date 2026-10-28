import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AddressInfo } from "node:net";
import { isLoopback } from "./hook.controller";
import { HookModule } from "./hook.module";
import { HookService } from "./hook.service";

const EVENT = { hook_event_name: "PreToolUse", tool_name: "Bash" };

describe("POST /hooks/:agentId", () => {
  let app: INestApplication;
  let hooks: HookService;
  let url: string;
  const received: [string, unknown][] = [];

  const post = (agentId: string, headers: Record<string, string> = {}) =>
    fetch(`${url}/hooks/${agentId}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(EVENT),
    });

  const expectRejected = async (response: Response) => {
    expect(response.status).toBe(403);
    expect(received).toEqual([]);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HookModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, "127.0.0.1");

    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
    hooks = app.get(HookService);
    hooks.onEvent((agentId, payload) => received.push([agentId, payload]));
  });

  afterEach(() => {
    received.length = 0;
  });
  afterAll(() => app.close());

  it("passes the event on and answers 204", async () => {
    const secret = hooks.issue("agent-1");

    const response = await post("agent-1", { "x-gitspore-secret": secret });

    expect(response.status).toBe(204);
    expect(received).toEqual([["agent-1", EVENT]]);
  });

  it("rejects a wrong secret", async () => {
    hooks.issue("agent-2");

    await expectRejected(
      await post("agent-2", { "x-gitspore-secret": "wrong" }),
    );
  });

  it("rejects a request without a secret", async () => {
    hooks.issue("agent-3");

    await expectRejected(await post("agent-3"));
  });

  it("rejects another agent's secret", async () => {
    const other = hooks.issue("agent-4");
    hooks.issue("agent-5");

    await expectRejected(await post("agent-5", { "x-gitspore-secret": other }));
  });

  it("rejects an unknown agent", async () => {
    await expectRejected(
      await post("nobody", { "x-gitspore-secret": "anything" }),
    );
  });

  it("rejects a revoked secret", async () => {
    const secret = hooks.issue("agent-6");
    hooks.revoke("agent-6");

    await expectRejected(
      await post("agent-6", { "x-gitspore-secret": secret }),
    );
  });

  it("rejects a request with an Origin header, even with the right secret", async () => {
    const secret = hooks.issue("agent-7");

    await expectRejected(
      await post("agent-7", {
        "x-gitspore-secret": secret,
        origin: "http://localhost:3000",
      }),
    );
  });
});

describe("POST /hooks/:agentId/statusline", () => {
  const STATUSLINE = { session_id: "session-1", model: { id: "opus" } };
  let app: INestApplication;
  let hooks: HookService;
  let url: string;
  const statuslines: [string, unknown][] = [];
  const events: [string, unknown][] = [];

  const post = (agentId: string, headers: Record<string, string> = {}) =>
    fetch(`${url}/hooks/${agentId}/statusline`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(STATUSLINE),
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HookModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, "127.0.0.1");

    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
    hooks = app.get(HookService);
    hooks.onStatusline((agentId, payload) =>
      statuslines.push([agentId, payload]),
    );
    hooks.onEvent((agentId, payload) => events.push([agentId, payload]));
  });

  afterEach(() => {
    statuslines.length = 0;
    events.length = 0;
  });
  afterAll(() => app.close());

  it("passes the statusline on, not as a hook event, and answers 204", async () => {
    const secret = hooks.issue("agent-1");

    const response = await post("agent-1", { "x-gitspore-secret": secret });

    expect(response.status).toBe(204);
    expect(statuslines).toEqual([["agent-1", STATUSLINE]]);
    expect(events).toEqual([]);
  });

  it.each<[string, (secret: string) => Record<string, string>]>([
    ["a wrong secret", () => ({ "x-gitspore-secret": "wrong" })],
    ["no secret", () => ({})],
    [
      "an Origin header",
      (secret) => ({
        "x-gitspore-secret": secret,
        origin: "http://localhost:3000",
      }),
    ],
  ])("rejects %s like the hooks do", async (_, headers) => {
    const secret = hooks.issue("agent-2");

    const response = await post("agent-2", headers(secret));

    expect(response.status).toBe(403);
    expect(statuslines).toEqual([]);
  });

  it("rejects a revoked secret", async () => {
    const secret = hooks.issue("agent-3");
    hooks.revoke("agent-3");

    const response = await post("agent-3", { "x-gitspore-secret": secret });

    expect(response.status).toBe(403);
    expect(statuslines).toEqual([]);
  });
});

describe("isLoopback", () => {
  it.each(["127.0.0.1", "::1", "::ffff:127.0.0.1"])("accepts %s", (address) => {
    expect(isLoopback(address)).toBe(true);
  });

  it.each(["192.168.1.20", "::ffff:10.0.0.1", "", undefined])(
    "rejects %s",
    (address) => {
      expect(isLoopback(address)).toBe(false);
    },
  );
});
