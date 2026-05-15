import * as THREE from 'three';
import type { Terrain } from './terrain';

/**
 * Selection set + helper Points + box-pick projection. Mutating operations
 * (height edit, paint) are NOT done here anymore — callers construct
 * Command objects and route them through the history manager so they're
 * undoable. This class instead exposes pure helpers that compute the new
 * values for the current selection.
 */
export class Selection {
  private scene: THREE.Scene;
  private terrain: Terrain;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private selected: Set<number> = new Set();
  private points: THREE.Points | null = null;

  constructor(
    scene: THREE.Scene,
    terrain: Terrain,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
  ) {
    this.scene = scene;
    this.terrain = terrain;
    this.camera = camera;
    this.renderer = renderer;
  }

  rebuildHelpers(): void {
    this.disposeHelpers();
    const n = this.terrain.vertexCount;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mat = new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true });
    this.points = new THREE.Points(geo, mat);
    this.scene.add(this.points);
    this.sync();
  }

  disposeHelpers(): void {
    if (!this.points) return;
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.points = null;
  }

  setHelperVisibility(visible: boolean): void {
    if (this.points) this.points.visible = visible;
  }

  sync(): void {
    if (!this.points) return;
    const positions = this.terrain.positions;
    const posAttr = this.points.geometry.attributes['position'] as THREE.BufferAttribute;
    const colAttr = this.points.geometry.attributes['color'] as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const col = colAttr.array as Float32Array;
    const n = this.terrain.vertexCount;
    for (let i = 0; i < n; i++) {
      arr[i * 3]     = positions.getX(i);
      arr[i * 3 + 1] = positions.getY(i) + 0.02;
      arr[i * 3 + 2] = positions.getZ(i);
      const sel = this.selected.has(i);
      col[i * 3]     = sel ? 0.95 : 0.5;
      col[i * 3 + 1] = sel ? 0.85 : 0.5;
      col[i * 3 + 2] = sel ? 0.30 : 0.5;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    (this.points.material as THREE.PointsMaterial).size = this.selected.size > 0 ? 6 : 4;
  }

  clear(): void { this.selected.clear(); }
  size(): number { return this.selected.size; }
  indices(): number[] { return Array.from(this.selected); }
  isEmpty(): boolean { return this.selected.size === 0; }

  toggleAll(): void {
    if (this.selected.size === this.terrain.vertexCount) this.selected.clear();
    else for (let i = 0; i < this.terrain.vertexCount; i++) this.selected.add(i);
  }

  pickInRect(x0: number, y0: number, x1: number, y1: number, additive: boolean): void {
    if (!additive) this.selected.clear();
    const tiny = (x1 - x0) < 3 && (y1 - y0) < 3;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3();
    const positions = this.terrain.positions;
    const n = this.terrain.vertexCount;

    if (tiny) {
      let best = -1;
      let bestDist = 64;
      for (let i = 0; i < n; i++) {
        v.set(positions.getX(i), positions.getY(i), positions.getZ(i)).project(this.camera);
        const sx = (v.x * 0.5 + 0.5) * r.width;
        const sy = (-v.y * 0.5 + 0.5) * r.height;
        const dx = sx - cx, dy = sy - cy;
        const d = dx * dx + dy * dy;
        if (d < bestDist) { bestDist = d; best = i; }
      }
      if (best >= 0) this.selected.add(best);
    } else {
      for (let i = 0; i < n; i++) {
        v.set(positions.getX(i), positions.getY(i), positions.getZ(i)).project(this.camera);
        const sx = (v.x * 0.5 + 0.5) * r.width;
        const sy = (-v.y * 0.5 + 0.5) * r.height;
        if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) this.selected.add(i);
      }
    }
  }

  // --- pure compute helpers (caller wraps result in a HeightEditCommand) ---

  /** New heights = current + delta. */
  computeDelta(delta: number): { indices: number[]; newHeights: number[] } {
    const indices = this.indices();
    const newHeights = indices.map(i => this.terrain.heights[i] + delta);
    return { indices, newHeights };
  }

  /** New heights = constant v. */
  computeSet(v: number): { indices: number[]; newHeights: number[] } {
    const indices = this.indices();
    const newHeights = indices.map(() => v);
    return { indices, newHeights };
  }

  /** New heights = rounded average of the current selection. */
  computeFlatten(): { indices: number[]; newHeights: number[] } | null {
    if (this.selected.size === 0) return null;
    const indices = this.indices();
    let avg = 0;
    for (const i of indices) avg += this.terrain.heights[i];
    avg /= indices.length;
    avg = Math.round(avg * 10) / 10;
    return { indices, newHeights: indices.map(() => avg) };
  }
}
