"use client";

import { xtermTheme } from "@/theme/tokens";
import type { AgentId } from "@gitspore/shared";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  useGreenhouseClient,
  useGreenhouseStore,
} from "@/lib/client/GreenhouseClientProvider";
import { TERMINAL_FONT } from "@/lib/terminal/font";
import { copiesSelection } from "@/lib/terminal/copyKey";
import { leavesTerminal } from "@/lib/terminal/leaveKey";
import { programClipboard } from "@/lib/terminal/programClipboard";
import { TerminalSession } from "@/lib/terminal/TerminalSession";
import { StartingBeetle } from "./StartingBeetle";

//
//
//
// PTY resize at most every (Claude redraws on each):
const PTY_RESIZE_THROTTLE_MS = 200;
// The beetle scuttles at least this long, so it never just flickers
const BEETLE_MIN_MS = 1200;
// Agents whose window showed the beetle on this page. Later opens replay
// the scrollback right away and go without it
const greeted = new Set<AgentId>();

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
  // The first open of this agent's window waits for its first output
  const [waiting, setWaiting] = useState(() => !greeted.has(agentId));
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
    // Programs copy with OSC 52; Claude Code does on its own selection
    const programCopy = programClipboard((text) =>
      navigator.clipboard.writeText(text),
    );
    terminal.loadAddon(new ClipboardAddon(undefined, programCopy));
    // A program asking for the clipboard gets no answer,
    // not even an empty one:
    // the addon sends it as typed text ("52;c;" at the prompt).
    // Registered after the addon, so it runs first
    terminal.parser.registerOscHandler(52, (data) => data.endsWith(";?"));

    // Ctrl + the key left of 1 leaves the terminal for its hotbar slot
    // (#120); the shell never gets it. The window stays the focused one
    // Ctrl+Shift+C copies; preventDefault keeps Chrome's element picker shut,
    // even with nothing selected
    terminal.attachCustomKeyEventHandler((event) => {
      if (copiesSelection(event)) {
        if (event.type === "keydown") {
          event.preventDefault();
          copySelection(terminal, programCopy.lastCopy);
        }
        return false;
      }
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

    // Right-click: xterm puts its own selection into its textarea for the
    // browser's Copy. Under Claude Code that is empty, so offer what it copied
    const textarea = terminal.textarea;
    const offerProgramCopy = () => {
      if (!textarea || textarea.value || !programCopy.lastCopy) return;
      textarea.value = programCopy.lastCopy;
      textarea.select();
    };
    // A new click or drag starts a new selection
    const forgetProgramCopy = (event: MouseEvent) => {
      if (event.button === 0) programCopy.forget();
    };
    container.addEventListener("contextmenu", offerProgramCopy);
    container.addEventListener("mousedown", forgetProgramCopy, true);
    // A press, a release (the end of a drag) or a key in this terminal
    // lets the program's next copy through;
    // replayed output comes without one
    const noteUserAction = () => programCopy.userActed();
    container.addEventListener("mousedown", noteUserAction, true);
    container.addEventListener("mouseup", noteUserAction, true);
    container.addEventListener("keydown", noteUserAction, true);

    const session = new TerminalSession(terminal, client, actions);
    // The beetle goes once the first output is on screen, after at least
    // BEETLE_MIN_MS
    const shownAt = performance.now();
    let beetleTimer: ReturnType<typeof setTimeout> | undefined;
    const firstOutput = terminal.onWriteParsed(() => {
      firstOutput.dispose();
      greeted.add(agentId);
      const wait = BEETLE_MIN_MS - (performance.now() - shownAt);
      beetleTimer = setTimeout(() => setWaiting(false), Math.max(0, wait));
    });
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
      container.removeEventListener("contextmenu", offerProgramCopy);
      container.removeEventListener("mousedown", forgetProgramCopy, true);
      container.removeEventListener("mousedown", noteUserAction, true);
      container.removeEventListener("mouseup", noteUserAction, true);
      container.removeEventListener("keydown", noteUserAction, true);
      firstOutput.dispose();
      clearTimeout(beetleTimer);

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
  return (
    <div className="relative size-full">
      <div ref={containerRef} className="size-full" />
      {/* In the terminal's colours, so the window isn't blank meanwhile.
          Clicks go through to the terminal underneath */}
      {waiting && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-terminal-bg text-terminal-fg">
          <StartingBeetle />
        </div>
      )}
    </div>
  );
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

// The terminal's own selection, else what a program like Claude Code copied
function copySelection(terminal: Terminal, programCopy: string) {
  const text = terminal.getSelection() || programCopy;
  if (text) void navigator.clipboard.writeText(text).catch(() => {});
}
