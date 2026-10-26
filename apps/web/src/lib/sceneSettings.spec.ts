import {
  DEFAULT_SCENE_SETTINGS,
  parseStored,
  parseUrlFlags,
  resolveScene,
  type SceneSettings,
} from "./sceneSettings";

function settings(overrides: Partial<SceneSettings> = {}): SceneSettings {
  return { ...DEFAULT_SCENE_SETTINGS, ...overrides };
}

describe("parseStored", () => {
  it("gives the defaults when nothing is stored", () => {
    expect(parseStored(null)).toEqual(DEFAULT_SCENE_SETTINGS);
  });

  it("reads back what was saved", () => {
    const saved = settings({ lowPower: true, glow: false });

    expect(parseStored(JSON.stringify(saved))).toEqual(saved);
  });

  it.each([
    ["broken JSON", "{shadows"],
    ["not an object", "true"],
    ["null", "null"],
  ])("gives the defaults for %s", (_, raw) => {
    expect(parseStored(raw)).toEqual(DEFAULT_SCENE_SETTINGS);
  });

  it("keeps the stored options and defaults the missing or wrong ones", () => {
    const raw = JSON.stringify({ shadows: false, glow: "no" });

    expect(parseStored(raw)).toEqual(settings({ shadows: false }));
  });
});

describe("parseUrlFlags", () => {
  const flags = (query: string) => parseUrlFlags(new URLSearchParams(query));

  it("is empty without flags", () => {
    expect(flags("?scene=off&testing=1")).toEqual({});
  });

  it("reads each option's flag", () => {
    expect(flags("?shadows=off&fx=off&orbit=0")).toEqual({
      shadows: false,
      glow: false,
      cameraMotion: false,
    });
  });

  it.each(["on", "1", ""])("turns an option on with %j", (value) => {
    expect(flags(`?fx=${value}`)).toEqual({ glow: true });
  });
});

describe("resolveScene", () => {
  it("draws the stored options, fog on", () => {
    expect(resolveScene(settings({ shadows: false }), {})).toEqual({
      shadows: false,
      glow: true,
      cameraMotion: true,
      fog: true,
    });
  });

  it("turns everything off in low power, whatever is stored", () => {
    expect(resolveScene(settings({ lowPower: true }), {})).toEqual({
      shadows: false,
      glow: false,
      cameraMotion: false,
      fog: false,
    });
  });

  it("lets a URL flag override the stored value", () => {
    const scene = resolveScene(settings({ glow: false }), {
      glow: true,
      shadows: false,
    });

    expect(scene).toMatchObject({ glow: true, shadows: false });
  });

  it("lets a URL flag override low power too, but not the fog", () => {
    const scene = resolveScene(settings({ lowPower: true }), { shadows: true });

    expect(scene).toMatchObject({ shadows: true, glow: false, fog: false });
  });
});
