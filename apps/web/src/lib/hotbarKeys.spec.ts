import { hotbarKey, type KeyPress } from "./hotbarKeys";

// A digit pressed with no modifier while the page itself has focus.
function press(overrides: Partial<KeyPress> = {}): KeyPress {
  return {
    key: "3",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: { tagName: "BODY" },
    ...overrides,
  };
}

describe("hotbarKey", () => {
  it.each(["0", "1", "6"])("gives slot %s for that digit", (key) => {
    expect(hotbarKey(press({ key }))).toBe(Number(key));
  });

  it.each(["7", "9", "a", "Enter", "!"])("ignores %s", (key) => {
    expect(hotbarKey(press({ key }))).toBeNull();
  });

  it("works on a focused button, like a hotbar slot", () => {
    expect(hotbarKey(press({ target: { tagName: "BUTTON" } }))).toBe(3);
  });

  it.each([
    ["a terminal (xterm's textarea)", { tagName: "TEXTAREA" }],
    ["a text field", { tagName: "INPUT" }],
    ["a select", { tagName: "select" }],
    ["editable text", { tagName: "DIV", isContentEditable: true }],
  ])("ignores digits typed into %s", (_, target) => {
    expect(hotbarKey(press({ target }))).toBeNull();
  });

  it.each(["ctrlKey", "metaKey", "altKey"] as const)(
    "leaves a digit with %s to the browser",
    (modifier) => {
      expect(hotbarKey(press({ [modifier]: true }))).toBeNull();
    },
  );
});
