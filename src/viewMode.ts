import * as THREE from 'three';
import type { IslandMap } from './islandMap';

export type ViewMode = 'solid' | 'wireframe' | 'transparent';

export class ViewModeController {
  private map: IslandMap;
  mode: ViewMode = 'solid';

  constructor(map: IslandMap) {
    this.map = map;
  }

  apply(mode: ViewMode): void {
    this.mode = mode;
    for (const isl of this.map.islands) {
      const mat = isl.mesh.material as THREE.MeshToonMaterial;
      mat.wireframe = (mode === 'wireframe');
      mat.transparent = (mode === 'transparent' || mode === 'wireframe');
      mat.opacity = mode === 'transparent' ? 0.45 : 1.0;
      mat.depthWrite = (mode === 'solid');
      mat.needsUpdate = true;
    }
  }

  reapply(): void {
    this.apply(this.mode);
  }
}
