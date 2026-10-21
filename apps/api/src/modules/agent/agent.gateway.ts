import type { AgentDispatchAck } from "@gitspore/shared";
import { Logger } from "@nestjs/common";
import {
  Ack,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import { allowedOrigins } from "../gateway/session-auth.service";
import type { GreenhouseSocket } from "../gateway/state.gateway";
import { toServerError } from "./agent-error";
import { AgentService } from "./agent.service";

@WebSocketGateway({ cors: { origin: allowedOrigins() } })
export class AgentGateway {
  private readonly logger = new Logger(AgentGateway.name);

  constructor(private readonly agents: AgentService) {}

  @SubscribeMessage("agent:dispatch")
  async handleDispatch(
    @MessageBody() payload: unknown,
    @Ack() ack: (response: AgentDispatchAck) => void,
  ) {
    try {
      ack(await this.agents.dispatch(payload));
    } catch (error) {
      ack({ error: this.toError(error) });
    }
  }

  @SubscribeMessage("agent:stop")
  async handleStop(
    @ConnectedSocket() client: GreenhouseSocket,
    @MessageBody() payload: unknown,
  ) {
    try {
      await this.agents.stop(payload);
    } catch (error) {
      client.emit("error", this.toError(error));
    }
  }

  private toError(error: unknown) {
    const serverError = toServerError(error);
    if (serverError.code === "internal") this.logger.error(error);
    return serverError;
  }
}
