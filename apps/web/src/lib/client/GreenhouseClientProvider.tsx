"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { MockClient } from "../mock/MockClient";
import { resolveClientMode } from "./clientMode";
import { createClient } from "./createClient";
import type { GreenhouseClient } from "./GreenhouseClient";
import { resolveSessionToken } from "./sessionToken";

const ClientContext = createContext<GreenhouseClient | null>(null);

type Created = { client: GreenhouseClient } | { error: Error };

let cache: Created | null = null;

// Made on first use in the browser and kept, so a remount (StrictMode, hot
// reload of a component) gets the same client instead of a second one.
function getCreated(): Created {
  if (cache === null) {
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
      cache = { client: createClient(mode, token) };
    } catch (e) {
      cache = { error: e instanceof Error ? e : new Error(String(e)) };
    }
  }
  return cache;
}

// The client never changes after it was made, so there is nothing to follow.
function subscribeNever(): () => void {
  return () => {};
}

/**
 * Gives the whole app one GreenhouseClient: the mock or the daemon, chosen by
 * NEXT_PUBLIC_USE_MOCK and the URL (see resolveClientMode). Components use
 * useGreenhouseClient() and never learn which one they got.
 *
 * Holds no state of the greenhouse. Whoever keeps it (the zustand store) asks
 * for the client and listens to its events.
 *
 * For consumers: register your listeners in a useEffect that depends on the
 * client, and remove them in its cleanup. The provider calls connect() after
 * that, because React runs the effects of children before those of their
 * parent. The first event, `state:snapshot`, is sent inside connect() and
 * would be missed by a listener added later.
 *
 * The client is created in the browser, not while rendering: the URL is
 * unknown at build time (the app is a static export), and the mock must not
 * start on the server.
 */
export function GreenhouseClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  // null on the server and for the first render of the browser, then the
  // result. The client is made once per page load: a different ?mock needs a
  // reload.
  const created = useSyncExternalStore(subscribeNever, getCreated, () => null);
  const client = created && "client" in created ? created.client : null;

  // Runs after the effects of the children, see above.
  useEffect(() => {
    if (!client) return;

    client.connect();
    return () => client.disconnect();
  }, [client]);

  // A wrong URL or an invalid scenario file must be seen, not swallowed.
  if (created && "error" in created)
    return <ClientError error={created.error} />;

  return (
    <ClientContext.Provider value={client}>{children}</ClientContext.Provider>
  );
}

/** The client, or null for the first moment, until the browser has made it. */
export function useGreenhouseClient(): GreenhouseClient | null {
  return useContext(ClientContext);
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
