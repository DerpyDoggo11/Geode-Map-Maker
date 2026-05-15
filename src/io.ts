import * as THREE from 'three';
import { loadGLBFromArrayBuffer, ModelLibrary, attachLight } from './models';
import type { Terrain } from './terrain';
import type { Water } from './water';
import type { Lighting, Mood } from './lighting';
import { moodToLighting } from './lighting';
import type { IslandMap } from './islandMap';
import type { HubStyle } from './islandMap';
import { createIslandMesh, generateIslandGeometry } from './island';
import type {
  SaveData,
  IslandMapSaveData,
  SavedIsland,
  SavedGLBModel,
  PlacedModelData,
  AttachedLight,
  EditorState,
  LightingConfig,
} from './types';
import { DEFAULT_LIGHTING } from './types';

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export interface SaveContext {
  mapW: number;
  mapL: number;
  density: number;
  terrain: Terrain;
  models: ModelLibrary;
  waterY: number;
  voidY: number;
  waterOn: boolean;
  mood: Mood;
  editorState?: EditorState;
}

export function buildSaveData(ctx: SaveContext): SaveData {
  const glbModels: SavedGLBModel[] = ctx.models.defs
    .map((m, i): SavedGLBModel | null =>
      m.source === 'glb' && m.glbData
        ? { defIndex: i, name: m.name, b64: arrayBufferToBase64(m.glbData) }
        : null,
    )
    .filter((x): x is SavedGLBModel => x !== null);

  const placed: PlacedModelData[] = Array.from(ctx.models.placed).map(m => {
    const light = m.userData['attachedLight'] as AttachedLight | undefined;
    const out: PlacedModelData = {
      defIndex: m.userData['defIndex'] as number,
      pos: [m.position.x, m.position.y, m.position.z],
      rotY: m.rotation.y,
      scale: m.scale.x,
    };
    if (light) out.light = light;
    const mg = m.userData['mirrorGroup'] as string | undefined;
    if (mg) out.mirrorGroup = mg;
    return out;
  });

  const out: SaveData = {
    version: 3,
    map: { width: ctx.mapW, length: ctx.mapL, density: ctx.density },
    heights: ctx.terrain.heights,
    vertColors: ctx.terrain.vertColors,
    waterY: ctx.waterY,
    voidY: ctx.voidY,
    waterOn: ctx.waterOn,
    mood: ctx.mood,
    glbModels,
    placed,
  };
  if (ctx.editorState) out.editorState = ctx.editorState;
  return out;
}

export function downloadJSON(data: SaveData | IslandMapSaveData, filename = 'map.json'): void {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface LoadContext {
  scene: THREE.Scene;
  rebuildMap: () => void;
  terrain: Terrain;
  water: Water;
  models: ModelLibrary;
  lighting: Lighting;
  setWaterY: (v: number) => void;
  setVoidY: (v: number) => void;
  setWaterOn: (v: boolean) => void;
  setMapInputs: (w: number, l: number, d: number) => void;
  setMoodUI: (m: Mood) => void;
  applyEditorState: (s: EditorState) => void;
}

/** Parse and migrate older formats so v2 maps still load. */
function normalize(raw: unknown): SaveData {
  const data = raw as Partial<SaveData> & { version?: number };
  if (!data || typeof data !== 'object') throw new Error('Invalid save file');
  if (data.version === 3) return data as SaveData;
  if (data.version === 2) return { ...(data as SaveData), version: 3, mood: 'night' };
  throw new Error(`Unsupported save version: ${data.version}`);
}

export async function applyLoadedData(raw: unknown, ctx: LoadContext): Promise<void> {
  const data = normalize(raw);

  ctx.models.stripGLBs();
  ctx.models.clearPlaced();

  ctx.setMapInputs(data.map.width, data.map.length, data.map.density);
  ctx.rebuildMap();

  ctx.terrain.heights = data.heights.slice();
  ctx.terrain.vertColors = data.vertColors.slice();
  for (let i = 0; i < ctx.terrain.heights.length; i++) {
    ctx.terrain.positions.setY(i, ctx.terrain.heights[i]);
  }
  for (let i = 0; i < ctx.terrain.vertColors.length; i++) {
    ctx.terrain.setVertexColor(i, ctx.terrain.vertColors[i]);
  }
  ctx.terrain.positions.needsUpdate = true;
  ctx.terrain.colorsAttr.needsUpdate = true;
  ctx.terrain.geo!.computeVertexNormals();

  ctx.setWaterY(data.waterY);
  ctx.setVoidY(data.voidY);
  ctx.setWaterOn(data.waterOn);
  ctx.water.setY(data.waterY);
  ctx.water.setVisible(data.waterOn);
  ctx.terrain.setVoidY(data.voidY);

  ctx.lighting.applyMood(data.mood);
  ctx.setMoodUI(data.mood);

  if (data.glbModels?.length) {
    for (const g of data.glbModels) {
      try {
        const def = await loadGLBFromArrayBuffer(base64ToArrayBuffer(g.b64), g.name);
        ctx.models.defs.push(def);
      } catch (err) {
        console.error('GLB restore failed', err);
      }
    }
  }
  ctx.models.onChange();

  for (const p of data.placed) {
    const def = ctx.models.defs[p.defIndex];
    if (!def) continue;
    const m = def.build();
    m.position.set(p.pos[0], p.pos[1], p.pos[2]);
    m.rotation.y = p.rotY || 0;
    m.scale.setScalar(p.scale || 1);
    m.userData['kind'] = 'model';
    m.userData['defIndex'] = p.defIndex;
    if (p.mirrorGroup) m.userData['mirrorGroup'] = p.mirrorGroup;
    if (p.light) attachLight(m, p.light);
    ctx.scene.add(m);
    ctx.models.placed.add(m);
  }

  if (data.editorState) ctx.applyEditorState(data.editorState);
}

export interface IslandSaveContext {
  islandMap: IslandMap;
  models: ModelLibrary;
  lighting: LightingConfig;
  editorState?: EditorState;
}

export function buildIslandSaveData(ctx: IslandSaveContext): IslandMapSaveData {
  const glbModels: SavedGLBModel[] = ctx.models.defs
    .map((m, i): SavedGLBModel | null =>
      m.source === 'glb' && m.glbData
        ? { defIndex: i, name: m.name, b64: arrayBufferToBase64(m.glbData) }
        : null,
    )
    .filter((x): x is SavedGLBModel => x !== null);

  const placed: PlacedModelData[] = Array.from(ctx.models.placed).map(m => {
    const light = m.userData['attachedLight'] as AttachedLight | undefined;
    const out: PlacedModelData = {
      defIndex: m.userData['defIndex'] as number,
      pos: [m.position.x, m.position.y, m.position.z],
      rotY: m.rotation.y,
      scale: m.scale.x,
    };
    if (light) out.light = light;
    const mg = m.userData['mirrorGroup'] as string | undefined;
    if (mg) out.mirrorGroup = mg;
    return out;
  });

  const islands: SavedIsland[] = ctx.islandMap.islands.map(isl => {
    const posAttr = isl.mesh.geometry.attributes['position'] as THREE.BufferAttribute;
    const colAttr = isl.mesh.geometry.attributes['color'] as THREE.BufferAttribute | undefined;
    const idxAttr = isl.mesh.geometry.index;
    const positions = Array.from(posAttr.array as Float32Array);
    const colors = colAttr ? Array.from(colAttr.array as Float32Array) : [];
    const indices = idxAttr ? Array.from(idxAttr.array as Uint16Array | Uint32Array) : [];
    const out: SavedIsland = {
      id: isl.id,
      role: isl.role,
      pos: [isl.mesh.position.x, isl.mesh.position.y, isl.mesh.position.z],
      scale: isl.mesh.scale.x,
      params: { ...isl.params },
      positions,
      indices,
      colors,
    };
    const ag = isl.mesh.userData['angularGroup'];
    if (ag) out.angularGroup = ag;
    return out;
  });

  const out: IslandMapSaveData = {
    version: 6,
    mapType: 'island',
    config: { ...ctx.islandMap.config },
    islands,
    lighting: { ...ctx.lighting },
    glbModels,
    placed,
  };
  if (ctx.editorState) out.editorState = ctx.editorState;
  return out;
}

export interface IslandLoadContext {
  scene: THREE.Scene;
  islandMap: IslandMap;
  models: ModelLibrary;
  lighting: Lighting;
  setLightingUI: (cfg: LightingConfig) => void;
  setConfigUI: (cfg: IslandMap['config']) => void;
  rebuildSelection: () => void;
  applyEditorState: (s: EditorState) => void;
}

interface LegacyV4V5Island {
  id: string;
  role: 'player' | 'mid' | 'hub' | 'bridge';
  pos: [number, number, number];
  scale?: number;
  params: Record<string, number>;
  vertexOverrides?: Array<{ i: number; x: number; y: number; z: number }>;
  angularGroup?: { size: number; index: number; baseRole: string; spokeIndex?: number };
}

interface LegacyV4V5Save {
  version: 4 | 5;
  mapType: 'island';
  config: Record<string, unknown>;
  islands: LegacyV4V5Island[];
  mood?: Mood;
  glbModels?: SavedGLBModel[];
  placed?: PlacedModelData[];
  editorState?: EditorState;
}

function migrateLegacyIslandSave(raw: LegacyV4V5Save): IslandMapSaveData {
  const cfg = raw.config;
  const targetEdge = typeof cfg['targetEdge'] === 'number'
    ? (cfg['targetEdge'] as number)
    : 1.0;
  const subdivision = typeof cfg['subdivision'] === 'number'
    ? (cfg['subdivision'] as number)
    : 1;
  const newConfig = {
    seed: (cfg['seed'] as number) ?? 1,
    globalScale: (cfg['globalScale'] as number) ?? 1,
    playerCount: (cfg['playerCount'] as number) ?? 8,
    playerRingRadius: (cfg['playerRingRadius'] as number) ?? 40,
    playerIslandRadius: (cfg['playerIslandRadius'] as number) ?? 6,
    playerIslandHeight: (cfg['playerIslandHeight'] as number) ?? 3.5,
    hubStyle: (cfg['hubStyle'] as string) ?? 'connected',
    hubRadius: (cfg['hubRadius'] as number) ?? 10,
    hubIslandCount: (cfg['hubIslandCount'] as number) ?? 4,
    hubLobeRadius: (cfg['hubLobeRadius'] as number) ?? 4,
    midIslandCount: (cfg['midIslandCount'] as number) ?? 0,
    midRingRadius: (cfg['midRingRadius'] as number) ?? 22,
    midIslandRadius: (cfg['midIslandRadius'] as number) ?? 3.5,
    midIslandHeight: (cfg['midIslandHeight'] as number) ?? 2.5,
    mid2IslandCount: (cfg['mid2IslandCount'] as number) ?? 0,
    mid2RingRadius: (cfg['mid2RingRadius'] as number) ?? 30,
    mid2IslandRadius: (cfg['mid2IslandRadius'] as number) ?? 2.5,
    mid2IslandHeight: (cfg['mid2IslandHeight'] as number) ?? 2,
    bridgeIslandsPerSpoke: (cfg['bridgeIslandsPerSpoke'] as number) ?? 0,
    bridgeIslandRadius: (cfg['bridgeIslandRadius'] as number) ?? 1.5,
    interPlayerCount: (cfg['interPlayerCount'] as number) ?? 0,
    interPlayerRadius: (cfg['interPlayerRadius'] as number) ?? 2,
    interPlayerRingRadius: (cfg['interPlayerRingRadius'] as number) ?? 40,
    shapeNoise: (cfg['shapeNoise'] as number) ?? 0.25,
    targetEdge,
    subdivision,
    mirrorSymmetric: (cfg['mirrorSymmetric'] as boolean) ?? false,
  };

  const islands: SavedIsland[] = raw.islands.map(s => {
    const params = {
      seed: s.params['seed'] ?? 1,
      radius: s.params['radius'] ?? 5,
      noiseAmount: s.params['noiseAmount'] ?? 0.25,
      targetEdge: s.params['targetEdge'] ?? targetEdge,
      subdivision: s.params['subdivision'] ?? subdivision,
      topHeightVariation: s.params['topHeightVariation'] ?? 0.1,
      depth: s.params['depth'] ?? 4,
      bottomTaper: s.params['bottomTaper'] ?? 0.15,
    };
    const data = generateIslandGeometryRaw(params);
    if (s.vertexOverrides) {
      for (const ov of s.vertexOverrides) {
        data.positions[ov.i * 3] = ov.x;
        data.positions[ov.i * 3 + 1] = ov.y;
        data.positions[ov.i * 3 + 2] = ov.z;
      }
    }
    return {
      id: s.id,
      role: s.role,
      pos: s.pos,
      scale: s.scale,
      params,
      positions: data.positions,
      indices: data.indices,
      colors: data.colors,
      ...(s.angularGroup ? { angularGroup: s.angularGroup } : {}),
    };
  });

  const lighting = raw.mood ? moodToLighting(raw.mood) : DEFAULT_LIGHTING;

  return {
    version: 6,
    mapType: 'island',
    config: newConfig,
    islands,
    lighting,
    glbModels: raw.glbModels ?? [],
    placed: raw.placed ?? [],
    ...(raw.editorState ? { editorState: raw.editorState } : {}),
  };
}

function generateIslandGeometryRaw(params: SavedIsland['params']): {
  positions: number[];
  indices: number[];
  colors: number[];
} {
  const data = generateIslandGeometry({
    seed: params.seed,
    radius: params.radius,
    noiseAmount: params.noiseAmount,
    targetEdge: params.targetEdge,
    subdivision: params.subdivision,
    topHeightVariation: params.topHeightVariation,
    depth: params.depth,
    bottomTaper: params.bottomTaper,
  });
  const posAttr = data.geometry.attributes['position'] as THREE.BufferAttribute;
  const colAttr = data.geometry.attributes['color'] as THREE.BufferAttribute | undefined;
  const idxAttr = data.geometry.index;
  return {
    positions: Array.from(posAttr.array as Float32Array),
    indices: idxAttr ? Array.from(idxAttr.array as Uint16Array | Uint32Array) : [],
    colors: colAttr ? Array.from(colAttr.array as Float32Array) : [],
  };
}

export async function applyIslandLoadedData(raw: unknown, ctx: IslandLoadContext): Promise<void> {
  const raw2 = raw as { version?: number };
  let data: IslandMapSaveData;
  if (raw2.version === 6) {
    data = raw as IslandMapSaveData;
  } else if (raw2.version === 4 || raw2.version === 5) {
    data = migrateLegacyIslandSave(raw as LegacyV4V5Save);
  } else {
    throw new Error(`Unsupported island save version: ${raw2.version}`);
  }

  ctx.models.stripGLBs();
  ctx.models.clearPlaced();
  ctx.islandMap.clear();

  ctx.islandMap.config = {
    ...ctx.islandMap.config,
    ...data.config,
    hubStyle: data.config.hubStyle as HubStyle,
    shading: ctx.islandMap.config.shading,
  } as IslandMap['config'];

  for (const sav of data.islands) {
    const inst = createIslandMesh(sav.params, sav.id, sav.role, ctx.islandMap.config.shading);
    const geo = inst.mesh.geometry;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sav.positions), 3));
    if (sav.colors && sav.colors.length > 0) {
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(sav.colors), 3));
    }
    if (sav.indices && sav.indices.length > 0) {
      geo.setIndex(sav.indices);
    }
    geo.computeVertexNormals();
    inst.mesh.position.set(sav.pos[0], sav.pos[1], sav.pos[2]);
    if (sav.scale !== undefined) inst.mesh.scale.setScalar(sav.scale);
    if (sav.angularGroup) inst.mesh.userData['angularGroup'] = sav.angularGroup;
    ctx.scene.add(inst.mesh);
    ctx.islandMap.islands.push(inst);
  }
  ctx.islandMap.onChange();

  ctx.lighting.applyConfig(data.lighting);
  ctx.setLightingUI(data.lighting);
  ctx.setConfigUI(ctx.islandMap.config);

  if (data.glbModels?.length) {
    for (const g of data.glbModels) {
      try {
        const def = await loadGLBFromArrayBuffer(base64ToArrayBuffer(g.b64), g.name);
        ctx.models.defs.push(def);
      } catch (err) {
        console.error('GLB restore failed', err);
      }
    }
  }
  ctx.models.onChange();

  for (const p of data.placed) {
    const def = ctx.models.defs[p.defIndex];
    if (!def) continue;
    const m = def.build();
    m.position.set(p.pos[0], p.pos[1], p.pos[2]);
    m.rotation.y = p.rotY || 0;
    m.scale.setScalar(p.scale || 1);
    m.userData['kind'] = 'model';
    m.userData['defIndex'] = p.defIndex;
    if (p.mirrorGroup) m.userData['mirrorGroup'] = p.mirrorGroup;
    if (p.light) attachLight(m, p.light);
    ctx.scene.add(m);
    ctx.models.placed.add(m);
  }

  ctx.rebuildSelection();

  if (data.editorState) ctx.applyEditorState(data.editorState);
}

export function detectMapType(raw: unknown): 'plane' | 'island' {
  const d = raw as { version?: number; mapType?: string };
  if (d?.mapType === 'island' || d?.version === 4 || d?.version === 5 || d?.version === 6) return 'island';
  return 'plane';
}
