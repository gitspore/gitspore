import {
  Bloom,
  EffectComposer,
  ToneMapping,
} from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";

//
//
//
// Post-processing: bloom on everything brighter than the threshold (in
// practice only emissive, untonemapped parts), then tone mapping, which
// the composer switches off on the renderer while it's mounted.
// - mipmapBlur: the cheap blur; radius only works with it (prototype: 0.4)
// - multisampling 4: the composer replaces the canvas's antialiasing;
//   4 instead of the default 8 for integrated graphics
export function Effects({
  strength,
  threshold,
}: {
  strength: number;
  threshold: number;
}) {
  return (
    <EffectComposer multisampling={4}>
      <Bloom
        intensity={strength}
        luminanceThreshold={threshold}
        mipmapBlur
        radius={0.4}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
