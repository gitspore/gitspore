import { leavesTerminal, type LeaveKeyPress } from "./leaveKey";

// Ctrl + the key left of 1 on a US keyboard.
function press(overrides: Partial<LeaveKeyPress> = {}): LeaveKeyPress {
  return {
    code: "Backquote",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    ...overrides,
  };
}

describe("leavesTerminal", () => {
  // event.code is the key's place, the same on a US and a German layout
  it("leaves with Ctrl and the key left of 1", () => {
    expect(leavesTerminal(press())).toBe(true);
  });

  it("knows the key on Apple's ISO keyboards", () => {
    expect(leavesTerminal(press({ code: "IntlBackslash" }))).toBe(true);
  });

  it("leaves the key without Ctrl to the terminal", () => {
    expect(leavesTerminal(press({ ctrlKey: false }))).toBe(false);
  });

  it.each(["metaKey", "altKey"] as const)(
    "leaves it with %s to the browser",
    (modifier) => {
      expect(leavesTerminal(press({ [modifier]: true }))).toBe(false);
    },
  );

  it.each(["Tab", "Escape", "Digit1", "KeyC"])(
    "leaves Ctrl + %s to the terminal",
    (code) => {
      expect(leavesTerminal(press({ code }))).toBe(false);
    },
  );
});
