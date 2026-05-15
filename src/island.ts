import * as THREE from 'three';
import { DEFAULT_TOON_GRADIENT } from './gradientMap';
import { TEX_DEFS } from './textures';

export interface IslandShapeParams {
  seed: number;
  radius: number;
  noiseAmount: number;
  targetEdge: number;
  subdivision: number;
  topHeightVariation: number;
  depth: number;
  bottomTaper: number;
}

export const DEFAULT_ISLAND_PARAMS: IslandShapeParams = {
  seed: 1,
  radius: 5,
  noiseAmount: 0.25,
  targetEdge: 1.0,
  subdivision: 1,
  topHeightVariation: 0.1,
  depth: 4,
  bottomTaper: 0.15,
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function (): number {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface IslandData {
  geometry: THREE.BufferGeometry;
  topVertexIndices: number[];
  bottomVertexIndex: number;
  rimRadii: number[];
}

export function generateIslandGeometry(params: IslandShapeParams): IslandData {
  const rng = mulberry32(params.seed);
  const { radius, noiseAmount, topHeightVariation, depth, bottomTaper } = params;
  const sub = Math.max(1, Math.round(params.subdivision));
  const edge = Math.max(0.2, params.targetEdge) / sub;

  const rimSegments = Math.max(6, Math.round((2 * Math.PI * radius) / edge));
  const rings = Math.max(2, Math.round(radius / edge));
  const sideRingCount = Math.max(2, Math.round(depth / edge));

  const baseSegments = Math.max(6, Math.round(rimSegments / sub));
  const baseNoise: number[] = [];
  for (let i = 0; i < baseSegments; i++) {
    baseNoise.push((rng() - 0.5) * 2 * noiseAmount);
  }
  const rimRadii: number[] = [];
  for (let i = 0; i < rimSegments; i++) {
    const t = (i / rimSegments) * baseSegments;
    const i0 = Math.floor(t) % baseSegments;
    const i1 = (i0 + 1) % baseSegments;
    const f = t - Math.floor(t);
    const ff = f * f * (3 - 2 * f);
    const n = baseNoise[i0] * (1 - ff) + baseNoise[i1] * ff;
    rimRadii.push(radius * (1 + n));
  }

  const positions: number[] = [];
  const indices: number[] = [];
  const topVertexIndices: number[] = [];

  const centerY = 0;
  const centerIdx = 0;
  positions.push(0, centerY, 0);
  topVertexIndices.push(centerIdx);

  const ringVertexStart: number[] = [1];
  for (let r = 1; r <= rings; r++) {
    const t = r / rings;
    for (let s = 0; s < rimSegments; s++) {
      const angle = (s / rimSegments) * Math.PI * 2;
      const rOuter = rimRadii[s];
      const rThis = rOuter * t;
      const x = Math.cos(angle) * rThis;
      const z = Math.sin(angle) * rThis;
      const heightJitter = (rng() - 0.5) * 2 * topHeightVariation * (t * t) / sub;
      const y = centerY + heightJitter;
      positions.push(x, y, z);
      topVertexIndices.push(positions.length / 3 - 1);
    }
    ringVertexStart.push(positions.length / 3);
  }

  for (let s = 0; s < rimSegments; s++) {
    const a = centerIdx;
    const b = 1 + s;
    const c = 1 + ((s + 1) % rimSegments);
    indices.push(a, b, c);
  }

  for (let r = 1; r < rings; r++) {
    const inner = ringVertexStart[r];
    const outer = ringVertexStart[r + 1];
    for (let s = 0; s < rimSegments; s++) {
      const sn = (s + 1) % rimSegments;
      const a = inner + s;
      const b = outer + s;
      const c = outer + sn;
      const d = inner + sn;
      indices.push(a, b, c);
      indices.push(a, c, d);
    }
  }

  const rimStart = ringVertexStart[rings];

  const bottomY = -depth;
  const bottomIdx = positions.length / 3;
  positions.push(0, bottomY, 0);

  const sideRingStart: number[] = [];
  for (let sr = 1; sr <= sideRingCount; sr++) {
    const t = sr / (sideRingCount + 1);
    const ringStart = positions.length / 3;
    sideRingStart.push(ringStart);
    for (let s = 0; s < rimSegments; s++) {
      const angle = (s / rimSegments) * Math.PI * 2;
      const r0 = rimRadii[s];
      const taperedR = r0 * (1 - t * (1 - bottomTaper));
      const x = Math.cos(angle) * taperedR;
      const z = Math.sin(angle) * taperedR;
      const yJitter = (rng() - 0.5) * 0.3 / sub;
      const y = THREE.MathUtils.lerp(centerY, bottomY, t) + yJitter;
      positions.push(x, y, z);
    }
  }

  const firstSideRing = sideRingStart[0];
  for (let s = 0; s < rimSegments; s++) {
    const sn = (s + 1) % rimSegments;
    const a = rimStart + s;
    const b = firstSideRing + s;
    const c = firstSideRing + sn;
    const d = rimStart + sn;
    indices.push(a, b, c);
    indices.push(a, c, d);
  }

  for (let i = 0; i < sideRingCount - 1; i++) {
    const inner = sideRingStart[i];
    const outer = sideRingStart[i + 1];
    for (let s = 0; s < rimSegments; s++) {
      const sn = (s + 1) % rimSegments;
      const a = inner + s;
      const b = outer + s;
      const c = outer + sn;
      const d = inner + sn;
      indices.push(a, b, c);
      indices.push(a, c, d);
    }
  }

  const lastSideRing = sideRingStart[sideRingCount - 1];
  for (let s = 0; s < rimSegments; s++) {
    const sn = (s + 1) % rimSegments;
    indices.push(lastSideRing + s, bottomIdx, lastSideRing + sn);
  }

  const positionsArray = new Float32Array(positions);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positionsArray, 3));
  geometry.setIndex(indices);

  const vertexCount = positions.length / 3;
  const colors = new Float32Array(vertexCount * 3);
  const grass = TEX_DEFS[0].color;
  const stone = TEX_DEFS[1]?.color ?? TEX_DEFS[0].color;
  for (let i = 0; i < vertexCount; i++) {
    const isTop = topVertexIndices.includes(i);
    const c = isTop ? grass : stone;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  geometry.computeVertexNormals();

  return { geometry, topVertexIndices, bottomVertexIndex: bottomIdx, rimRadii };
}

export interface IslandInstance {
  mesh: THREE.Mesh;
  data: IslandData;
  params: IslandShapeParams;
  id: string;
  role: 'player' | 'mid' | 'hub' | 'bridge';
}

export function createIslandMesh(
  params: IslandShapeParams,
  id: string,
  role: IslandInstance['role'],
  shading: 'cel' | 'smooth' = 'cel',
): IslandInstance {
  const data = generateIslandGeometry(params);
  const mat = shading === 'smooth'
    ? new THREE.MeshStandardMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0.0,
        flatShading: false,
      })
    : new THREE.MeshToonMaterial({
        vertexColors: true,
        gradientMap: DEFAULT_TOON_GRADIENT,
        side: THREE.DoubleSide,
      });
  const mesh = new THREE.Mesh(data.geometry, mat);
  mesh.userData['kind'] = 'island';
  mesh.userData['islandId'] = id;
  mesh.userData['role'] = role;
  return { mesh, data, params, id, role };
}
