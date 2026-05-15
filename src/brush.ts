import * as THREE from 'three';
import { attachLight } from './models';
import type { ModelLibrary } from './models';
import type { AttachedLight } from './types';

const footprintCache = new WeakMap<object, number>();

export function getFootprintRadius(obj: THREE.Object3D): number {
  const proto = obj.userData['proto'] ?? obj;
  const cached = footprintCache.get(proto);
  if (cached !== undefined) return cached * (obj.scale.x || 1);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const r = Math.max(size.x, size.z) * 0.5;
  footprintCache.set(proto, r / (obj.scale.x || 1));
  return r;
}

export interface BrushOptions {
  radius: number;
  density: number;
  yOffset: number;
  scaleMin: number;
  scaleMax: number;
  attachLight: boolean;
  lightCfg?: AttachedLight;
  spacingMultiplier: number;
}

interface PlacedCandidate {
  position: THREE.Vector3;
  radius: number;
}

export function stamp(
  center: THREE.Vector3,
  defIndex: number,
  opts: BrushOptions,
  models: ModelLibrary,
  groundMeshes: THREE.Object3D[],
): THREE.Object3D[] {
  const def = models.defs[defIndex];
  if (!def || groundMeshes.length === 0) return [];

  const area = Math.PI * opts.radius * opts.radius;
  const target = Math.max(1, Math.round(area * opts.density));
  const maxAttempts = target * 8;

  const existing: PlacedCandidate[] = [];
  models.placed.forEach(m => {
    existing.push({ position: m.position, radius: getFootprintRadius(m) });
  });

  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const created: THREE.Object3D[] = [];

  for (let attempt = 0; attempt < maxAttempts && created.length < target; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * opts.radius;
    const x = center.x + Math.cos(angle) * r;
    const z = center.z + Math.sin(angle) * r;

    raycaster.set(new THREE.Vector3(x, 1000, z), down);
    const hits = raycaster.intersectObjects(groundMeshes, false);
    if (hits.length === 0) continue;
    const groundY = hits[0].point.y;

    const scale = opts.scaleMin + Math.random() * (opts.scaleMax - opts.scaleMin);
    const instance = def.build();
    instance.scale.setScalar(scale);
    const myRadius = getFootprintRadius(instance);

    let blocked = false;
    const spacing = opts.spacingMultiplier;
    for (const ex of existing) {
      const dx = ex.position.x - x;
      const dz = ex.position.z - z;
      const minDist = (myRadius + ex.radius) * spacing;
      if (dx * dx + dz * dz < minDist * minDist) { blocked = true; break; }
    }
    if (blocked) {
      instance.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.userData['kind'] !== 'outline') {
          const mat = mesh.material;
          if (Array.isArray(mat)) mat.forEach(m => m.dispose());
          else (mat as THREE.Material).dispose();
        }
      });
      continue;
    }

    instance.position.set(x, groundY + opts.yOffset, z);
    instance.rotation.y = Math.random() * Math.PI * 2;
    instance.userData['kind'] = 'model';
    instance.userData['defIndex'] = defIndex;
    if (opts.attachLight && (opts.lightCfg ?? def.defaultLight)) {
      attachLight(instance, opts.lightCfg ?? def.defaultLight!);
    }

    created.push(instance);
    existing.push({ position: instance.position, radius: myRadius });
  }

  return created;
}

export class BrushCursor {
  private mesh: THREE.Mesh;
  private scene: THREE.Scene;
  visible = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const geo = new THREE.RingGeometry(0.95, 1, 48);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffaa55,
      transparent: true,
      opacity: 0.6,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 999;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update(center: THREE.Vector3, radius: number): void {
    this.mesh.position.copy(center);
    this.mesh.position.y += 0.05;
    this.mesh.scale.setScalar(radius);
    this.mesh.visible = true;
  }

  hide(): void { this.mesh.visible = false; }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
