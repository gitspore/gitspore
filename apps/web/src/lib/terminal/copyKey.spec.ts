import { copiesSelection, type CopyKeyPress } from "./copyKey";

// Ctrl+Shift+C on any layout.
function press(overrides: Partial<CopyKeyPress> = {}): CopyKeyPress {
  return {
    code: "KeyC",
    ctrlKey: true,
    shiftKey: true,
    metaKey: false,
    altKey: false,
    ...overrides,
  };
}

describe("copiesSelection", () => {
  // event.code is the key's place, so it copies with a Greek or German layout too
  it("copies with Ctrl+Shift+C", () => {
    expect(copiesSelection(press())).toBe(true);
  });

  it("leaves Ctrl+C to the shell as an interrupt", () => {
    expect(copiesSelection(press({ shiftKey: false }))).toBe(false);
  });

  it("leaves Shift+C to the shell", () => {
    expect(copiesSelection(press({ ctrlKey: false }))).toBe(false);
  });

  it.each(["metaKey", "altKey"] as const)(
    "leaves it with %s to the browser",
    (modifier) => {
      expect(copiesSelection(press({ [modifier]: true }))).toBe(false);
    },
  );

  it.each(["KeyV", "KeyX", "Digit1"])(
    "leaves Ctrl+Shift + %s alone",
    (code) => {
      expect(copiesSelection(press({ code }))).toBe(false);
    },
  );
});
