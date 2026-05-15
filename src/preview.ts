import * as THREE from 'three';
import type { ModelDef } from './types';

export class PreviewGhost {
  private scene: THREE.Scene;
  private current: THREE.Object3D | null = null;
  private currentDef: ModelDef | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  show(def: ModelDef, point: THREE.Vector3, yOffset: number, scale: number, rotationY: number): void {
    if (this.currentDef !== def) {
      this.dispose();
      const obj = def.build();
      obj.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (mesh.userData['kind'] === 'outline') {
          mesh.visible = false;
          return;
        }
        const cloned = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).clone() as THREE.Material;
        cloned.transparent = true;
        cloned.opacity = 0.45;
        cloned.depthWrite = false;
        mesh.material = cloned;
      });
      obj.userData['kind'] = 'preview-ghost';
      this.scene.add(obj);
      this.current = obj;
      this.currentDef = def;
    }
    this.current!.position.set(point.x, point.y + yOffset, point.z);
    this.current!.scale.setScalar(scale);
    this.current!.rotation.y = rotationY;
    this.current!.visible = true;
  }

  hide(): void {
    if (this.current) this.current.visible = false;
  }

  dispose(): void {
    if (!this.current) return;
    this.current.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach(m => m.dispose());
      else (mat as THREE.Material).dispose();
    });
    this.scene.remove(this.current);
    this.current = null;
    this.currentDef = null;
  }
}
