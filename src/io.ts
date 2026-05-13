import * as THREE from 'three';
import { loadGLBFromArrayBuffer, ModelLibrary, attachLight } from './models';
import type { Terrain } from './terrain';
import type { Water } from './water';
import type { Lighting, Mood } from './lighting';
import type {
  SaveData,
  SavedGLBModel,
  PlacedModelData,
  AttachedLight,
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
    return out;
  });

  return {
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
}

export function downloadJSON(data: SaveData, filename = 'map.json'): void {
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
    if (p.light) attachLight(m, p.light);
    ctx.scene.add(m);
    ctx.models.placed.add(m);
  }
}
