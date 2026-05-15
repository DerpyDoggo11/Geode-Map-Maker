import * as THREE from 'three';
import type { IslandMap } from './islandMap';
import type { IslandInstance } from './island';

export interface VertRef {
  islandId: string;
  vertIndex: number;
}

interface VertWorldPos {
  ref: VertRef;
  world: THREE.Vector3;
}

export class IslandSelection {
  private scene: THREE.Scene;
  private map: IslandMap;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private selected: Map<string, Set<number>> = new Map();
  private points: THREE.Points | null = null;
  private flat: VertWorldPos[] = [];

  constructor(scene: THREE.Scene, map: IslandMap, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.map = map;
    this.camera = camera;
    this.renderer = renderer;
  }

  rebuildHelpers(): void {
    this.disposeHelpers();
    const all: VertWorldPos[] = [];
    for (const isl of this.map.islands) {
      const pos = isl.mesh.geometry.attributes['position'] as THREE.BufferAttribute;
      const n = pos.count;
      for (let i = 0; i < n; i++) {
        const local = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
        const world = local.clone().applyMatrix4(isl.mesh.matrixWorld);
        all.push({ ref: { islandId: isl.id, vertIndex: i }, world });
      }
    }
    this.flat = all;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(all.length * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(all.length * 3), 3));
    const mat = new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true, depthTest: false });
    this.points = new THREE.Points(geo, mat);
    this.points.renderOrder = 998;
    this.scene.add(this.points);
    this.sync();
  }

  disposeHelpers(): void {
    if (!this.points) return;
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.points = null;
    this.flat = [];
  }

  sync(): void {
    if (!this.points) return;
    for (const isl of this.map.islands) isl.mesh.updateMatrixWorld(true);
    for (const fp of this.flat) {
      const isl = this.map.findById(fp.ref.islandId);
      if (!isl) continue;
      const pos = isl.mesh.geometry.attributes['position'] as THREE.BufferAttribute;
      const local = new THREE.Vector3(pos.getX(fp.ref.vertIndex), pos.getY(fp.ref.vertIndex), pos.getZ(fp.ref.vertIndex));
      fp.world.copy(local).applyMatrix4(isl.mesh.matrixWorld);
    }

    const posAttr = this.points.geometry.attributes['position'] as THREE.BufferAttribute;
    const colAttr = this.points.geometry.attributes['color'] as THREE.BufferAttribute;
    const pArr = posAttr.array as Float32Array;
    const cArr = colAttr.array as Float32Array;
    for (let i = 0; i < this.flat.length; i++) {
      const fp = this.flat[i];
      pArr[i * 3] = fp.world.x;
      pArr[i * 3 + 1] = fp.world.y + 0.02;
      pArr[i * 3 + 2] = fp.world.z;
      const sel = this.has(fp.ref);
      cArr[i * 3] = sel ? 0.95 : 0.5;
      cArr[i * 3 + 1] = sel ? 0.85 : 0.5;
      cArr[i * 3 + 2] = sel ? 0.30 : 0.5;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    (this.points.material as THREE.PointsMaterial).size = this.size() > 0 ? 7 : 5;
  }

  has(ref: VertRef): boolean {
    return this.selected.get(ref.islandId)?.has(ref.vertIndex) ?? false;
  }

  size(): number {
    let n = 0;
    this.selected.forEach(s => { n += s.size; });
    return n;
  }

  clear(): void { this.selected.clear(); }
  isEmpty(): boolean { return this.size() === 0; }

  refs(): VertRef[] {
    const out: VertRef[] = [];
    this.selected.forEach((set, id) => set.forEach(idx => out.push({ islandId: id, vertIndex: idx })));
    return out;
  }

  add(ref: VertRef): void {
    let s = this.selected.get(ref.islandId);
    if (!s) { s = new Set(); this.selected.set(ref.islandId, s); }
    s.add(ref.vertIndex);
  }

  toggleAll(): void {
    if (this.size() === this.flat.length) {
      this.selected.clear();
    } else {
      this.selected.clear();
      for (const fp of this.flat) this.add(fp.ref);
    }
  }

  pickInRect(x0: number, y0: number, x1: number, y1: number, additive: boolean): void {
    if (!additive) this.selected.clear();
    const tiny = (x1 - x0) < 3 && (y1 - y0) < 3;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3();

    if (tiny) {
      let best: VertRef | null = null;
      let bestDist = 64;
      for (const fp of this.flat) {
        v.copy(fp.world).project(this.camera);
        const sx = (v.x * 0.5 + 0.5) * r.width;
        const sy = (-v.y * 0.5 + 0.5) * r.height;
        const dx = sx - cx, dy = sy - cy;
        const d = dx * dx + dy * dy;
        if (d < bestDist) { bestDist = d; best = fp.ref; }
      }
      if (best) this.add(best);
    } else {
      for (const fp of this.flat) {
        v.copy(fp.world).project(this.camera);
        const sx = (v.x * 0.5 + 0.5) * r.width;
        const sy = (-v.y * 0.5 + 0.5) * r.height;
        if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) this.add(fp.ref);
      }
    }
  }

  computeTranslate(delta: THREE.Vector3): { refs: VertRef[]; before: THREE.Vector3[]; after: THREE.Vector3[] } | null {
    const refs = this.refs();
    if (refs.length === 0) return null;
    const before: THREE.Vector3[] = [];
    const after: THREE.Vector3[] = [];
    for (const ref of refs) {
      const isl = this.map.findById(ref.islandId);
      if (!isl) continue;
      const pos = isl.mesh.geometry.attributes['position'] as THREE.BufferAttribute;
      const i = ref.vertIndex;
      const cur = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      before.push(cur.clone());
      after.push(cur.clone().add(delta));
    }
    return { refs, before, after };
  }

  forEachIsland(fn: (isl: IslandInstance) => void): void {
    this.map.islands.forEach(fn);
  }
}
