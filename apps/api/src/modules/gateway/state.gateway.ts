import {
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import { allowedOrigins, SessionAuth } from "./session-auth.service";
import { StateStore } from "../state/state.store";
import { Server, Socket } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents } from "@gitspore/shared";

type GreenhouseServer = Server<ClientToServerEvents, ServerToClientEvents>;
type GreenhouseSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

function sendSnapshot(client: GreenhouseSocket, store: StateStore) {
  client.emit("state:snapshot", store.snapshot());
}

@WebSocketGateway({ cors: { origin: allowedOrigins() } })
export class StateGateway implements OnGatewayInit, OnGatewayConnection {
  constructor(
    private readonly auth: SessionAuth,
    private readonly store: StateStore,
  ) {}

  afterInit(server: GreenhouseServer) {
    server.use((socket, next) => {
      const { headers, auth } = socket.handshake;

      if (
        !this.auth.isOriginAllowed(headers.origin) ||
        !this.auth.isHostAllowed(headers.host) ||
        !this.auth.isTokenValid(auth.token)
      ) {
        return next(new Error("unauthorized"));
      }
      next();
    });

    this.store.onPatch((patch) => server.emit("state:patch", patch));
  }

  handleConnection(client: GreenhouseSocket) {
    sendSnapshot(client, this.store);
  }

  @SubscribeMessage("state:request")
  handleStateRequest(client: GreenhouseSocket) {
    sendSnapshot(client, this.store);
  }
}
