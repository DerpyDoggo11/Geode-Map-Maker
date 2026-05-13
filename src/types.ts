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
}

/** Persisted shape of an embedded GLB. */
export interface SavedGLBModel {
  defIndex: number;
  name: string;
  b64: string;
}

/** Complete save file schema (v3 adds lights + mood). */
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
}

export type ToolName = 'select' | 'orbit' | 'place' | 'remove';
