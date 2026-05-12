import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { ModelDef } from './types';

const gltfLoader = new GLTFLoader();

/** Built-in primitive model definitions. */
function defaultModelDefs(): ModelDef[] {
  return [
    {
      name: 'Tree', source: 'builtin', build: () => {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.2, 1, 8),
          new THREE.MeshStandardMaterial({ color: 0x712B13 }),
        );
        trunk.position.y = 0.5;
        g.add(trunk);
        const leaves = new THREE.Mesh(
          new THREE.ConeGeometry(0.7, 1.4, 8),
          new THREE.MeshStandardMaterial({ color: 0x3B6D11 }),
        );
        leaves.position.y = 1.5;
        g.add(leaves);
        return g;
      },
    },
    {
      name: 'Rock', source: 'builtin', build: () =>
        new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.5),
          new THREE.MeshStandardMaterial({ color: 0x888780, flatShading: true }),
        ),
    },
    {
      name: 'House', source: 'builtin', build: () => {
        const g = new THREE.Group();
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 1, 1.2),
          new THREE.MeshStandardMaterial({ color: 0xD3D1C7 }),
        );
        base.position.y = 0.5;
        g.add(base);
        const roof = new THREE.Mesh(
          new THREE.ConeGeometry(0.95, 0.6, 4),
          new THREE.MeshStandardMaterial({ color: 0x993C1D }),
        );
        roof.position.y = 1.3;
        roof.rotation.y = Math.PI / 4;
        g.add(roof);
        return g;
      },
    },
    {
      name: 'Tower', source: 'builtin', build: () => {
        const g = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.6, 2.2, 8),
          new THREE.MeshStandardMaterial({ color: 0x5F5E5A }),
        );
        body.position.y = 1.1;
        g.add(body);
        const top = new THREE.Mesh(
          new THREE.ConeGeometry(0.65, 0.7, 8),
          new THREE.MeshStandardMaterial({ color: 0x501313 }),
        );
        top.position.y = 2.55;
        g.add(top);
        return g;
      },
    },
  ];
}

/**
 * Parse a GLB ArrayBuffer into a reusable ModelDef whose build() returns a
 * deep clone (with cloned materials so per-instance edits don't leak).
 */
export function loadGLBFromArrayBuffer(buf: ArrayBuffer, name: string): Promise<ModelDef> {
  return new Promise((resolve, reject) => {
    gltfLoader.parse(
      buf,
      '',
      (gltf: GLTF) => {
        const proto = gltf.scene;
        resolve({
          name,
          source: 'glb',
          glbData: buf,
          build: (): THREE.Object3D => {
            const c = proto.clone(true);
            c.traverse(o => {
              const mesh = o as THREE.Mesh;
              if (mesh.isMesh) {
                const mat = mesh.material;
                mesh.material = Array.isArray(mat)
                  ? mat.map(m => m.clone())
                  : (mat as THREE.Material).clone();
              }
            });
            return c;
          },
        });
      },
      err => reject(err),
    );
  });
}

/**
 * Owns the list of model definitions, the set of placed instances, and
 * place/remove operations driven by raycasting.
 */
export class ModelLibrary {
  private scene: THREE.Scene;
  defs: ModelDef[] = defaultModelDefs();
  placed: Set<THREE.Object3D> = new Set();
  currentDefIndex = 0;
  onChange: () => void = () => {};

  constructor(scene: THREE.Scene) {
    this.scene = scene;
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

  place(worldPoint: THREE.Vector3, yOffset: number, scale: number): void {
    const def = this.defs[this.currentDefIndex];
    if (!def) return;
    const m = def.build();
    m.position.set(worldPoint.x, worldPoint.y + yOffset, worldPoint.z);
    m.scale.setScalar(scale);
    m.userData['kind'] = 'model';
    m.userData['defIndex'] = this.currentDefIndex;
    this.scene.add(m);
    this.placed.add(m);
  }

  /** Resolve a raycaster hit up to the placed root object, then remove it. */
  removeFromHit(hitObject: THREE.Object3D): void {
    let top: THREE.Object3D | null = hitObject;
    while (top && top.parent && !this.placed.has(top)) top = top.parent;
    if (top && this.placed.has(top)) {
      this.scene.remove(top);
      this.placed.delete(top);
    }
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
