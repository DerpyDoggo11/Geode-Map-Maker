import * as THREE from 'three';

/** A built-in or uploaded model definition. */
export interface ModelDef {
  name: string;
  source: 'builtin' | 'glb';
  /** Present only for source === 'glb'; raw GLB bytes for save round-tripping. */
  glbData?: ArrayBuffer;
  /** Build a fresh instance — caller is responsible for adding to scene. */
  build: () => THREE.Object3D;
}

/** A ground texture entry shown in the paint palette. */
export interface TextureDef {
  name: string;
  /** PNG data URL for the panel preview. */
  dataUrl: string;
  /** Color applied per-vertex when painting. */
  color: THREE.Color;
}

/** Persisted shape of a single placed model. */
export interface PlacedModelData {
  defIndex: number;
  pos: [number, number, number];
  rotY: number;
  scale: number;
}

/** Persisted shape of an embedded GLB. */
export interface SavedGLBModel {
  defIndex: number;
  name: string;
  /** Base64 of the original .glb bytes. */
  b64: string;
}

/** Complete save file schema (version 2). */
export interface SaveData {
  version: 2;
  map: { width: number; length: number; density: number };
  heights: number[];
  vertColors: number[];
  waterY: number;
  voidY: number;
  waterOn: boolean;
  glbModels: SavedGLBModel[];
  placed: PlacedModelData[];
}

export type ToolName = 'select' | 'orbit' | 'place' | 'remove';
