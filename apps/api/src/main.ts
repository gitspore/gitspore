import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PRODUCT_NAME } from "@gitspore/shared";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // The daemon runs as its own process next to the Next.js app, so the
  // browser calls it cross-origin.
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000" });

  // Next dev already owns 3000.
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, "127.0.0.1");

  Logger.log(
    `${PRODUCT_NAME} API daemon listening on http://localhost:${port}`,
    "Bootstrap",
  );
}

// Nothing above can recover a failed boot, so surface it and exit non-zero
// rather than leaving a half-started daemon behind.
bootstrap().catch((error) => {
  Logger.error(error, "Bootstrap");
  process.exit(1);
});
