export type TerminalErrorCode = "unsafe_argument";

export class TerminalError extends Error {
  constructor(
    readonly code: TerminalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TerminalError";
  }
}
