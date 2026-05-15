import * as THREE from 'three';
import type { IslandMap } from './islandMap';
import type { IslandInstance } from './island';

export interface AngularGroup {
  size: number;
  index: number;
  baseRole: 'player' | 'mid' | 'mid2' | 'bridge' | 'inter';
  spokeIndex?: number;
}

export function siblingsOf(islandMap: IslandMap, islandId: string): IslandInstance[] {
  const source = islandMap.findById(islandId);
  if (!source) return [];
  const sourceGroup = source.mesh.userData['angularGroup'] as AngularGroup | undefined;
  if (!sourceGroup) return [];
  return islandMap.islands.filter(other => {
    if (other.id === islandId) return false;
    const g = other.mesh.userData['angularGroup'] as AngularGroup | undefined;
    if (!g) return false;
    if (g.size !== sourceGroup.size) return false;
    if (g.baseRole !== sourceGroup.baseRole) return false;
    if (sourceGroup.baseRole === 'bridge' || sourceGroup.baseRole === 'inter') {
      return g.index === sourceGroup.index;
    }
    return true;
  });
}

export function angularOffsetTo(source: IslandInstance, target: IslandInstance): number {
  const s = source.mesh.userData['angularGroup'] as AngularGroup;
  const t = target.mesh.userData['angularGroup'] as AngularGroup;
  if (!s || !t) return 0;
  return ((t.index - s.index) / s.size) * Math.PI * 2;
}

export function rotateAroundY(point: THREE.Vector3, angle: number): THREE.Vector3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new THREE.Vector3(
    point.x * c + point.z * s,
    point.y,
    -point.x * s + point.z * c,
  );
}
