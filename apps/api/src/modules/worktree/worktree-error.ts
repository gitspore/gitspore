export type WorktreeErrorCode =
  "branch_exists" | "path_exists" | "outside_root" | "dirty";

export class WorktreeError extends Error {
  constructor(
    readonly code: WorktreeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WorktreeError";
  }
}
