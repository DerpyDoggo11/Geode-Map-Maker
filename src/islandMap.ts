import * as THREE from 'three';
import { createIslandMesh, type IslandInstance, type IslandShapeParams, DEFAULT_ISLAND_PARAMS } from './island';

export type HubStyle = 'single' | 'ring' | 'cluster' | 'connected' | 'none';

export interface MapConfig {
  seed: number;
  globalScale: number;

  playerCount: number;
  playerRingRadius: number;
  playerIslandRadius: number;
  playerIslandHeight: number;

  hubStyle: HubStyle;
  hubRadius: number;
  hubIslandCount: number;
  hubLobeRadius: number;

  midIslandCount: number;
  midRingRadius: number;
  midIslandRadius: number;
  midIslandHeight: number;

  mid2IslandCount: number;
  mid2RingRadius: number;
  mid2IslandRadius: number;
  mid2IslandHeight: number;

  bridgeIslandsPerSpoke: number;
  bridgeIslandRadius: number;

  interPlayerCount: number;
  interPlayerRadius: number;
  interPlayerRingRadius: number;

  shapeNoise: number;
  rimSegments: number;
  rings: number;
  sideRings: number;
  subdivision: number;

  mirrorSymmetric: boolean;
}

export const DEFAULT_MAP_CONFIG: MapConfig = {
  seed: 1,
  globalScale: 1,

  playerCount: 8,
  playerRingRadius: 40,
  playerIslandRadius: 6,
  playerIslandHeight: 3.5,

  hubStyle: 'connected',
  hubRadius: 10,
  hubIslandCount: 4,
  hubLobeRadius: 4,

  midIslandCount: 8,
  midRingRadius: 22,
  midIslandRadius: 3.5,
  midIslandHeight: 2.5,

  mid2IslandCount: 0,
  mid2RingRadius: 30,
  mid2IslandRadius: 2.5,
  mid2IslandHeight: 2,

  bridgeIslandsPerSpoke: 2,
  bridgeIslandRadius: 1.5,

  interPlayerCount: 0,
  interPlayerRadius: 2,
  interPlayerRingRadius: 40,

  shapeNoise: 0.25,
  rimSegments: 14,
  rings: 3,
  sideRings: 3,
  subdivision: 1,

  mirrorSymmetric: true,
};

function paramsFor(
  base: Partial<IslandShapeParams>,
  config: MapConfig,
  seedOffset: number,
): IslandShapeParams {
  return {
    ...DEFAULT_ISLAND_PARAMS,
    rimSegments: config.rimSegments,
    rings: config.rings,
    sideRings: config.sideRings,
    subdivision: config.subdivision,
    noiseAmount: config.shapeNoise,
    seed: config.seed + seedOffset,
    ...base,
  };
}

export class IslandMap {
  scene: THREE.Scene;
  islands: IslandInstance[] = [];
  config: MapConfig;
  onChange: () => void = () => {};

  constructor(scene: THREE.Scene, config: MapConfig = DEFAULT_MAP_CONFIG) {
    this.scene = scene;
    this.config = { ...config };
  }

  clear(): void {
    for (const isl of this.islands) {
      this.scene.remove(isl.mesh);
      isl.mesh.geometry.dispose();
      (isl.mesh.material as THREE.Material).dispose();
    }
    this.islands = [];
  }

  generate(): void {
    this.clear();
    const cfg = this.config;
    const S = cfg.globalScale;
    let seedOffset = 0;
    const nextSeed = (): number => seedOffset++;

    const addIsland = (
      params: IslandShapeParams,
      id: string,
      role: IslandInstance['role'],
      x: number,
      y: number,
      z: number,
      angularGroup?: { size: number; index: number; baseRole: string; spokeIndex?: number },
    ): void => {
      const isl = createIslandMesh(params, id, role);
      isl.mesh.position.set(x * S, y * S, z * S);
      isl.mesh.scale.setScalar(S);
      if (angularGroup) {
        isl.mesh.userData['angularGroup'] = angularGroup;
      }
      this.scene.add(isl.mesh);
      this.islands.push(isl);
    };

    if (cfg.hubStyle === 'single') {
      const params = paramsFor({
        radius: cfg.hubRadius,
        depth: cfg.playerIslandHeight + 2,
      }, cfg, nextSeed());
      addIsland(params, 'hub-0', 'hub', 0, 0, 0);
    } else if (cfg.hubStyle === 'ring') {
      const n = Math.max(1, cfg.hubIslandCount);
      const r = cfg.hubLobeRadius;
      const minSeparation = (r * 2) / (2 * Math.sin(Math.PI / n));
      const ringR = Math.max(cfg.hubRadius, minSeparation);
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2;
        const params = paramsFor({
          radius: r,
          depth: cfg.playerIslandHeight,
          noiseAmount: cfg.shapeNoise * 0.5,
        }, cfg, nextSeed());
        addIsland(
          params, `hub-${i}`, 'hub',
          Math.cos(angle) * ringR, 0, Math.sin(angle) * ringR,
        );
      }
    } else if (cfg.hubStyle === 'connected') {
      const n = Math.max(2, cfg.hubIslandCount);
      const lobeR = cfg.hubLobeRadius;
      const ringR = Math.max(0.001, cfg.hubRadius - lobeR * 0.5);
      const centralR = Math.max(lobeR * 0.8, cfg.hubRadius * 0.5);
      const centralParams = paramsFor({
        radius: centralR,
        depth: cfg.playerIslandHeight + 1,
        noiseAmount: cfg.shapeNoise * 0.4,
      }, cfg, nextSeed());
      addIsland(centralParams, 'hub-core', 'hub', 0, 0, 0);
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2;
        const params = paramsFor({
          radius: lobeR,
          depth: cfg.playerIslandHeight,
          noiseAmount: cfg.shapeNoise * 0.4,
        }, cfg, nextSeed());
        addIsland(
          params, `hub-${i}`, 'hub',
          Math.cos(angle) * ringR, 0, Math.sin(angle) * ringR,
        );
      }
    } else if (cfg.hubStyle === 'cluster') {
      const centralParams = paramsFor({
        radius: cfg.hubRadius * 0.6,
        depth: cfg.playerIslandHeight + 1,
      }, cfg, nextSeed());
      addIsland(centralParams, 'hub-center', 'hub', 0, 0, 0);
      for (let i = 0; i < cfg.hubIslandCount; i++) {
        const angle = (i / cfg.hubIslandCount) * Math.PI * 2;
        const params = paramsFor({
          radius: cfg.hubLobeRadius,
          depth: cfg.playerIslandHeight,
        }, cfg, nextSeed());
        addIsland(
          params, `hub-${i}`, 'hub',
          Math.cos(angle) * cfg.hubRadius * 0.9, -0.5,
          Math.sin(angle) * cfg.hubRadius * 0.9,
        );
      }
    }

    if (cfg.midIslandCount > 0) {
      const midSeed = nextSeed();
      for (let i = 0; i < cfg.midIslandCount; i++) {
        const angle = (i / cfg.midIslandCount) * Math.PI * 2;
        const seed = cfg.mirrorSymmetric ? midSeed : nextSeed();
        const params = paramsFor({
          radius: cfg.midIslandRadius,
          depth: cfg.midIslandHeight,
        }, cfg, seed);
        addIsland(
          params, `mid-${i}`, 'mid',
          Math.cos(angle) * cfg.midRingRadius, 0,
          Math.sin(angle) * cfg.midRingRadius,
          { size: cfg.midIslandCount, index: i, baseRole: 'mid' },
        );
      }
    }

    if (cfg.mid2IslandCount > 0) {
      const mid2Seed = nextSeed();
      const offset = cfg.midIslandCount > 0
        ? Math.PI / cfg.midIslandCount
        : 0;
      for (let i = 0; i < cfg.mid2IslandCount; i++) {
        const angle = (i / cfg.mid2IslandCount) * Math.PI * 2 + offset;
        const seed = cfg.mirrorSymmetric ? mid2Seed : nextSeed();
        const params = paramsFor({
          radius: cfg.mid2IslandRadius,
          depth: cfg.mid2IslandHeight,
        }, cfg, seed);
        addIsland(
          params, `mid2-${i}`, 'mid',
          Math.cos(angle) * cfg.mid2RingRadius, -0.5,
          Math.sin(angle) * cfg.mid2RingRadius,
          { size: cfg.mid2IslandCount, index: i, baseRole: 'mid2' },
        );
      }
    }

    const playerSeed = nextSeed();
    const playerBridgeSeeds: number[] = [];
    if (cfg.bridgeIslandsPerSpoke > 0) {
      for (let b = 0; b < cfg.bridgeIslandsPerSpoke; b++) playerBridgeSeeds.push(nextSeed());
    }
    for (let i = 0; i < cfg.playerCount; i++) {
      const angle = (i / cfg.playerCount) * Math.PI * 2;
      const seed = cfg.mirrorSymmetric ? playerSeed : nextSeed();
      const params = paramsFor({
        radius: cfg.playerIslandRadius,
        depth: cfg.playerIslandHeight,
      }, cfg, seed);
      addIsland(
        params, `player-${i}`, 'player',
        Math.cos(angle) * cfg.playerRingRadius, 0,
        Math.sin(angle) * cfg.playerRingRadius,
        { size: cfg.playerCount, index: i, baseRole: 'player' },
      );

      if (cfg.bridgeIslandsPerSpoke > 0) {
        for (let b = 1; b <= cfg.bridgeIslandsPerSpoke; b++) {
          const t = b / (cfg.bridgeIslandsPerSpoke + 1);
          const innerR = cfg.midIslandCount > 0
            ? cfg.midRingRadius + cfg.midIslandRadius
            : cfg.hubRadius + 2;
          const outerR = cfg.playerRingRadius - cfg.playerIslandRadius;
          const rr = THREE.MathUtils.lerp(innerR, outerR, t);
          const bseed = cfg.mirrorSymmetric ? playerBridgeSeeds[b - 1] : nextSeed();
          const bparams = paramsFor({
            radius: cfg.bridgeIslandRadius,
            depth: cfg.midIslandHeight * 0.7,
          }, cfg, bseed);
          addIsland(
            bparams, `bridge-${i}-${b}`, 'bridge',
            Math.cos(angle) * rr, -0.3,
            Math.sin(angle) * rr,
            { size: cfg.playerCount, index: i, baseRole: 'bridge', spokeIndex: b },
          );
        }
      }
    }

    if (cfg.interPlayerCount > 0 && cfg.playerCount > 0) {
      const ringR = cfg.interPlayerRingRadius;
      const sectorAngle = (Math.PI * 2) / cfg.playerCount;
      const interSeeds: number[] = [];
      for (let k = 0; k < cfg.interPlayerCount; k++) interSeeds.push(nextSeed());
      for (let s = 0; s < cfg.playerCount; s++) {
        const baseAngle = (s / cfg.playerCount) * Math.PI * 2;
        for (let k = 1; k <= cfg.interPlayerCount; k++) {
          const offset = (k / (cfg.interPlayerCount + 1)) * sectorAngle;
          const angle = baseAngle + offset;
          const seed = cfg.mirrorSymmetric ? interSeeds[k - 1] : nextSeed();
          const params = paramsFor({
            radius: cfg.interPlayerRadius,
            depth: cfg.midIslandHeight * 0.7,
            noiseAmount: cfg.shapeNoise * 0.7,
          }, cfg, seed);
          addIsland(
            params, `inter-${s}-${k}`, 'bridge',
            Math.cos(angle) * ringR, -0.5,
            Math.sin(angle) * ringR,
            { size: cfg.playerCount, index: s, baseRole: 'inter', spokeIndex: k },
          );
        }
      }
    }

    this.onChange();
  }

  findById(id: string): IslandInstance | undefined {
    return this.islands.find(i => i.id === id);
  }

  allMeshes(): THREE.Mesh[] {
    return this.islands.map(i => i.mesh);
  }
}
