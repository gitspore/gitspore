import { statusFromHook, type HookOutcome } from "./hook-status";

const WORKING: HookOutcome = { kind: "set", status: "working" };
const NEEDS_INPUT: HookOutcome = { kind: "set", status: "needs_input" };
const KEEP: HookOutcome = { kind: "keep" };

describe("statusFromHook", () => {
  it.each(["UserPromptSubmit", "PreToolUse", "PostToolUse"])(
    "%s means working",
    (event) => {
      expect(statusFromHook({ hook_event_name: event })).toEqual(WORKING);
    },
  );

  it("PermissionRequest means needs_input", () => {
    expect(statusFromHook({ hook_event_name: "PermissionRequest" })).toEqual(
      NEEDS_INPUT,
    );
  });

  it.each([
    "permission_prompt",
    "elicitation_dialog",
    "elicitation_url_dialog",
  ])("Notification %s means needs_input", (type) => {
    expect(
      statusFromHook({
        hook_event_name: "Notification",
        notification_type: type,
      }),
    ).toEqual(NEEDS_INPUT);
  });

  it("Notification idle_prompt keeps the status, so it doesn't overwrite done", () => {
    expect(
      statusFromHook({
        hook_event_name: "Notification",
        notification_type: "idle_prompt",
      }),
    ).toEqual(KEEP);
  });

  it("Notification without a type keeps the status", () => {
    expect(statusFromHook({ hook_event_name: "Notification" })).toEqual(KEEP);
  });

  it("Stop leaves the decision to the PR check", () => {
    expect(statusFromHook({ hook_event_name: "Stop" })).toEqual({
      kind: "stop",
    });
  });

  it("StopFailure means error", () => {
    expect(statusFromHook({ hook_event_name: "StopFailure" })).toEqual({
      kind: "set",
      status: "error",
    });
  });

  it.each(["SessionStart", "PreCompact", "SomethingNew"])(
    "%s keeps the status",
    (event) => {
      expect(statusFromHook({ hook_event_name: event })).toEqual(KEEP);
    },
  );
});
