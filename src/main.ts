import './styles.css';
import * as THREE from 'three';

import { createScene } from './scene';
import { Terrain } from './terrain';
import { Water } from './water';
import { Selection } from './selection';
import { ModelLibrary } from './models';
import { buildSaveData, downloadJSON, applyLoadedData } from './io';
import { makeToast, buildTextureGrid, buildModelGrid, setupToolButtons } from './ui';
import { byId, inputById } from './dom';
import type { SaveData, ToolName } from './types';

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

// ---------- Scene ----------
const { renderer, scene, camera, controls } = createScene(viewport);

// ---------- World objects ----------
const terrain = new Terrain(scene);
const water = new Water(scene);
const selection = new Selection(scene, terrain, camera, renderer);
const models = new ModelLibrary(scene);

// ---------- Map params ----------
let mapW = 40, mapL = 40, density = 1;

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
}

// ---------- Tool state ----------
let tool: ToolName = 'select';

setupToolButtons(byId('panel'), byId('toolHint'), t => {
  tool = t;
  controls.enabled = (t === 'orbit');
});

// ---------- Selection & height controls ----------
function updateSelCount(): void {
  byId('selCount').textContent = `(${selection.size()} selected)`;
}

byId('hUp').onclick    = () => { selection.adjustHeight(1);    updateSelCount(); };
byId('hDown').onclick  = () => { selection.adjustHeight(-1);   updateSelCount(); };
byId('hUpS').onclick   = () => { selection.adjustHeight(0.1);  updateSelCount(); };
byId('hDownS').onclick = () => { selection.adjustHeight(-0.1); updateSelCount(); };
byId('hApply').onclick = () => { selection.setHeight(parseFloat(hExactEl.value) || 0); updateSelCount(); };
byId('hFlat').onclick  = () => { selection.flattenToAverage(); updateSelCount(); };
byId('selAll').onclick = () => { selection.toggleAll(); selection.sync(); updateSelCount(); };

// ---------- Texture painting ----------
buildTextureGrid(byId('texGrid'), idx => selection.paint(idx));

// ---------- Models ----------
models.onChange = () => buildModelGrid(byId('modelGrid'), models);
buildModelGrid(byId('modelGrid'), models);

byId('uploadGlbBtn').onclick = () => inputById('glbFile').click();
inputById('glbFile').addEventListener('change', async e => {
  const target = e.target as HTMLInputElement;
  if (!target.files?.length) return;
  const n = await models.addGLBFiles(target.files);
  target.value = '';
  toast(`Loaded ${n} model(s)`);
});

// ---------- Water & void inputs ----------
waterYEl.addEventListener('input', () => water.setY(parseFloat(waterYEl.value) || 0));
voidYEl.addEventListener('input',  () => terrain.setVoidY(parseFloat(voidYEl.value)));
waterOnEl.addEventListener('change', () => water.setVisible(waterOnEl.checked));

// ---------- Map rebuild ----------
byId('rebuild').onclick = () => { readMapInputs(); rebuildMap(); };

// ---------- Save / load ----------
byId('saveBtn').onclick = () => {
  const data = buildSaveData({
    mapW, mapL, density, terrain, models,
    waterY:  parseFloat(waterYEl.value),
    voidY:   parseFloat(voidYEl.value),
    waterOn: waterOnEl.checked,
  });
  downloadJSON(data);
  toast('Saved map.json');
};

byId('loadBtn').onclick = () => inputById('loadFile').click();
inputById('loadFile').addEventListener('change', async e => {
  const target = e.target as HTMLInputElement;
  const f = target.files?.[0];
  target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text()) as SaveData;
    await applyLoadedData(data, {
      scene,
      rebuildMap,
      terrain,
      water,
      models,
      setWaterY:  v => { waterYEl.value = String(v); },
      setVoidY:   v => { voidYEl.value = String(v); },
      setWaterOn: v => { waterOnEl.checked = v; },
      setMapInputs: writeMapInputs,
    });
    updateSelCount();
    toast('Map loaded');
  } catch (err) {
    console.error(err);
    toast('Load failed');
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
      left: p.px + 'px',
      top: p.py + 'px',
      width: '0px',
      height: '0px',
      display: 'block',
    });
  } else if (tool === 'place') {
    if (!terrain.mesh) return;
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObject(terrain.mesh)[0];
    if (hit) {
      models.place(hit.point, parseFloat(mYEl.value) || 0, parseFloat(mScaleEl.value) || 1);
    }
  } else if (tool === 'remove') {
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(Array.from(models.placed), true);
    if (hits.length) models.removeFromHit(hits[0].object);
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
    `${terrain.cols}×${terrain.rows} verts · ${models.placed.size} models · ${selection.size()} selected`;
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
