import { useMemo } from "react";

import type { Mode, tokens } from "@/theme/tokens";

import { Bumblebee } from "./Bumblebee";
import { Butterflies } from "./Butterflies";
import { Dragonfly } from "./Dragonfly";
import { Eyes } from "./Eyes";
import { Ladybug } from "./Ladybug";
import { DUST, FIREFLIES, Motes } from "./Motes";
import { Robin } from "./Robin";
import { Snail } from "./Snail";
import { bulbSpots, StringLights } from "./StringLights";
import { SunBeams } from "./SunBeams";
import { Teacup } from "./Teacup";

//
//
//
// Everything that lives around the table, on top of the garden, all from
// the mode's tokens (what shows by day and at night is in scene.json):
// - the string lights, glowing at night
// - beams of sun by day, of moon at night, with dust drifting in them
// - fireflies at night
// - by day butterflies, a bumblebee, a dragonfly and a robin in the
//   grass; at night moths around the bulbs, and eyes in the woods
// - day and night: a ladybug on the table, a steaming cup of tea, a snail
//   on a table leg
// Mounted only with garden life on (the settings; off in low power)

type ModeTokens = (typeof tokens)[Mode];

export function GardenLife({
  t,
  reducedMotion,
}: {
  t: ModeTokens;
  reducedMotion: boolean;
}) {
  const scene = t.color.scene;
  // Arrays and objects new only with the mode, so the critters keep their
  // flight when the scene re-renders
  const lamp = useMemo(
    () => ({
      post: t.color.wood.leg,
      wire: t.color.light["lamp-wire"],
      bulb: t.color.light["lamp-bulb"],
      glow: t.color.light["lamp-glow"],
      light: t.color.light.lamp,
    }),
    [t],
  );
  const bulbs = useMemo(() => bulbSpots(), []);
  const butterflies = useMemo(() => Object.values(scene.butterfly), [scene]);
  const moths = useMemo(
    () => [scene.moth, scene.moth, scene.moth, scene.moth],
    [scene],
  );

  return (
    <>
      <StringLights
        colors={lamp}
        lit={t.scene.lamps}
        glow={t.scene.glow}
        lampIntensity={t.scene.light.lamp}
      />
      <SunBeams color={t.color.light.key} opacity={t.scene.beams} />
      {t.scene.dust > 0 && (
        <Motes kind={DUST} color={scene.mote} glow={1} opacity={0.55} />
      )}
      {t.scene.fireflies > 0 && (
        <Motes
          kind={FIREFLIES}
          color={scene.firefly}
          glow={t.scene.glow * 1.6}
          opacity={1}
        />
      )}
      {t.scene.butterflies > 0 && (
        <>
          <Butterflies
            kind="butterfly"
            colors={butterflies}
            edge={scene.insect}
            bulbs={bulbs}
            reducedMotion={reducedMotion}
          />
          <Bumblebee
            yellow={scene.bee}
            dark={scene.insect}
            wingOpacity={t.opacity.scene.wing}
            reducedMotion={reducedMotion}
          />
          <Dragonfly
            color={scene.dragonfly}
            dark={scene.insect}
            wingOpacity={t.opacity.scene.wing}
            reducedMotion={reducedMotion}
          />
          <Robin
            brown={scene.robin.body}
            breast={scene.robin.breast}
            dark={scene.insect}
            reducedMotion={reducedMotion}
          />
        </>
      )}
      {t.scene.moths > 0 && (
        <Butterflies
          kind="moth"
          colors={moths}
          edge={scene.insect}
          bulbs={bulbs}
          reducedMotion={reducedMotion}
        />
      )}
      {t.scene.eyes > 0 && !reducedMotion && <Eyes color={scene.eye} />}
      <Ladybug
        red={scene.ladybug}
        dark={scene.insect}
        wingOpacity={t.opacity.scene.wing}
        reducedMotion={reducedMotion}
      />
      <Teacup
        cup={scene.teacup}
        tea={scene.tea}
        steam={scene.steam}
        steamOpacity={t.scene.steam}
      />
      <Snail
        shell={scene.snail.shell}
        body={scene.snail.body}
        dark={scene.insect}
        reducedMotion={reducedMotion}
      />
    </>
  );
}
