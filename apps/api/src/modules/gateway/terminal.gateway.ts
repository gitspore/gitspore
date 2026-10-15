import {
  Ack,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import type { TerminalOpenAck, TerminalOpenPayload } from "@gitspore/shared";
import { TerminalService } from "../terminal/terminal.service";
import { allowedOrigins } from "./session-auth.service";
import type { GreenhouseSocket } from "./state.gateway";

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
  }
}
