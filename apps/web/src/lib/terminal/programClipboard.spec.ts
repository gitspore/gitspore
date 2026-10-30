import { programClipboard, USER_ACTION_WINDOW_MS } from "./programClipboard";

// The test's clock; tests move it forward instead of waiting
let time = 0;
const now = () => time;

beforeEach(() => {
  time = 0;
});

// A clipboard whose terminal the user just clicked in
function actedClipboard(
  write: (text: string) => Promise<void> = async () => {},
) {
  const clipboard = programClipboard(write, now);
  clipboard.userActed();
  return clipboard;
}

describe("programClipboard", () => {
  it("never gives a program the clipboard", () => {
    expect(actedClipboard().readText()).toBe("");
  });

  it("writes what a program copies and keeps it", async () => {
    const written: string[] = [];
    const clipboard = actedClipboard(async (text) => {
      written.push(text);
    });
    await clipboard.writeText("c", "hello");
    expect(written).toEqual(["hello"]);
    expect(clipboard.lastCopy).toBe("hello");
  });

  it("forgets the copy", async () => {
    const clipboard = actedClipboard();
    await clipboard.writeText("c", "hello");
    clipboard.forget();
    expect(clipboard.lastCopy).toBe("");
  });

  it("keeps the copy when the browser refuses the clipboard", async () => {
    const clipboard = actedClipboard(() => Promise.reject(new Error("no")));
    await expect(clipboard.writeText("c", "hello")).resolves.toBeUndefined();
    expect(clipboard.lastCopy).toBe("hello");
  });

  // Replayed scrollback after a rebuild: nobody has acted in the new terminal
  it("ignores a copy before the user did anything", async () => {
    const written: string[] = [];
    const clipboard = programClipboard(async (text) => {
      written.push(text);
    }, now);
    await clipboard.writeText("c", "old copy");
    expect(written).toEqual([]);
    expect(clipboard.lastCopy).toBe("");
  });

  it("takes a copy at the end of the window", async () => {
    const clipboard = actedClipboard();
    time = USER_ACTION_WINDOW_MS;
    await clipboard.writeText("c", "hello");
    expect(clipboard.lastCopy).toBe("hello");
  });

  // An agent copying on its own, long after the last click or key
  it("ignores a copy after the window", async () => {
    const written: string[] = [];
    const clipboard = actedClipboard(async (text) => {
      written.push(text);
    });
    time = USER_ACTION_WINDOW_MS + 1;
    await clipboard.writeText("c", "planted");
    expect(written).toEqual([]);
    expect(clipboard.lastCopy).toBe("");
  });
});
