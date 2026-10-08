import { Injectable } from "@nestjs/common";
import { randomBytes, timingSafeEqual } from "node:crypto";

export function allowedOrigins(): string[] {
  return (process.env.WEB_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

@Injectable()
export class SessionAuth {
  readonly token = randomBytes(32).toString("hex");
  private readonly origins = allowedOrigins();

  isTokenValid(candidate: unknown): boolean {
    if (typeof candidate !== "string") return false;

    const expected = Buffer.from(this.token);
    const actual = Buffer.from(candidate);

    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  isOriginAllowed(origin: string | undefined): boolean {
    if (origin === undefined) return false;

    return this.origins.includes(origin);
  }

  isHostAllowed(host: string | undefined): boolean {
    if (host === undefined) return false;

    try {
      return LOCAL_HOSTNAMES.has(new URL(`http://${host}`).hostname);
    } catch {
      return false;
    }
  }
}
