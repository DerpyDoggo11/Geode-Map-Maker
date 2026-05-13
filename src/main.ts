import './styles.css';
import * as THREE from 'three';

import { createScene } from './scene';
import { Terrain } from './terrain';
import { Water } from './water';
import { Selection } from './selection';
import { ModelLibrary, attachLight } from './models';
import { Lighting, type Mood } from './lighting';
import { History } from './history';
import {
  HeightEditCommand,
  PaintCommand,
  PlaceModelCommand,
  RemoveModelCommand,
} from './commands';
import { buildSaveData, downloadJSON, applyLoadedData } from './io';
import { makeToast, buildTextureGrid, buildModelGrid, setupToolButtons } from './ui';
import { byId, inputById } from './dom';
import type { AttachedLight, ToolName } from './types';

// ---------- DOM refs ----------
const viewport = byId('viewport');
const hud = byId('hud');
const selBox = byId('selBox');
const toast = makeToast(byId('toast'));

const mapWEl = inputById('mapW');
const mapLEl = inputById('mapL');
const mapDEl = inputById('mapD');
const waterYEl = inputById('waterY');
const voidYEl = inputById('voidY');
const waterOnEl = inputById('waterOn');
const mYEl = inputById('mY');
const mScaleEl = inputById('mScale');
const hExactEl = inputById('hExact');

const attachLightEl = inputById('attachLight');
const lightColorEl = inputById('lightColor');
const lightIntensityEl = inputById('lightIntensity');
const lightRangeEl = inputById('lightRange');
const lightYEl = inputById('lightY');

const undoBtn = byId<HTMLButtonElement>('undoBtn');
const redoBtn = byId<HTMLButtonElement>('redoBtn');

// ---------- Scene ----------
const { renderer, scene, camera, controls } = createScene(viewport);
const lighting = new Lighting(scene);

// ---------- World objects ----------
const terrain = new Terrain(scene);
const water = new Water(scene);
const selection = new Selection(scene, terrain, camera, renderer);
const models = new ModelLibrary(scene);

// ---------- History ----------
const history = new History(200);
history.onChange = (): void => {
  undoBtn.disabled = !history.canUndo();
  redoBtn.disabled = !history.canRedo();
};

// ---------- Map params ----------
let mapW = 40, mapL = 40, density = 1;
let currentMood: Mood = 'night';

function readMapInputs(): void {
  mapW = parseFloat(mapWEl.value) || 40;
  mapL = parseFloat(mapLEl.value) || 40;
  density = parseFloat(mapDEl.value) || 1;
}

function writeMapInputs(w: number, l: number, d: number): void {
  mapW = w; mapL = l; density = d;
  mapWEl.value = String(w);
  mapLEl.value = String(l);
  mapDEl.value = String(d);
}

function rebuildMap(): void {
  models.clearPlaced();
  terrain.build(mapW, mapL, density);
  terrain.setVoidY(parseFloat(voidYEl.value));
  water.build(mapW, mapL, parseFloat(waterYEl.value), waterOnEl.checked);
  selection.clear();
  selection.rebuildHelpers();
  updateSelCount();
  // Rebuilding wipes vertex identity, so history wouldn't make sense to replay.
  history.clear();
}

let tool: ToolName = 'select';

setupToolButtons(byId('panel'), byId('toolHint'), t => {
  tool = t;
  controls.enabled = (t === 'orbit');
});

document.querySelectorAll<HTMLButtonElement>('.mood-btn').forEach(b => {
  b.onclick = (): void => {
    document.querySelectorAll('.mood-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    const mood = b.dataset['mood'] as Mood;
    currentMood = mood;
    lighting.applyMood(mood);
  };
});

function setMoodUI(m: Mood): void {
  currentMood = m;
  document.querySelectorAll<HTMLButtonElement>('.mood-btn').forEach(b => {
    b.classList.toggle('active', b.dataset['mood'] === m);
  });
}

// ---------- Selection & height controls ----------
function updateSelCount(): void {
  byId('selCount').textContent = `(${selection.size()} selected)`;
}

/** Build a HeightEditCommand from a "compute" helper and run it through history. */
function runHeightOp(result: { indices: number[]; newHeights: number[] } | null): void {
  if (!result || result.indices.length === 0) return;
  const cmd = new HeightEditCommand(terrain, result.indices, result.newHeights, () => {
    selection.sync();
  });
  history.execute(cmd);
  updateSelCount();
}

byId('hUp').onclick    = (): void => runHeightOp(selection.computeDelta(1));
byId('hDown').onclick  = (): void => runHeightOp(selection.computeDelta(-1));
byId('hUpS').onclick   = (): void => runHeightOp(selection.computeDelta(0.1));
byId('hDownS').onclick = (): void => runHeightOp(selection.computeDelta(-0.1));
byId('hApply').onclick = (): void => runHeightOp(selection.computeSet(parseFloat(hExactEl.value) || 0));
byId('hFlat').onclick  = (): void => runHeightOp(selection.computeFlatten());

byId('selAll').onclick = (): void => {
  // Selection changes are NOT on the undo stack — that would be annoying.
  selection.toggleAll();
  selection.sync();
  updateSelCount();
};

// ---------- Texture painting ----------
buildTextureGrid(byId('texGrid'), idx => {
  if (selection.isEmpty()) return;
  const cmd = new PaintCommand(terrain, selection.indices(), idx);
  history.execute(cmd);
});

// ---------- Models ----------
models.onChange = (): void => buildModelGrid(byId('modelGrid'), models);
buildModelGrid(byId('modelGrid'), models);

byId('uploadGlbBtn').onclick = (): void => inputById('glbFile').click();
inputById('glbFile').addEventListener('change', async e => {
  const target = e.target as HTMLInputElement;
  if (!target.files?.length) return;
  const n = await models.addGLBFiles(target.files);
  target.value = '';
  toast(`Loaded ${n} model(s)`);
});

/** Read the current light-config fields into an AttachedLight struct. */
function readLightConfig(): AttachedLight {
  return {
    color: new THREE.Color(lightColorEl.value).getHex(),
    intensity: parseFloat(lightIntensityEl.value) || 0,
    range: parseFloat(lightRangeEl.value) || 0,
    offset: [0, parseFloat(lightYEl.value) || 0, 0],
  };
}

// ---------- Water & void inputs ----------
waterYEl.addEventListener('input', () => water.setY(parseFloat(waterYEl.value) || 0));
voidYEl.addEventListener('input',  () => terrain.setVoidY(parseFloat(voidYEl.value)));
waterOnEl.addEventListener('change', () => water.setVisible(waterOnEl.checked));

// ---------- Map rebuild ----------
byId('rebuild').onclick = (): void => { readMapInputs(); rebuildMap(); };

// ---------- Save / load ----------
byId('saveBtn').onclick = (): void => {
  const data = buildSaveData({
    mapW, mapL, density, terrain, models,
    waterY:  parseFloat(waterYEl.value),
    voidY:   parseFloat(voidYEl.value),
    waterOn: waterOnEl.checked,
    mood:    currentMood,
  });
  downloadJSON(data);
  toast('Saved map.json');
};

byId('loadBtn').onclick = (): void => inputById('loadFile').click();
inputById('loadFile').addEventListener('change', async e => {
  const target = e.target as HTMLInputElement;
  const f = target.files?.[0];
  target.value = '';
  if (!f) return;
  try {
    const raw = JSON.parse(await f.text()) as unknown;
    await applyLoadedData(raw, {
      scene,
      rebuildMap,
      terrain,
      water,
      models,
      lighting,
      setWaterY:  v => { waterYEl.value = String(v); },
      setVoidY:   v => { voidYEl.value = String(v); },
      setWaterOn: v => { waterOnEl.checked = v; },
      setMapInputs: writeMapInputs,
      setMoodUI,
    });
    history.clear();
    updateSelCount();
    toast('Map loaded');
  } catch (err) {
    console.error(err);
    toast('Load failed');
  }
});

// ---------- Undo / redo ----------
undoBtn.onclick = (): void => history.undo();
redoBtn.onclick = (): void => history.redo();

window.addEventListener('keydown', (e: KeyboardEvent) => {
  // Don't hijack when the user is typing in an input
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const key = e.key.toLowerCase();
  if (key === 'z' && !e.shiftKey) {
    e.preventDefault();
    history.undo();
  } else if ((key === 'z' && e.shiftKey) || key === 'y') {
    e.preventDefault();
    history.redo();
  }
});

// ---------- Pointer interactions ----------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let dragStart: { x: number; y: number } | null = null;
let dragging = false;
let shiftHeld = false;

function getPointerPos(e: PointerEvent): { px: number; py: number } {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  return { px: e.clientX - r.left, py: e.clientY - r.top };
}

renderer.domElement.addEventListener('pointerdown', (e: PointerEvent) => {
  shiftHeld = e.shiftKey;
  const p = getPointerPos(e);

  if (tool === 'select') {
    dragStart = { x: p.px, y: p.py };
    dragging = true;
    Object.assign(selBox.style, {
      left: p.px + 'px', top: p.py + 'px', width: '0px', height: '0px', display: 'block',
    });
  } else if (tool === 'place') {
    if (!terrain.mesh) return;
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObject(terrain.mesh)[0];
    if (hit) {
      const m = models.build(
        models.currentDefIndex,
        hit.point,
        parseFloat(mYEl.value) || 0,
        parseFloat(mScaleEl.value) || 1,
        attachLightEl.checked,
      );
      if (m) {
        // If the def had no defaultLight but the user wants a light, attach
        // one using the panel config so any model can be lit.
        if (attachLightEl.checked && !m.userData['attachedLight']) {
          attachLight(m, readLightConfig());
        }
        history.execute(new PlaceModelCommand(models, m));
      }
    }
  } else if (tool === 'remove') {
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(Array.from(models.placed), true);
    if (hits.length) {
      const root = models.findPlacedRoot(hits[0].object);
      if (root) history.execute(new RemoveModelCommand(models, root));
    }
  }
});

renderer.domElement.addEventListener('pointermove', (e: PointerEvent) => {
  if (!dragging || tool !== 'select' || !dragStart) return;
  const p = getPointerPos(e);
  const x = Math.min(dragStart.x, p.px);
  const y = Math.min(dragStart.y, p.py);
  const w = Math.abs(p.px - dragStart.x);
  const h = Math.abs(p.py - dragStart.y);
  Object.assign(selBox.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
});

renderer.domElement.addEventListener('pointerup', (e: PointerEvent) => {
  if (!dragging || !dragStart) return;
  dragging = false;
  selBox.style.display = 'none';
  const p = getPointerPos(e);
  const x0 = Math.min(dragStart.x, p.px), x1 = Math.max(dragStart.x, p.px);
  const y0 = Math.min(dragStart.y, p.py), y1 = Math.max(dragStart.y, p.py);
  selection.pickInRect(x0, y0, x1, y1, shiftHeld);
  selection.sync();
  updateSelCount();
});

// ---------- Init & render loop ----------
rebuildMap();

function tick(): void {
  controls.update();
  hud.textContent =
    `${terrain.cols}×${terrain.rows} verts · ${models.placed.size} models · ${selection.size()} selected · ${currentMood}`;
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
