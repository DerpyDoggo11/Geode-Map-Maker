import * as THREE from 'three';
import type { LightingConfig } from './types';
import { DEFAULT_LIGHTING } from './types';

export type Mood = 'day' | 'dusk' | 'night';

const MOOD_PRESETS: Record<Mood, Partial<LightingConfig>> = {
  day: {
    sunAzimuth: 45,
    sunElevation: 55,
    sunColor: '#fff4e8',
    sunIntensity: 1.6,
    ambientSkyColor: '#b1d8ff',
    ambientGroundColor: '#7a6a4a',
    ambientIntensity: 0.55,
    backgroundColor: '#cfe2ff',
    fogEnabled: false,
    fogColor: '#cfe2ff',
    fogNear: 80,
    fogFar: 300,
  },
  dusk: {
    sunAzimuth: 45,
    sunElevation: 25,
    sunColor: '#c08498',
    sunIntensity: 0.7,
    ambientSkyColor: '#5a3b6e',
    ambientGroundColor: '#1c1726',
    ambientIntensity: 0.35,
    backgroundColor: '#28213a',
    fogEnabled: true,
    fogColor: '#3b2e4a',
    fogNear: 50,
    fogFar: 220,
  },
  night: {
    sunAzimuth: 45,
    sunElevation: 60,
    sunColor: '#5870ad',
    sunIntensity: 0.35,
    ambientSkyColor: '#3d4570',
    ambientGroundColor: '#1a1c2a',
    ambientIntensity: 0.4,
    backgroundColor: '#1a1c2a',
    fogEnabled: true,
    fogColor: '#1a1c2a',
    fogNear: 40,
    fogFar: 180,
  },
};

export function moodToLighting(mood: Mood): LightingConfig {
  return { ...DEFAULT_LIGHTING, ...MOOD_PRESETS[mood] };
}

export class Lighting {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  config: LightingConfig = { ...DEFAULT_LIGHTING };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.sun = new THREE.DirectionalLight(0xffffff, 1.0);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 0.5);
    scene.add(this.sun);
    scene.add(this.hemi);
    this.applyConfig(DEFAULT_LIGHTING);
  }

  applyConfig(cfg: LightingConfig): void {
    this.config = { ...cfg };
    const azRad = (cfg.sunAzimuth * Math.PI) / 180;
    const elRad = (cfg.sunElevation * Math.PI) / 180;
    const dist = 50;
    this.sun.position.set(
      Math.cos(elRad) * Math.cos(azRad) * dist,
      Math.sin(elRad) * dist,
      Math.cos(elRad) * Math.sin(azRad) * dist,
    );
    this.sun.color.set(cfg.sunColor);
    this.sun.intensity = cfg.sunIntensity;
    this.hemi.color.set(cfg.ambientSkyColor);
    this.hemi.groundColor.set(cfg.ambientGroundColor);
    this.hemi.intensity = cfg.ambientIntensity;
    this.scene.background = new THREE.Color(cfg.backgroundColor);
    if (cfg.fogEnabled) {
      this.scene.fog = new THREE.Fog(cfg.fogColor, cfg.fogNear, cfg.fogFar);
    } else {
      this.scene.fog = null;
    }
  }

  applyMood(mood: Mood): void {
    this.applyConfig(moodToLighting(mood));
  }
}
