import * as THREE from 'three';
import type { Mood } from './lighting';

/** Per-instance attached light, persisted with the placed model. */
export interface AttachedLight {
  color: number;        // hex
  intensity: number;
  range: number;        // PointLight distance
  /** Local-space offset from the model origin. */
  offset: [number, number, number];
}

/** A built-in or uploaded model definition. */
export interface ModelDef {
  name: string;
  source: 'builtin' | 'glb';
  /** Default light template applied when "attach light" is checked at place time. */
  defaultLight?: AttachedLight;
  /** Present only for source === 'glb'; raw GLB bytes for save round-tripping. */
  glbData?: ArrayBuffer;
  /** Build a fresh instance — caller adds to scene. */
  build: () => THREE.Object3D;
}

/** A ground texture entry shown in the paint palette. */
export interface TextureDef {
  name: string;
  dataUrl: string;
  color: THREE.Color;
}

/** Persisted shape of a single placed model. */
export interface PlacedModelData {
  defIndex: number;
  pos: [number, number, number];
  rotY: number;
  scale: number;
  /** Present when the user attached a light. */
  light?: AttachedLight;
  /** Present when this model was placed as part of a mirror group. */
  mirrorGroup?: string;
}

/** Persisted shape of an embedded GLB. */
export interface SavedGLBModel {
  defIndex: number;
  name: string;
  b64: string;
}

/** Snapshot of the panel UI so the user picks up exactly where they left off. */
export interface EditorState {
  tool: 'select' | 'orbit' | 'place' | 'remove' | 'brush';
  moveAxis: 'x' | 'y' | 'z';
  moveStep: number;
  hExact: number;
  currentModelIndex: number;
  currentTextureIndex: number;
  modelYOffset: number;
  modelScale: number;
  modelRotation?: number;
  mirrorEnabled?: boolean;
  attachLight: boolean;
  lightColor: string;
  lightIntensity: number;
  lightRange: number;
  lightY: number;
  brushRadius: number;
  brushDensity: number;
  brushScaleMin: number;
  brushScaleMax: number;
  brushSpacing: number;
  viewMode: 'solid' | 'wireframe' | 'transparent';
}

/** Complete save file schema (v3 adds lights + mood; editorState optional, additive). */
export interface SaveData {
  version: 3;
  map: { width: number; length: number; density: number };
  heights: number[];
  vertColors: number[];
  waterY: number;
  voidY: number;
  waterOn: boolean;
  mood: Mood;
  glbModels: SavedGLBModel[];
  placed: PlacedModelData[];
  editorState?: EditorState;
}

export interface SavedIsland {
  id: string;
  role: 'player' | 'mid' | 'hub' | 'bridge';
  pos: [number, number, number];
  scale?: number;
  params: {
    seed: number;
    radius: number;
    noiseAmount: number;
    targetEdge: number;
    subdivision: number;
    topHeightVariation: number;
    depth: number;
    bottomTaper: number;
  };
  /** Baked vertex positions [x,y,z, x,y,z, ...] in local space. */
  positions: number[];
  /** Triangle index buffer. */
  indices: number[];
  /** Per-vertex colors [r,g,b, r,g,b, ...]. */
  colors: number[];
  angularGroup?: { size: number; index: number; baseRole: string; spokeIndex?: number };
}

export interface LightingConfig {
  sunAzimuth: number;
  sunElevation: number;
  sunColor: string;
  sunIntensity: number;
  ambientSkyColor: string;
  ambientGroundColor: string;
  ambientIntensity: number;
  fogEnabled: boolean;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  backgroundColor: string;
}

export const DEFAULT_LIGHTING: LightingConfig = {
  sunAzimuth: 45,
  sunElevation: 50,
  sunColor: '#fff4e8',
  sunIntensity: 1.4,
  ambientSkyColor: '#b1d8ff',
  ambientGroundColor: '#5a4a3a',
  ambientIntensity: 0.5,
  fogEnabled: false,
  fogColor: '#cfe2ff',
  fogNear: 60,
  fogFar: 200,
  backgroundColor: '#cfe2ff',
};

export interface IslandMapSaveData {
  version: 6;
  mapType: 'island';
  config: {
    seed: number;
    globalScale: number;
    playerCount: number;
    playerRingRadius: number;
    playerIslandRadius: number;
    playerIslandHeight: number;
    hubStyle: string;
    hubRadius: number;
    hubIslandCount: number;
    hubLobeRadius: number;
    midIslandCount: number;
    midRingRadius: number;
    midIslandRadius: number;
    midIslandHeight: number;
    mid2IslandCount: number;
    mid2RingRadius: number;
    mid2IslandRadius: number;
    mid2IslandHeight: number;
    bridgeIslandsPerSpoke: number;
    bridgeIslandRadius: number;
    interPlayerCount: number;
    interPlayerRadius: number;
    interPlayerRingRadius: number;
    shapeNoise: number;
    targetEdge: number;
    subdivision: number;
    mirrorSymmetric?: boolean;
  };
  islands: SavedIsland[];
  lighting: LightingConfig;
  glbModels: SavedGLBModel[];
  placed: PlacedModelData[];
  editorState?: EditorState;
}

export type AnySaveData = SaveData | IslandMapSaveData;

export type MapType = 'plane' | 'island';
export type ToolName = 'select' | 'orbit' | 'place' | 'remove' | 'brush';
