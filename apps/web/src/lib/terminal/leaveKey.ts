// Ctrl + the key left of 1 leaves the terminal (#120), so the keyboard is
// never trapped in it (WCAG 2.1.2). Tab and Esc stay with the shell and
// Claude Code.

// What leavesTerminal reads from a key event; plain objects in tests.
export type LeaveKeyPress = {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
};

// The key left of 1 by its place, not its character: ` on a US layout, ^ on
// a German one, where ` is a dead key. Apple's ISO keyboards report that key
// as IntlBackslash.
const KEY_LEFT_OF_1 = ["Backquote", "IntlBackslash"];

/** Whether a key press in a terminal means "leave the terminal". */
export function leavesTerminal(press: LeaveKeyPress): boolean {
  return (
    KEY_LEFT_OF_1.includes(press.code) &&
    press.ctrlKey &&
    !press.metaKey &&
    !press.altKey
  );
}
