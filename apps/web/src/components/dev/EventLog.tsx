"use client";

import { useEffect } from "react";
import { useGreenhouseClient } from "@/lib/client/GreenhouseClientProvider";

// Dev tool: writes every event the client receives to the browser console.
// terminal:data is left out, it arrives too often to read.
export function EventLog() {
  const client = useGreenhouseClient();

  useEffect(() => {
    if (!client) return;

    const onSnapshot = (state: unknown) =>
      console.log("[event] state:snapshot", state);
    const onPatch = (patch: unknown) =>
      console.log("[event] state:patch", patch);
    const onExit = (payload: unknown) =>
      console.log("[event] terminal:exit", payload);
    const onError = (error: unknown) => console.log("[event] error", error);

    client.on("state:snapshot", onSnapshot);
    client.on("state:patch", onPatch);
    client.on("terminal:exit", onExit);
    client.on("error", onError);
    const unsubscribeStatus = client.subscribeStatus(() =>
      console.log("[status]", client.getStatus()),
    );
    return () => {
      unsubscribeStatus();
      client.off("state:snapshot", onSnapshot);
      client.off("state:patch", onPatch);
      client.off("terminal:exit", onExit);
      client.off("error", onError);
    };
  }, [client]);

  return null;
}
