// Ctrl+Shift+C copies in the terminal, like in Linux terminals (#55).
// Ctrl+C stays an interrupt; on a Mac, Cmd+C copies natively.

// What copiesSelection reads from a key event; plain objects in tests.
export type CopyKeyPress = {
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  altKey: boolean;
};

// The C key by its place, not its character, so it copies with a Greek
// or Cyrillic layout too
/** Whether a key press in a terminal means "copy the selection". */
export function copiesSelection(press: CopyKeyPress): boolean {
  return (
    press.code === "KeyC" &&
    press.ctrlKey &&
    press.shiftKey &&
    !press.metaKey &&
    !press.altKey
  );
}
