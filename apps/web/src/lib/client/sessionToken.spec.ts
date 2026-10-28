import {
  extractToken,
  resolveSessionToken,
  SESSION_TOKEN_KEY,
} from "./sessionToken";

describe("extractToken", () => {
  it("returns the token from ?token=", () => {
    expect(extractToken("?token=abc123").token).toBe("abc123");
  });

  it("returns null when there is no token", () => {
    expect(extractToken("?mock=core-loop").token).toBeNull();
  });

  it("returns null for an empty search string", () => {
    expect(extractToken("")).toEqual({ token: null, search: "" });
  });

  it("returns null for an empty token value", () => {
    expect(extractToken("?token=").token).toBeNull();
  });

  it("removes the token from the remaining search", () => {
    expect(extractToken("?token=abc123&mock=core-loop").search).toBe(
      "?mock=core-loop",
    );
  });

  it("keeps other params like ?mock=core-loop&speed=10", () => {
    expect(extractToken("?token=abc123&mock=core-loop&speed=10")).toEqual({
      token: "abc123",
      search: "?mock=core-loop&speed=10",
    });
  });

  it("keeps the order of the other params", () => {
    expect(extractToken("?speed=10&token=abc123&mock=core-loop").search).toBe(
      "?speed=10&mock=core-loop",
    );
  });

  it("returns an empty search when the token was the only param", () => {
    expect(extractToken("?token=abc123")).toEqual({
      token: "abc123",
      search: "",
    });
  });

  it("decodes an encoded token", () => {
    expect(extractToken("?token=a%2Bb%3D%3D").token).toBe("a+b==");
  });

  it("returns the search unchanged when there is no token", () => {
    expect(extractToken("?mock=core-loop&speed=10").search).toBe(
      "?mock=core-loop&speed=10",
    );
  });
});

describe("resolveSessionToken", () => {
  function setup({
    search = "",
    stored,
  }: { search?: string; stored?: string } = {}) {
    const store = new Map<string, string>();
    if (stored !== undefined) store.set(SESSION_TOKEN_KEY, stored);
    const storage = {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value);
      }),
    };
    const replaceSearch = jest.fn();
    const resolve = () =>
      resolveSessionToken({ search, storage, replaceSearch });
    return { store, storage, replaceSearch, resolve };
  }

  it("stores the token from the url in the storage", () => {
    const { resolve, store } = setup({ search: "?token=abc123" });

    expect(resolve()).toBe("abc123");
    expect(store.get(SESSION_TOKEN_KEY)).toBe("abc123");
  });

  it("removes only the token from the address bar", () => {
    const { resolve, replaceSearch } = setup({
      search: "?token=abc123&mock=core-loop&speed=10",
    });

    resolve();

    expect(replaceSearch).toHaveBeenCalledTimes(1);
    expect(replaceSearch).toHaveBeenCalledWith("?mock=core-loop&speed=10");
  });

  it("leaves the address bar untouched when the url has no token", () => {
    const { resolve, replaceSearch } = setup({
      search: "?mock=core-loop",
      stored: "old",
    });

    resolve();

    expect(replaceSearch).not.toHaveBeenCalled();
  });

  it("returns the stored token when the url has none", () => {
    const { resolve } = setup({ search: "?mock=core-loop", stored: "stored" });

    expect(resolve()).toBe("stored");
  });

  it("prefers a new token in the url over the stored one", () => {
    const { resolve, store } = setup({
      search: "?token=fresh",
      stored: "stale",
    });

    expect(resolve()).toBe("fresh");
    expect(store.get(SESSION_TOKEN_KEY)).toBe("fresh");
  });

  it("returns null when neither url nor storage has a token", () => {
    const { resolve } = setup();

    expect(resolve()).toBeNull();
  });

  it("does not throw when the storage is unavailable", () => {
    const replaceSearch = jest.fn();
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(
      resolveSessionToken({ search: "?token=abc123", storage, replaceSearch }),
    ).toBe("abc123");
    expect(
      resolveSessionToken({ search: "", storage, replaceSearch }),
    ).toBeNull();
  });
});
