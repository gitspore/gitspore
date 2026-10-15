export const SESSION_TOKEN_KEY = "gitspore.sessionToken";

/**
 * Splits the session token off a query string.
 *
 * `search` is `window.location.search`. The result holds the token (null if it
 * is missing or empty) and the query string without it, so the other params
 * like `?mock=core-loop&speed=10` stay as they were. The rest is "" or starts
 * with "?".
 */
export function extractToken(search: string): {
  token: string | null;
  search: string;
} {
  const params = new URLSearchParams(search);
  const token = params.get("token") || null;
  if (!params.has("token")) return { token, search };

  params.delete("token");
  const rest = params.toString();
  return { token, search: rest ? `?${rest}` : "" };
}

/**
 * Finds the session token for the daemon: a token in the URL wins and is
 * remembered in the session storage, otherwise the remembered one is used.
 * A token in the URL is removed from the address bar, so it does not stay in
 * the history or get copied around.
 *
 * Storage can be blocked by the browser. Then the token from the URL still
 * works, it is just not remembered across a reload.
 */
export function resolveSessionToken({
  search,
  storage,
  replaceSearch,
}: {
  search: string;
  storage: Pick<Storage, "getItem" | "setItem">;
  replaceSearch: (search: string) => void;
}): string | null {
  const { token, search: rest } = extractToken(search);

  if (rest !== search) replaceSearch(rest);

  try {
    if (token) {
      storage.setItem(SESSION_TOKEN_KEY, token);
      return token;
    }
    return storage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return token;
  }
}
