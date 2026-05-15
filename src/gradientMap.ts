import * as THREE from 'three';

/**
 * Build a 1×N gradient texture for MeshToonMaterial. The material samples
 * this with the diffuse Lambert term to pick a brightness band, giving the
 * crisp cel-shaded look. Three stops are enough for a stylized RTS feel:
 * deep shadow, mid, lit.
 */
export function makeToonGradient(stops: number[]): THREE.DataTexture {
  const data = new Uint8Array(stops.length);
  for (let i = 0; i < stops.length; i++) {
    data[i] = Math.round(THREE.MathUtils.clamp(stops[i], 0, 1) * 255);
  }
  const tex = new THREE.DataTexture(data, stops.length, 1, THREE.RedFormat);
  tex.magFilter = THREE.NearestFilter; // hard band edges, no blending
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** Three brightness bands: deep shadow, mid, full lit. Good general default. */
export const DEFAULT_TOON_GRADIENT = makeToonGradient([0.25, 0.55, 1.0]);
