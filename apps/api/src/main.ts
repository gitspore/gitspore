import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PRODUCT_NAME } from "@gitspore/shared";
import { AppModule } from "./app.module";
import { daemonPort } from "./config/daemon-port";
import {
  allowedOrigins,
  SessionAuth,
} from "./modules/gateway/session-auth.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // On Ctrl+C or SIGTERM, Nest calls onApplicationShutdown: TerminalService
  // ends every agent and what it started, so nothing outlives the daemon.
  app.enableShutdownHooks();

  // The daemon runs as its own process next to the Next.js app, so the
  // browser calls it cross-origin.
  app.enableCors({ origin: allowedOrigins() });

  // Next dev already owns 3000.
  const port = daemonPort();
  await app.listen(port, "127.0.0.1");

  Logger.log(
    `${PRODUCT_NAME} API daemon listening on http://localhost:${port}`,
    "Bootstrap",
  );

  // The web client takes the token from the link and remembers it, so it is
  // clicked once, not typed in.
  const [webOrigin] = allowedOrigins();
  Logger.log(
    `Open ${PRODUCT_NAME}: ${webOrigin}/?token=${app.get(SessionAuth).token}`,
    "Bootstrap",
  );
}

// Nothing above can recover a failed boot, so surface it and exit non-zero
// rather than leaving a half-started daemon behind.
bootstrap().catch((error) => {
  Logger.error(error, "Bootstrap");
  process.exit(1);
});
