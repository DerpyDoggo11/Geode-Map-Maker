import * as THREE from 'three';
import type { Command } from './history';
import type { Terrain } from './terrain';
import type { ModelLibrary } from './models';
import type { IslandMap } from './islandMap';
import type { VertRef } from './islandSelection';

/**
 * Edit the height of a set of vertices. Stores per-vertex before/after so
 * undo restores exact prior values, not a diff.
 */
export class HeightEditCommand implements Command {
  label = 'Edit heights';
  private terrain: Terrain;
  private indices: number[];
  private before: number[];
  private after: number[];
  private onAfter: () => void;

  constructor(terrain: Terrain, indices: number[], newHeights: number[], onAfter: () => void) {
    this.terrain = terrain;
    this.indices = indices;
    this.before = indices.map(i => terrain.heights[i]);
    this.after = newHeights;
    this.onAfter = onAfter;
  }

  do(): void { this.applyArray(this.after); }
  undo(): void { this.applyArray(this.before); }

  private applyArray(values: number[]): void {
    for (let k = 0; k < this.indices.length; k++) {
      const i = this.indices[k];
      this.terrain.heights[i] = values[k];
      this.terrain.positions.setY(i, values[k]);
    }
    this.terrain.positions.needsUpdate = true;
    this.terrain.geo!.computeVertexNormals();
    this.terrain.applyVoid();
    this.onAfter();
  }
}

/** Repaint a set of vertices with a single new texture index. */
export class PaintCommand implements Command {
  label = 'Paint terrain';
  private terrain: Terrain;
  private indices: number[];
  private before: number[];
  private after: number;

  constructor(terrain: Terrain, indices: number[], texIndex: number) {
    this.terrain = terrain;
    this.indices = indices;
    this.before = indices.map(i => terrain.vertColors[i]);
    this.after = texIndex;
  }

  do(): void {
    for (const i of this.indices) this.terrain.setVertexColor(i, this.after);
    this.terrain.colorsAttr.needsUpdate = true;
  }
  undo(): void {
    for (let k = 0; k < this.indices.length; k++) {
      this.terrain.setVertexColor(this.indices[k], this.before[k]);
    }
    this.terrain.colorsAttr.needsUpdate = true;
  }
}

/**
 * Add a model. We capture a reference to the object so re-doing places the
 * exact same instance back into the scene rather than building a fresh one
 * (which would be wasteful and would lose any attached lights).
 */
export class PlaceModelCommand implements Command {
  label = 'Place model';
  private models: ModelLibrary;
  private obj: THREE.Object3D;

  constructor(models: ModelLibrary, obj: THREE.Object3D) {
    this.models = models;
    this.obj = obj;
  }

  do(): void {
    this.models.scene.add(this.obj);
    this.models.placed.add(this.obj);
  }
  undo(): void {
    this.models.scene.remove(this.obj);
    this.models.placed.delete(this.obj);
  }
}

/** Remove a model. Mirror of PlaceModelCommand. */
export class RemoveModelCommand implements Command {
  label = 'Remove model';
  private models: ModelLibrary;
  private obj: THREE.Object3D;

  constructor(models: ModelLibrary, obj: THREE.Object3D) {
    this.models = models;
    this.obj = obj;
  }

  do(): void {
    this.models.scene.remove(this.obj);
    this.models.placed.delete(this.obj);
  }
  undo(): void {
    this.models.scene.add(this.obj);
    this.models.placed.add(this.obj);
  }
}

export class BrushStrokeCommand implements Command {
  label = 'Brush stroke';
  private models: ModelLibrary;
  private objs: THREE.Object3D[];

  constructor(models: ModelLibrary, objs: THREE.Object3D[]) {
    this.models = models;
    this.objs = objs;
  }

  do(): void {
    for (const o of this.objs) {
      this.models.scene.add(o);
      this.models.placed.add(o);
    }
  }
  undo(): void {
    for (const o of this.objs) {
      this.models.scene.remove(o);
      this.models.placed.delete(o);
    }
  }
}

export class VertexMoveCommand implements Command {
  label = 'Move vertices';
  private map: IslandMap;
  private refs: VertRef[];
  private before: THREE.Vector3[];
  private after: THREE.Vector3[];
  private onAfter: () => void;

  constructor(
    map: IslandMap,
    refs: VertRef[],
    before: THREE.Vector3[],
    after: THREE.Vector3[],
    onAfter: () => void,
  ) {
    this.map = map;
    this.refs = refs;
    this.before = before;
    this.after = after;
    this.onAfter = onAfter;
  }

  do(): void { this.apply(this.after); }
  undo(): void { this.apply(this.before); }

  private apply(arr: THREE.Vector3[]): void {
    const touched = new Set<string>();
    for (let k = 0; k < this.refs.length; k++) {
      const ref = this.refs[k];
      const isl = this.map.findById(ref.islandId);
      if (!isl) continue;
      const pos = isl.mesh.geometry.attributes['position'] as THREE.BufferAttribute;
      const v = arr[k];
      pos.setXYZ(ref.vertIndex, v.x, v.y, v.z);
      touched.add(ref.islandId);
    }
    for (const id of touched) {
      const isl = this.map.findById(id);
      if (!isl) continue;
      (isl.mesh.geometry.attributes['position'] as THREE.BufferAttribute).needsUpdate = true;
      isl.mesh.geometry.computeVertexNormals();
    }
    this.onAfter();
  }
}

export class RotateModelCommand implements Command {
  label = 'Rotate model';
  private objs: THREE.Object3D[];
  private before: number[];
  private after: number[];

  constructor(objs: THREE.Object3D[], rotation: number, relative: boolean) {
    this.objs = objs;
    this.before = objs.map(o => o.rotation.y);
    this.after = relative
      ? this.before.map(b => b + rotation)
      : objs.map(() => rotation);
  }

  do(): void {
    for (let i = 0; i < this.objs.length; i++) this.objs[i].rotation.y = this.after[i];
  }
  undo(): void {
    for (let i = 0; i < this.objs.length; i++) this.objs[i].rotation.y = this.before[i];
  }
}

export class RemoveMultipleCommand implements Command {
  label = 'Remove models';
  private models: ModelLibrary;
  private objs: THREE.Object3D[];

  constructor(models: ModelLibrary, objs: THREE.Object3D[]) {
    this.models = models;
    this.objs = objs;
  }

  do(): void {
    for (const o of this.objs) {
      this.models.scene.remove(o);
      this.models.placed.delete(o);
    }
  }
  undo(): void {
    for (const o of this.objs) {
      this.models.scene.add(o);
      this.models.placed.add(o);
    }
  }
}
