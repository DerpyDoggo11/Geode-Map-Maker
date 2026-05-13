import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export interface SceneBundle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
}

/**
 * Build the core Three.js scene infrastructure and bind a ResizeObserver
 * to keep the renderer in sync with its container. Lighting is managed
 * separately by the Lighting class so mood can be swapped at runtime.
 */
export function createScene(viewport: HTMLElement): SceneBundle {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  viewport.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
  camera.position.set(30, 30, 30);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enabled = false; // start in select mode

  const resize = (): void => {
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(viewport);

  return { renderer, scene, camera, controls };
}
