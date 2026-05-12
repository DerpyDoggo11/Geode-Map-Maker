import * as THREE from 'three';

/** Transparent blue plane that sits above the terrain at a configurable Y. */
export class Water {
  scene: THREE.Scene;
  mesh: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  build(width: number, length: number, y: number, visible: boolean): void {
    this.dispose();
    const g = new THREE.PlaneGeometry(width * 1.2, length * 1.2);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({
      color: 0x378ADD,
      transparent: true,
      opacity: 0.6,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.position.y = y;
    this.mesh.visible = visible;
    this.scene.add(this.mesh);
  }

  dispose(): void {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh = null;
  }

  setY(y: number): void {
    if (this.mesh) this.mesh.position.y = y;
  }

  setVisible(v: boolean): void {
    if (this.mesh) this.mesh.visible = v;
  }
}
