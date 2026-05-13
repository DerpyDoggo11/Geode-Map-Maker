import * as THREE from 'three';
import { TEX_DEFS } from './textures';
import { DEFAULT_TOON_GRADIENT } from './gradientMap';

/**
 * The terrain grid. Owns plane geometry, per-vertex heights, per-vertex
 * texture indices, and the void-culling logic. Uses MeshToonMaterial so
 * lighting bands into hard cel-shaded stops — point lights from buildings
 * paint hard-edged warm pools onto the ground for free.
 */
export class Terrain {
  scene: THREE.Scene;
  mesh: THREE.Mesh | null = null;
  geo: THREE.PlaneGeometry | null = null;
  cols = 0;
  rows = 0;
  heights: number[] = [];
  vertColors: number[] = [];
  voidY = -3;

  private origIndex: ArrayLike<number> | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  build(width: number, length: number, density: number): void {
    this.dispose();
    this.cols = Math.max(2, Math.round(width * density) + 1);
    this.rows = Math.max(2, Math.round(length * density) + 1);

    this.geo = new THREE.PlaneGeometry(width, length, this.cols - 1, this.rows - 1);
    this.geo.rotateX(-Math.PI / 2);

    const n = this.cols * this.rows;
    this.heights = new Array(n).fill(0);
    this.vertColors = new Array(n).fill(0);

    const colorArr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      TEX_DEFS[0].color.toArray(colorArr, i * 3);
    }
    this.geo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));

    if (!this.geo.index) throw new Error('PlaneGeometry has no index buffer');
    this.origIndex = this.geo.index.array.slice();

    // Toon material reads the vertex color as the diffuse, then quantizes
    // lighting through the gradient map for the cel-shaded look.
    const mat = new THREE.MeshToonMaterial({
      vertexColors: true,
      gradientMap: DEFAULT_TOON_GRADIENT,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.userData['kind'] = 'terrain';
    this.scene.add(this.mesh);

    this.applyVoid();
  }

  dispose(): void {
    if (!this.mesh || !this.geo) return;
    this.scene.remove(this.mesh);
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh = null;
    this.geo = null;
    this.origIndex = null;
  }

  get positions(): THREE.BufferAttribute {
    return this.geo!.attributes['position'] as THREE.BufferAttribute;
  }
  get colorsAttr(): THREE.BufferAttribute {
    return this.geo!.attributes['color'] as THREE.BufferAttribute;
  }
  get vertexCount(): number {
    return this.cols * this.rows;
  }

  pushHeights(): void {
    for (let i = 0; i < this.heights.length; i++) {
      this.positions.setY(i, this.heights[i]);
    }
    this.positions.needsUpdate = true;
    this.geo!.computeVertexNormals();
  }

  setHeight(i: number, y: number): void {
    this.heights[i] = y;
    this.positions.setY(i, y);
  }

  setVertexColor(i: number, texIndex: number): void {
    const c = TEX_DEFS[texIndex]?.color ?? TEX_DEFS[0].color;
    this.vertColors[i] = texIndex;
    this.colorsAttr.setXYZ(i, c.r, c.g, c.b);
  }

  applyVoid(): void {
    if (!this.geo || !this.origIndex) return;
    const orig = this.origIndex;
    const out: number[] = [];
    for (let i = 0; i < orig.length; i += 3) {
      const a = orig[i], b = orig[i + 1], c = orig[i + 2];
      if (this.heights[a] > this.voidY && this.heights[b] > this.voidY && this.heights[c] > this.voidY) {
        out.push(a, b, c);
      }
    }
    this.geo.setIndex(out);
  }

  setVoidY(y: number): void {
    this.voidY = y;
    this.applyVoid();
  }
}
