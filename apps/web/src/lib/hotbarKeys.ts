"use client";

import { useEffect } from "react";

// Keys 0–6 press the hotbar slots (#72). The one place that listens for them;
// GS-14 (keys 1–6 in the scene) uses it too instead of a second listener.

// What hotbarKey reads from a keydown event; plain objects in tests.
export type KeyPress = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: TypingTarget | null;
};

type TypingTarget = { tagName?: string; isContentEditable?: boolean };

/**
 * The slot a key press means, or null when it means typing. A terminal takes
 * keys through xterm.js's hidden textarea, so "not while typing in a field"
 * also keeps a digit typed into a terminal there. With Ctrl, Cmd or Alt it
 * is a shortcut of the browser or the system, not a slot.
 */
export function hotbarKey(press: KeyPress): number | null {
  if (!/^[0-6]$/.test(press.key)) return null;
  if (press.ctrlKey || press.metaKey || press.altKey) return null;
  if (isTyping(press.target)) return null;
  return Number(press.key);
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

/** Calls onSlot with 0–6 for a hotbar key pressed anywhere on the page. */
export function useHotbarKeys(onSlot: (key: number) => void): void {
  useEffect(() => {
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
      onSlot(key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSlot]);
}
