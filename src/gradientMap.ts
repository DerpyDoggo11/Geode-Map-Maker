import * as THREE from 'three';

export function makeToonGradient(stops: number[]): THREE.DataTexture {
  const data = new Uint8Array(stops.length);
  for (let i = 0; i < stops.length; i++) {
    data[i] = Math.round(THREE.MathUtils.clamp(stops[i], 0, 1) * 255);
  }
  const tex = new THREE.DataTexture(data, stops.length, 1, THREE.RedFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export const DEFAULT_TOON_GRADIENT = makeToonGradient([0.25, 0.55, 1.0]);
