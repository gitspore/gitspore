export type TerminalErrorCode =
  "unsafe_argument" | "agent_not_found" | "already_running" | "limit_reached";

export class TerminalError extends Error {
  constructor(
    readonly code: TerminalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TerminalError";
  }
}
