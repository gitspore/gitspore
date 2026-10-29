import { useState } from "react";
import { useCursor } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";

//
//
//
// How far the pointer may move between press and release, in pixels,
// and still count as a click
export const DRAG_PX = 4;

// Click and hover for a scene object (a pot, the book). onOpen runs on a
// click, with whether shift was held; null means nothing to open, so no hand and no outline. A press
// that moved more than DRAG_PX before the release was an orbit drag, not
// a click. stopPropagation: only the front object reacts, not the ones
// behind it. Spread the handlers onto the object's group
export function useClickable(onOpen: ((shift: boolean) => void) | null) {
  const [hovered, setHovered] = useState(false);
  const active = hovered && onOpen !== null;
  useCursor(active);

  const handlers = {
    onClick: (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      if (onOpen && event.delta <= DRAG_PX) onOpen(event.shiftKey);
    },
    onPointerOver: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      setHovered(true);
    },
    onPointerOut: () => setHovered(false),
  };
  return { hovered: active, handlers };
}
