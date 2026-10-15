import { useSyncExternalStore } from "react";

// Should the 3D scene be drawn? No with `?scene=off` in the URL or when the
// browser has no WebGL (#18). Read in the browser: the app is a static export
// (next.config.ts), so there is no server to read the URL.

let cached: boolean | undefined;

function sceneEnabled() {
  cached ??=
    new URLSearchParams(window.location.search).get("scene") !== "off" &&
    Boolean(document.createElement("canvas").getContext("webgl2"));
  return cached;
}

// The answer doesn't change while the page is open, so nothing to subscribe to
const subscribe = () => () => {};

// false while rendering the HTML (the browser isn't known yet), then the real
// answer. useSyncExternalStore swaps the two without a hydration error.
export function useSceneEnabled() {
  return useSyncExternalStore(subscribe, sceneEnabled, () => false);
}
