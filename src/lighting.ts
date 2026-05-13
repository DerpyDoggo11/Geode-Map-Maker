import * as THREE from 'three';

export type Mood = 'dusk' | 'night';

export interface MoodPreset {
  background: number;
  sunColor: number;
  sunIntensity: number;
  ambientColor: number;
  ambientIntensity: number;
}

/**
 * Two cave-themed moods. The cool palette plus dim ambient does the visual
 * heavy lifting — point lights from buildings pool warm color into the
 * banded toon shading and read as the "lit" zones of the cave.
 */
export const MOODS: Record<Mood, MoodPreset> = {
  // Dusk = upper layers, still some indirect light filtering down. Slightly
  // warmer than night; purples push through into the highlights.
  dusk: {
    background: 0x28213a,     // top-row dark purple
    sunColor: 0x8b3088,       // muted magenta key light
    sunIntensity: 0.55,
    ambientColor: 0x4a4d7a,   // mid slate ambient
    ambientIntensity: 0.35,
  },
  // Night = deep cave. Sun barely contributes; everything depends on
  // point lights from buildings.
  night: {
    background: 0x1a1c2a,     // near-black slate
    sunColor: 0x5870ad,       // cold pale-blue rim light
    sunIntensity: 0.35,
    ambientColor: 0x28293d,   // very low cool ambient
    ambientIntensity: 0.4,
  },
};

/** Holds the directional sun and ambient. Exposed so mood swaps live-update. */
export class Lighting {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
  mood: Mood = 'night';

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.sun = new THREE.DirectionalLight(0xffffff, 1.0);
    this.sun.position.set(20, 30, 15);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(this.sun);
    scene.add(this.ambient);
    this.applyMood('night');
  }

  applyMood(mood: Mood): void {
    this.mood = mood;
    const p = MOODS[mood];
    this.scene.background = new THREE.Color(p.background);
    this.sun.color.setHex(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.ambient.color.setHex(p.ambientColor);
    this.ambient.intensity = p.ambientIntensity;
  }
}