import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

//
//
//
// Several parts in one geometry, each painted in one colour (a colour
// attribute for a material with vertexColors), so a small creature or
// thing is one draw call. A part painted null keeps the colours it has.
// Every part is made non-indexed and loses its uv, so they all merge; the
// parts themselves are freed
export function paintedParts(
  parts: [THREE.BufferGeometry, string | null][],
): THREE.BufferGeometry {
  const paint = new THREE.Color();
  const ready = parts.map(([geometry, color]) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    flat.deleteAttribute("uv");
    if (color !== null) {
      paint.set(color);
      const count = flat.attributes.position.count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        colors.set([paint.r, paint.g, paint.b], i * 3);
      }
      flat.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
    geometry.dispose();
    return flat;
  });
  const merged = mergeGeometries(ready);
  ready.forEach((geometry) => geometry.dispose());
  return merged;
}
