import {
  Ack,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import type {
  ServerError,
  TerminalClosePayload,
  TerminalInputPayload,
  TerminalOpenAck,
  TerminalOpenPayload,
  TerminalResizePayload,
} from "@gitspore/shared";

import { TerminalError } from "../terminal/terminal-error";

import { TerminalService } from "../terminal/terminal.service";
import { allowedOrigins } from "./session-auth.service";
import type { GreenhouseSocket } from "./state.gateway";

//
//
//
// agent_not_found and session_not_found are the tab's own mistake and keep their code.
// Everything else is the daemon's problem: internal.

function toServerError(error: unknown): ServerError {
  if (!(error instanceof TerminalError)) {
    const message = error instanceof Error ? error.message : String(error);
    return { code: "internal", message };
  }
  if (error.code === "agent_not_found" || error.code === "session_not_found") {
    return { code: error.code, message: error.message };
  }
  return { code: "internal", message: error.message };
}

// No auth here: every gateway on this port shares one Socket.io server,
// so the middleware in StateGateway.afterInit already guards these events.
@WebSocketGateway({ cors: { origin: allowedOrigins() } })
export class TerminalGateway {
  constructor(private readonly terminals: TerminalService) {}

  @SubscribeMessage("terminal:open")
  handleOpen(
    @ConnectedSocket() client: GreenhouseSocket,
    @MessageBody() { agentId }: TerminalOpenPayload,
    @Ack() ack: (response: TerminalOpenAck) => void,
  ) {
    try {
      const { sessionId, scrollback } = this.terminals.attach(agentId, {
        ownerId: client.id,
        onData: (chunk) => client.emit("terminal:data", { sessionId, chunk }),
        onExit: (exitCode) =>
          client.emit("terminal:exit", { sessionId, exitCode }),
      });
      ack({ sessionId });
      if (scrollback !== "") {
        client.emit("terminal:data", { sessionId, chunk: scrollback });
      }
    } catch (error) {
      ack({ error: toServerError(error) });
    }
  }
  @SubscribeMessage("terminal:input")
  handleInput(
    @ConnectedSocket() client: GreenhouseSocket,
    @MessageBody() { sessionId, data }: TerminalInputPayload,
  ) {
    this.runOrEmitError(client, () =>
      this.terminals.write(sessionId, client.id, data),
    );
  }

  @SubscribeMessage("terminal:resize")
  handleResize(
    @ConnectedSocket() client: GreenhouseSocket,
    @MessageBody() { sessionId, cols, rows }: TerminalResizePayload,
  ) {
    this.runOrEmitError(client, () =>
      this.terminals.resize(sessionId, client.id, cols, rows),
    );
  }

  @SubscribeMessage("terminal:close")
  handleClose(
    @ConnectedSocket() client: GreenhouseSocket,
    @MessageBody() { sessionId }: TerminalClosePayload,
  ) {
    this.runOrEmitError(client, () =>
      this.terminals.detach(sessionId, client.id),
    );
  }

  // These events have no ack, so a failure goes back as an `error` event.
  private runOrEmitError(client: GreenhouseSocket, action: () => void) {
    try {
      action();
    } catch (error) {
      client.emit("error", toServerError(error));
    }
  }
}
