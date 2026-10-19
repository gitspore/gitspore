"use client";

import { xtermTheme } from "@/theme/tokens";
import type { AgentId } from "@gitspore/shared";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  useGreenhouseClient,
  useGreenhouseStore,
} from "@/lib/client/GreenhouseClientProvider";
import { TerminalSession } from "@/lib/terminal/TerminalSession";
//
//
//
// only check size when size has stopped changing for:
const RESIZE_DEBOUNCE_MS = 100;
// xterm needs browser.
// ssr: false

export type TerminalTheme = keyof typeof xtermTheme;

export function TerminalPanel({
  agentId,
  theme,
}: {
  agentId: AgentId;
  theme: TerminalTheme;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const client = useGreenhouseClient();
  // openTerminal waits connection to load.
  const connected = useGreenhouseStore(
    (state) => state.connection.kind === "connected",
  );
  const actions = useGreenhouseStore(
    useShallow((state) => ({
      openTerminal: state.openTerminal,
      sendTerminalInput: state.sendTerminalInput,
      resizeTerminal: state.resizeTerminal,
      closeTerminal: state.closeTerminal,
    })),
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!client || !connected || !container) return;
    const terminal = new Terminal({ theme: xtermTheme[theme] });
    // Don't answer "which terminal are you?"
    // (CSI c)
    // question is replayed from scrollback
    // on every open. Answer would
    // reach shell as typed text ("1;2c").
    terminal.parser.registerCsiHandler({ final: "c" }, () => true);

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    const session = new TerminalSession(terminal, client, actions);
    // hidden = no size
    // fitting when hidden would shrink the agent's terminal
    // to 2 × 1 because of xterm minimum
    const fitToContainer = () => {
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      fitAddon.fit();
      session.resize(terminal.cols, terminal.rows);
    };
    fitToContainer();
    void session.open(agentId);

    // first fit after observe().
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(fitToContainer, RESIZE_DEBOUNCE_MS);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      session.dispose();
      terminal.dispose();
    };
  }, [client, connected, agentId, actions, theme]);
  return <div ref={containerRef} className="size-full" />;
}
