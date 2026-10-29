"use client";

import { useEffect } from "react";

// Keys 0–6 press the hotbar slots (#72), F toggles focus mode (#169). Call the
// hook once (AppShell): each call adds its own window listener. GS-14 (keys
// 1–6 in the scene) extends pressSlot instead of calling this hook again.
// More keys (#153) go here too, not into a second listener.

// What hotbarKey reads from a keydown event; plain objects in tests.
export type KeyPress = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: TypingTarget | null;
};

type TypingTarget = { tagName?: string; isContentEditable?: boolean };

// A hotbar slot 0–6, or "focus" for F
export type HotbarKey = number | "focus";

/**
 * The slot or "focus" a key press means, or null when it means typing. A
 * terminal takes keys through xterm.js's hidden textarea, so "not while
 * typing in a field" also keeps a digit or an f typed into a terminal there.
 * With Ctrl, Cmd or Alt it is a shortcut of the browser or the system (Ctrl+F
 * searches the page), not ours.
 */
export function hotbarKey(press: KeyPress): HotbarKey | null {
  if (press.ctrlKey || press.metaKey || press.altKey) return null;
  if (isTyping(press.target)) return null;
  if (/^[0-6]$/.test(press.key)) return Number(press.key);
  if (press.key === "f" || press.key === "F") return "focus";
  return null;
}

function isTyping(target: TypingTarget | null): boolean {
  if (!target) return false;
  const tag = target.tagName?.toUpperCase();
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable === true
  );
}

/**
 * Calls onKey with 0–6 or "focus" for a key pressed anywhere on the page.
 * Off while `enabled` is false, e.g. while the setup screen covers the page.
 */
export function useHotbarKeys(
  onKey: (key: HotbarKey) => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = hotbarKey({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        target: event.target as HTMLElement | null,
      });
      if (key === null) return;
      event.preventDefault();
      onKey(key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKey, enabled]);
}
