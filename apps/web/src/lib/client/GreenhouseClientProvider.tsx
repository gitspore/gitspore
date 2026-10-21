"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import { MockClient } from "../mock/MockClient";
import {
  bindStoreToClient,
  createGreenhouseStore,
  type GreenhouseStore,
  type GreenhouseStoreState,
} from "../store/greenhouseStore";
import { createTicker, type Ticker } from "../store/ticker";
import { resolveClientMode } from "./clientMode";
import { createClient } from "./createClient";
import type { GreenhouseClient } from "./GreenhouseClient";
import { resolveSessionToken } from "./sessionToken";

type Ready = {
  client: GreenhouseClient;
  store: GreenhouseStore;
  ticker: Ticker;
};

type Created = Ready | { error: Error };

const GreenhouseContext = createContext<Ready | null>(null);

// Kept on globalThis, not in a module variable: a hot reload runs this module
// again and would reset a variable, so a second client would open a second
// socket next to the first.
const CACHE_KEY = "__gitsporeGreenhouse";
const cacheHolder = globalThis as { [CACHE_KEY]?: Created };

// Made on first use in the browser and kept, so a remount (StrictMode, hot
// reload) gets the same client and store instead of a second one.
function getCreated(): Created {
  cacheHolder[CACHE_KEY] ??= create();
  return cacheHolder[CACHE_KEY];
}

function create(): Created {
  try {
    const mode = resolveClientMode({
      // Written out in full: Next replaces exactly this expression.
      useMockEnv: process.env.NEXT_PUBLIC_USE_MOCK,
      search: window.location.search,
    });
    // Only the daemon needs the token. Reading it also takes it out of the
    // address bar, so the mock leaves the URL alone.
    const token =
      mode.kind === "socket"
        ? resolveSessionToken({
            search: window.location.search,
            storage: window.sessionStorage,
            replaceSearch: (search) =>
              window.history.replaceState(
                null,
                "",
                window.location.pathname + search + window.location.hash,
              ),
          })
        : null;
    const client = createClient(mode, token);
    return {
      client,
      store: createGreenhouseStore(
        client,
        mode.kind === "mock" ? "mock" : "live",
      ),
      ticker: createTicker(() => client.now()),
    };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

// The client never changes after it was made, so there is nothing to follow.
function subscribeNever(): () => void {
  return () => {};
}

// Stands in until the browser has made the real one (server render and the
// first moment in the browser): no state, actions do nothing.
const PLACEHOLDER_STATUS = {
  kind: "offline",
  reason: "Not connected yet",
} as const;
const placeholderClient: GreenhouseClient = {
  connect: () => {},
  disconnect: () => {},
  emit: () => {},
  on: () => {},
  off: () => {},
  now: () => 0,
  getStatus: () => PLACEHOLDER_STATUS,
  subscribeStatus: () => () => {},
};
const placeholderStore = createGreenhouseStore(placeholderClient, "live");
const placeholderTicker: Ticker = {
  get: () => 0,
  subscribe: () => () => {},
};

/**
 * Gives the whole app one GreenhouseClient and the store fed by it: the mock
 * or the daemon, chosen by NEXT_PUBLIC_USE_MOCK and the URL (see
 * resolveClientMode). Components read the state with useGreenhouseStore()
 * and send commands through its actions; they never learn which client
 * they got.
 *
 * The store is bound to the client before connect(), so it gets the first
 * snapshot. Other consumers of raw client events (dev tools, the terminal for
 * terminal:data) register their listeners in a useEffect that depends on the
 * client: React runs the effects of children before those of their parent,
 * so they are in place before connect() as well.
 *
 * Everything is created in the browser, never on the server: the URL is
 * unknown at build time (the app is a static export), and the mock must not
 * start on the server. Creating happens in getSnapshot, so during a render,
 * but only once: the result is cached on globalThis and every later call
 * returns it.
 */
export function GreenhouseClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  // null on the server and for the first render of the browser, then the
  // result. Made once per page load: a different ?mock needs a reload.
  const created = useSyncExternalStore(subscribeNever, getCreated, () => null);
  const ready = created && "client" in created ? created : null;

  // Runs after the effects of the children, see above. In StrictMode it runs
  // twice; the cleanup in between closes the first connection.
  useEffect(() => {
    if (!ready) return;

    const unbind = bindStoreToClient(ready.store, ready.client);
    ready.client.connect();
    return () => {
      ready.client.disconnect();
      unbind();
    };
  }, [ready]);

  // A wrong URL or an invalid scenario file must be seen, not swallowed.
  if (created && "error" in created)
    return <ClientError error={created.error} />;

  return (
    <GreenhouseContext.Provider value={ready}>
      {children}
    </GreenhouseContext.Provider>
  );
}

/**
 * Reads from the store and re-renders when the selected value changes. The
 * value is compared with ===, so a selector that returns a new array or
 * object each time (`.filter`, `.map`, `[...]`, `{...}`) needs useShallow
 * from "zustand/react/shallow", which compares the contents instead:
 *
 *   useGreenhouseStore(useShallow(freeSlots))
 *
 * Without it React stops with "The result of getServerSnapshot should be
 * cached to avoid an infinite loop" (or getSnapshot).
 *
 * Until the client is made, it reads an empty store: no server state,
 * offline, actions do nothing.
 */
export function useGreenhouseStore<T>(
  selector: (state: GreenhouseStoreState) => T,
): T {
  const ready = useContext(GreenhouseContext);
  return useStore(ready?.store ?? placeholderStore, selector);
}

/**
 * "Now" on the client's clock, updated once a second by one shared ticker.
 * Use it for waiting times and wilting stages (see wilting.ts), never
 * Date.now(): in the mock it follows the playback speed.
 */
export function useNow(): number {
  const ticker = useContext(GreenhouseContext)?.ticker ?? placeholderTicker;
  return useSyncExternalStore(ticker.subscribe, ticker.get, () => 0);
}

/**
 * Like useNow, but re-renders only when select(now) gives a new result, not
 * on every tick. The result is compared with ===, so select must return a
 * plain value (string, number, boolean, null); a new object or array each
 * time would loop forever. Before the first tick now is 0.
 *
 *   const stage = useNowSelect((now) => wiltStage(agent, now));
 */
export function useNowSelect<T>(select: (now: number) => T): T {
  const ticker = useContext(GreenhouseContext)?.ticker ?? placeholderTicker;
  return useSyncExternalStore(
    ticker.subscribe,
    () => select(ticker.get()),
    () => select(0),
  );
}

/** The client, or null for the first moment, until the browser has made it. */
export function useGreenhouseClient(): GreenhouseClient | null {
  return useContext(GreenhouseContext)?.client ?? null;
}

/** The client if it is the mock (it has playback controls), otherwise null. */
export function useMockClient(): MockClient | null {
  const client = useGreenhouseClient();
  return client instanceof MockClient ? client : null;
}

function ClientError({ error }: { error: Error }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6">
      <div
        role="alert"
        className="max-w-xl rounded-panel bg-panel p-4 text-ink"
      >
        <h1 className="font-title text-lg">Could not start the client</h1>
        <p className="mt-2 font-mono text-sm break-words whitespace-pre-wrap">
          {error.message}
        </p>
      </div>
    </div>
  );
}
