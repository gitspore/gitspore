import { useSyncExternalStore } from "react";

// The scene options from the settings panel (#111). The user's choices live
// in localStorage, per browser. URL flags (?shadows, ?fx, ?orbit) override
// them, for testing. Read in the browser only, like scene.ts.

export type SceneSettings = {
  // Turns off shadows, glow, camera motion, garden life and fog, whatever
  // is stored
  lowPower: boolean;
  shadows: boolean;
  // Bloom (post-processing); the URL flag is ?fx
  glow: boolean;
  // OrbitControls: turn and zoom; the URL flag is ?orbit
  cameraMotion: boolean;
  // Grass, flowers, insects and the string lights; the URL flag is ?life
  life: boolean;
  // Birds by day, crickets at night (#172). Not a scene option: low power
  // and the URL flags leave it alone
  ambientSound: boolean;
  // The FPS meter bottom left (#179). Like ambientSound, not a scene option
  fpsMeter: boolean;
};

// The options a URL flag can set, and what the scene finally draws
export type SceneOption = "shadows" | "glow" | "cameraMotion" | "life";
export type SceneFlags = Partial<Record<SceneOption, boolean>>;
export type SceneOptions = Record<SceneOption | "fog", boolean>;

export const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  lowPower: false,
  shadows: true,
  glow: true,
  cameraMotion: true,
  life: true,
  ambientSound: true,
  fpsMeter: false,
};

export const URL_FLAGS: Record<SceneOption, string> = {
  shadows: "shadows",
  glow: "fx",
  cameraMotion: "orbit",
  life: "life",
};

export const STORAGE_KEY = "gitspore.scene";

export function parseStored(raw: string | null): SceneSettings {
  if (raw === null) return DEFAULT_SCENE_SETTINGS;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_SCENE_SETTINGS;
  }
  if (typeof data !== "object" || data === null) return DEFAULT_SCENE_SETTINGS;

  const entries = Object.entries(DEFAULT_SCENE_SETTINGS).map(([key, value]) => {
    const stored = (data as Record<string, unknown>)[key];
    return [key, typeof stored === "boolean" ? stored : value];
  });
  return Object.fromEntries(entries) as SceneSettings;
}

export function parseUrlFlags(params: URLSearchParams): SceneFlags {
  const flags: SceneFlags = {};
  for (const [option, name] of Object.entries(URL_FLAGS)) {
    const value = params.get(name);
    if (value !== null) {
      flags[option as SceneOption] = value !== "off" && value !== "0";
    }
  }
  return flags;
}

export function resolveScene(
  stored: SceneSettings,
  flags: SceneFlags,
): SceneOptions {
  const on = !stored.lowPower;
  return {
    shadows: on && stored.shadows,
    glow: on && stored.glow,
    cameraMotion: on && stored.cameraMotion,
    life: on && stored.life,
    ...flags,
    fog: on,
  };
}

const listeners = new Set<() => void>();
let lastRaw: string | null = null;
let lastStored = DEFAULT_SCENE_SETTINGS;
let urlFlags: SceneFlags | undefined;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getStored(): SceneSettings {
  const raw = readRaw();
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastStored = parseStored(raw);
  }
  return lastStored;
}

function getUrlFlags(): SceneFlags {
  urlFlags ??= parseUrlFlags(new URLSearchParams(window.location.search));
  return urlFlags;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

const subscribeNever = () => () => {};
const NO_FLAGS: SceneFlags = {};

export function saveSceneSettings(settings: SceneSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Not saved; the page keeps showing the old value
  }
  listeners.forEach((listener) => listener());
}

export function useSceneSettings() {
  const stored = useSyncExternalStore(
    subscribe,
    getStored,
    () => DEFAULT_SCENE_SETTINGS,
  );
  const flags = useSyncExternalStore(
    subscribeNever,
    getUrlFlags,
    () => NO_FLAGS,
  );
  return { stored, flags, scene: resolveScene(stored, flags) };
}
