import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { ModelDef, AttachedLight } from './types';
import { DEFAULT_TOON_GRADIENT } from './gradientMap';

const gltfLoader = new GLTFLoader();

interface BuiltinSpec {
  name: string;
  url: string;
  defaultLight?: AttachedLight;
}

/**
 * Default light colors pull from the palette's warm row (magentas, pinks)
 * so the lit pools around buildings read as the same "warm in cool dark"
 * contrast as the reference image.
 */
const BUILTIN_SPECS: BuiltinSpec[] = [
  { name: 'Monolith', url: '/models/monolith.glb' },
  { name: 'Crystal',  url: '/models/crystal.glb',
    defaultLight: { color: 0xd977a4, intensity: 5, range: 7, offset: [0, 1.1, 0] } },
  { name: 'Crystal2', url: '/models/crystal2.glb',
    defaultLight: { color: 0xb63f83, intensity: 5, range: 6, offset: [0, 1.0, 0] } },
  { name: 'Crystal3', url: '/models/crystal3.glb',
    defaultLight: { color: 0xe8a4c2, intensity: 6, range: 8, offset: [0, 2.5, 0] } },
];

/**
 * Replace each mesh's material on a GLB prototype with MeshToonMaterial,
 * preserving the artist's color/map/emissive so the model looks the same
 * but shades in hard bands instead of smooth PBR gradients.
 */
function convertToToon(root: THREE.Object3D): void {
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const oldMat = mesh.material as THREE.MeshStandardMaterial;
    const color = oldMat.color?.clone() ?? new THREE.Color(0xffffff);
    const map = oldMat.map ?? null;
    const emissive = oldMat.emissive?.clone() ?? new THREE.Color(0x000000);
    const transparent = oldMat.transparent ?? false;
    const opacity = oldMat.opacity ?? 1;
    mesh.material = new THREE.MeshToonMaterial({
      color,
      map,
      emissive,
      transparent,
      opacity,
      gradientMap: DEFAULT_TOON_GRADIENT,
    });
    oldMat.dispose();
  });
}

/**
 * Inverted-hull outline. For each mesh, add a slightly-scaled child mesh
 * sharing the same geometry, rendered with back faces in solid color.
 */
function addOutline(root: THREE.Object3D, thickness = 0.03, color = 0x000000): void {
  const outlineMat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  const meshes: THREE.Mesh[] = [];
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.userData['kind'] !== 'outline' && mesh.geometry) {
      meshes.push(mesh);
    }
  });
  for (const mesh of meshes) {
    const outline = new THREE.Mesh(mesh.geometry, outlineMat);
    outline.scale.setScalar(1 + thickness);
    outline.userData['kind'] = 'outline';
    mesh.add(outline);
  }
}

async function loadBuiltinFromURL(spec: BuiltinSpec): Promise<ModelDef> {
  const res = await fetch(spec.url);
  if (!res.ok) throw new Error(`Failed to fetch ${spec.url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  const def = await loadGLBFromArrayBuffer(buf, spec.name);
  def.name = spec.name;
  def.source = 'builtin';
  delete def.glbData;
  if (spec.defaultLight) def.defaultLight = spec.defaultLight;
  return def;
}

export async function loadBuiltinModels(): Promise<ModelDef[]> {
  const results = await Promise.allSettled(BUILTIN_SPECS.map(loadBuiltinFromURL));
  const out: ModelDef[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') out.push(r.value);
    else console.error('Built-in model failed:', r.reason);
  }
  return out;
}

export function loadGLBFromArrayBuffer(buf: ArrayBuffer, name: string): Promise<ModelDef> {
  return new Promise((resolve, reject) => {
    gltfLoader.parse(
      buf,
      '',
      (gltf: GLTF) => {
        const proto = gltf.scene;
        convertToToon(proto);
        addOutline(proto, 0.03);
        resolve({
          name,
          source: 'glb',
          glbData: buf,
          build: (): THREE.Object3D => {
            const c = proto.clone(true);
            c.traverse(o => {
              const mesh = o as THREE.Mesh;
              if (!mesh.isMesh) return;
              if (mesh.userData['kind'] === 'outline') return;
              const mat = mesh.material;
              mesh.material = Array.isArray(mat)
                ? mat.map(m => m.clone())
                : (mat as THREE.Material).clone();
            });
            return c;
          },
        });
      },
      err => reject(err),
    );
  });
}

export function attachLight(obj: THREE.Object3D, cfg: AttachedLight): THREE.PointLight {
  detachLight(obj);
  const light = new THREE.PointLight(cfg.color, cfg.intensity, cfg.range, 2);
  light.position.set(cfg.offset[0], cfg.offset[1], cfg.offset[2]);
  light.userData['kind'] = 'attached-light';
  obj.add(light);
  const gizmo = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 6),
    new THREE.MeshBasicMaterial({ color: cfg.color }),
  );
  gizmo.position.copy(light.position);
  gizmo.userData['kind'] = 'attached-light-gizmo';
  obj.add(gizmo);
  obj.userData['attachedLight'] = cfg;
  return light;
}

export function detachLight(obj: THREE.Object3D): void {
  const toRemove: THREE.Object3D[] = [];
  obj.traverse(child => {
    const k = child.userData['kind'];
    if (k === 'attached-light' || k === 'attached-light-gizmo') toRemove.push(child);
  });
  for (const c of toRemove) c.parent?.remove(c);
  delete obj.userData['attachedLight'];
}

export class ModelLibrary {
  scene: THREE.Scene;
  defs: ModelDef[] = [];
  placed: Set<THREE.Object3D> = new Set();
  currentDefIndex = 0;
  onChange: () => void = () => {};
  ready: Promise<void>;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.ready = this.loadBuiltins();
  }

  private async loadBuiltins(): Promise<void> {
    this.defs = await loadBuiltinModels();
    this.onChange();
  }

  setCurrent(idx: number): void {
    this.currentDefIndex = idx;
    this.onChange();
  }

  async addGLBFiles(files: FileList | File[]): Promise<number> {
    const list = Array.from(files);
    const results = await Promise.allSettled(
      list.map(async (f): Promise<ModelDef> => {
        const buf = await f.arrayBuffer();
        const name = f.name.replace(/\.(glb|gltf)$/i, '');
        return loadGLBFromArrayBuffer(buf, name);
      }),
    );
    let loaded = 0;
    for (const r of results) {
      if (r.status === 'fulfilled') {
        this.defs.push(r.value);
        loaded++;
      } else {
        console.error(r.reason);
      }
    }
    this.onChange();
    return loaded;
  }

  build(
    defIndex: number,
    worldPoint: THREE.Vector3,
    yOffset: number,
    scale: number,
    withLight: boolean,
  ): THREE.Object3D | null {
    const def = this.defs[defIndex];
    if (!def) return null;
    const m = def.build();
    m.position.set(worldPoint.x, worldPoint.y + yOffset, worldPoint.z);
    m.scale.setScalar(scale);
    m.userData['kind'] = 'model';
    m.userData['defIndex'] = defIndex;
    if (withLight && def.defaultLight) attachLight(m, def.defaultLight);
    return m;
  }

  findPlacedRoot(hitObject: THREE.Object3D): THREE.Object3D | null {
    let top: THREE.Object3D | null = hitObject;
    while (top && top.parent && !this.placed.has(top)) top = top.parent;
    return top && this.placed.has(top) ? top : null;
  }

  clearPlaced(): void {
    this.placed.forEach(m => this.scene.remove(m));
    this.placed.clear();
  }

  stripGLBs(): void {
    for (let i = this.defs.length - 1; i >= 0; i--) {
      if (this.defs[i].source === 'glb') this.defs.splice(i, 1);
    }
    this.onChange();
  }
}