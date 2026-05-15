import * as THREE from 'three';
import { loadGLBFromArrayBuffer, ModelLibrary, attachLight } from './models';
import type { Terrain } from './terrain';
import type { Water } from './water';
import type { Lighting, Mood } from './lighting';
import type { IslandMap } from './islandMap';
import type { HubStyle } from './islandMap';
import { createIslandMesh } from './island';
import type {
  SaveData,
  IslandMapSaveData,
  SavedIsland,
  SavedGLBModel,
  PlacedModelData,
  AttachedLight,
  EditorState,
} from './types';

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
  mood: Mood;
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
    const pos = isl.mesh.geometry.attributes['position'] as THREE.BufferAttribute;
    const n = pos.count;
    const baseData = isl.data;
    const overrides: SavedIsland['vertexOverrides'] = [];
    const fresh = baseData.geometry.attributes['position'] as THREE.BufferAttribute | undefined;
    for (let i = 0; i < n; i++) {
      if (fresh) {
        const dx = pos.getX(i) - fresh.getX(i);
        const dy = pos.getY(i) - fresh.getY(i);
        const dz = pos.getZ(i) - fresh.getZ(i);
        if (Math.abs(dx) > 1e-5 || Math.abs(dy) > 1e-5 || Math.abs(dz) > 1e-5) {
          overrides!.push({ i, x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
        }
      }
    }
    const out: SavedIsland = {
      id: isl.id,
      role: isl.role,
      pos: [isl.mesh.position.x, isl.mesh.position.y, isl.mesh.position.z],
      scale: isl.mesh.scale.x,
      params: { ...isl.params },
    };
    if (overrides!.length > 0) out.vertexOverrides = overrides;
    const ag = isl.mesh.userData['angularGroup'];
    if (ag) out.angularGroup = ag;
    return out;
  });

  const out: IslandMapSaveData = {
    version: 5,
    mapType: 'island',
    config: { ...ctx.islandMap.config },
    islands,
    mood: ctx.mood,
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
  setMoodUI: (m: Mood) => void;
  setConfigUI: (cfg: IslandMap['config']) => void;
  rebuildSelection: () => void;
  applyEditorState: (s: EditorState) => void;
}

export async function applyIslandLoadedData(raw: unknown, ctx: IslandLoadContext): Promise<void> {
  const raw2 = raw as { version?: number };
  let data: IslandMapSaveData;
  if (raw2.version === 5) {
    data = raw as IslandMapSaveData;
  } else if (raw2.version === 4) {
    const v4 = raw as Partial<IslandMapSaveData> & {
      config: Partial<IslandMapSaveData['config']>;
      islands: Array<SavedIsland & { params: Partial<SavedIsland['params']> }>;
    };
    data = {
      ...(v4 as IslandMapSaveData),
      version: 5,
      config: Object.assign({
        globalScale: 1,
        hubLobeRadius: 4,
        mid2IslandCount: 0,
        mid2RingRadius: 30,
        mid2IslandRadius: 2.5,
        mid2IslandHeight: 2,
        interPlayerCount: 0,
        interPlayerRadius: 2,
        interPlayerRingRadius: 40,
        sideRings: 3,
        subdivision: 1,
        mirrorSymmetric: false,
      }, v4.config) as IslandMapSaveData['config'],
      islands: v4.islands.map(s => ({
        ...s,
        params: Object.assign({
          sideRings: 3,
          subdivision: 1,
        }, s.params) as SavedIsland['params'],
      })),
    };
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
  };

  for (const sav of data.islands) {
    const inst = createIslandMesh(sav.params, sav.id, sav.role);
    inst.mesh.position.set(sav.pos[0], sav.pos[1], sav.pos[2]);
    if (sav.scale !== undefined) inst.mesh.scale.setScalar(sav.scale);
    if (sav.vertexOverrides) {
      const pos = inst.mesh.geometry.attributes['position'] as THREE.BufferAttribute;
      for (const ov of sav.vertexOverrides) {
        pos.setXYZ(ov.i, ov.x, ov.y, ov.z);
      }
      pos.needsUpdate = true;
      inst.mesh.geometry.computeVertexNormals();
    }
    if (sav.angularGroup) inst.mesh.userData['angularGroup'] = sav.angularGroup;
    ctx.scene.add(inst.mesh);
    ctx.islandMap.islands.push(inst);
  }
  ctx.islandMap.onChange();

  ctx.lighting.applyMood(data.mood);
  ctx.setMoodUI(data.mood);
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
  if (d?.mapType === 'island' || d?.version === 4 || d?.version === 5) return 'island';
  return 'plane';
}
