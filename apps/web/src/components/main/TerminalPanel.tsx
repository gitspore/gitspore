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
import { TERMINAL_FONT } from "@/lib/terminal/font";
import { leavesTerminal } from "@/lib/terminal/leaveKey";
import { TerminalSession } from "@/lib/terminal/TerminalSession";
//
//
//
// PTY resize at most every (Claude redraws on each):
const PTY_RESIZE_THROTTLE_MS = 200;

// xterm needs browser.
// ssr: false

export type TerminalTheme = keyof typeof xtermTheme;

export function TerminalPanel({
  agentId,
  theme,
  focused,
}: {
  agentId: AgentId;
  theme: TerminalTheme;
  // Its window is the focused one: the terminal takes the keys (S13)
  focused: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  // Read by the effect below without making it build a new terminal
  const focusedRef = useRef(focused);
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
    const terminal = new Terminal({
      theme: xtermTheme[theme],
      ...TERMINAL_FONT,
    });
    // Don't answer "which terminal are you?"
    // (CSI c)
    // question is replayed from scrollback
    // on every open. Answer would
    // reach shell as typed text ("1;2c").
    terminal.parser.registerCsiHandler({ final: "c" }, () => true);
    // Ctrl + the key left of 1 leaves the terminal for its hotbar slot
    // (#120); the shell never gets it. The window stays the focused one
    terminal.attachCustomKeyEventHandler((event) => {
      if (!leavesTerminal(event)) return true;
      if (event.type === "keydown") {
        event.preventDefault();
        leaveTerminal(terminal, agentId);
      }
      return false;
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    const session = new TerminalSession(terminal, client, actions);
    // PTY gets size at most every 200 ms.
    // timer reads cols/rows when it fires:
    // last send = final size
    let lastSent = 0;
    let ptyTimer: ReturnType<typeof setTimeout> | undefined;
    const resizePty = () => {
      ptyTimer = undefined;
      lastSent = performance.now();
      session.resize(terminal.cols, terminal.rows);
    };
    // hidden = no size
    // fitting when hidden would shrink the agent's terminal
    // to 2 × 1 because of xterm minimum
    const fitToContainer = () => {
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      fitAddon.fit();
      if (ptyTimer !== undefined) return;
      const wait = PTY_RESIZE_THROTTLE_MS - (performance.now() - lastSent);
      if (wait <= 0) resizePty();
      else ptyTimer = setTimeout(resizePty, wait);
    };

    fitToContainer();
    void session.open(agentId);
    terminalRef.current = terminal;
    if (focusedRef.current) terminal.focus();

    // first fit after observe().
    // Observer reports after layout, before paint:
    // fit lands in the same frame.
    // at most once per frame
    const observer = new ResizeObserver(fitToContainer);
    observer.observe(container);
    return () => {
      observer.disconnect();
      session.dispose();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [client, connected, agentId, actions, theme]);

  // The window became the focused one (a slot, a pot, a notification)
  useEffect(() => {
    focusedRef.current = focused;
    if (focused) terminalRef.current?.focus();
  }, [focused]);
  return <div ref={containerRef} className="size-full" />;
}

// Focus the agent's hotbar slot, with the keyboard focus ring, so Tab and
// keys 0–6 work from there. Without a slot the focus just leaves
function leaveTerminal(terminal: Terminal, agentId: AgentId) {
  const slot = document.querySelector<HTMLElement>(
    `.hotbar-slot[data-agent-id="${agentId}"]`,
  );
  if (slot) slot.focus({ focusVisible: true });
  else terminal.blur();
}
