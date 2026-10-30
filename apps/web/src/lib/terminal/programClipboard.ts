// The clipboard that programs in the terminal get through OSC 52 (#55).
// Claude Code selects text itself and copies it this way, so xterm has no
// selection of its own; the right-click and Ctrl+Shift+C use the kept copy.
// Programs may write the clipboard, never read it:
// an agent could otherwise
// ask for whatever was copied last.

// A program's copy counts only this soon after the user clicked or typed in
// its terminal. Replayed scrollback (on every rebuild) and an agent copying
// on its own come later and are ignored
export const USER_ACTION_WINDOW_MS = 2000;

// Fits the addon's IClipboardProvider; plain strings, because the addon
// types the selection ("c", "p") as a const enum, which tests can't import
export type ProgramClipboard = {
  /** What a program copied last; "" when there is nothing or it was forgotten. */
  readonly lastCopy: string;
  /** A new click or drag in the terminal: the old copy no longer applies. */
  forget(): void;
  /** The user released the mouse or pressed a key in the terminal. */
  userActed(): void;
  readText(): string;
  writeText(selection: string, text: string): Promise<void>;
};

export function programClipboard(
  write: (text: string) => Promise<void>,
  now: () => number = Date.now,
): ProgramClipboard {
  let lastCopy = "";
  let actedAt = -Infinity;
  return {
    get lastCopy() {
      return lastCopy;
    },
    forget() {
      lastCopy = "";
    },
    userActed() {
      actedAt = now();
    },
    readText: () => "",
    writeText: (_selection, text) => {
      if (now() - actedAt > USER_ACTION_WINDOW_MS) return Promise.resolve();
      lastCopy = text;
      return write(text).catch(() => {});
    },
  };
}
