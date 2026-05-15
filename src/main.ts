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
  BrushStrokeCommand,
  RemoveMultipleCommand,
  VertexMoveCommand,
} from './commands';
import {
  buildSaveData,
  buildIslandSaveData,
  downloadJSON,
  applyLoadedData,
  applyIslandLoadedData,
  detectMapType,
} from './io';
import { makeToast, buildTextureGrid, buildModelGrid, setupToolButtons } from './ui';
import { byId, inputById } from './dom';
import type { AttachedLight, ToolName, MapType, EditorState } from './types';
import { BrushCursor, stamp } from './brush';
import { PreviewGhost } from './preview';
import { siblingsOf, angularOffsetTo, rotateAroundY } from './mirror';
import type { VertRef } from './islandSelection';
import type { IslandInstance } from './island';
import { IslandMap, type HubStyle, type MapConfig } from './islandMap';
import { IslandSelection } from './islandSelection';
import { ViewModeController, type ViewMode } from './viewMode';

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
const mRotationEl = inputById('mRotation');
const hExactEl = inputById('hExact');
const moveAxisEl = byId<HTMLSelectElement>('moveAxis');
const moveStepEl = inputById('moveStep');

const attachLightEl = inputById('attachLight');
const lightColorEl = inputById('lightColor');
const lightIntensityEl = inputById('lightIntensity');
const lightRangeEl = inputById('lightRange');
const lightYEl = inputById('lightY');

const brushRadiusEl = inputById('brushRadius');
const brushDensityEl = inputById('brushDensity');
const brushScaleMinEl = inputById('brushScaleMin');
const brushScaleMaxEl = inputById('brushScaleMax');
const brushSpacingEl = inputById('brushSpacing');

const islSeedEl = inputById('islSeed');
const islScaleEl = inputById('islScale');
const islPlayersEl = inputById('islPlayers');
const islPlayerRingEl = inputById('islPlayerRing');
const islPlayerRadiusEl = inputById('islPlayerRadius');
const islPlayerDepthEl = inputById('islPlayerDepth');
const islHubStyleEl = byId<HTMLSelectElement>('islHubStyle');
const islHubRadiusEl = inputById('islHubRadius');
const islHubCountEl = inputById('islHubCount');
const islHubLobeEl = inputById('islHubLobe');
const islMidCountEl = inputById('islMidCount');
const islMidRingEl = inputById('islMidRing');
const islMidRadiusEl = inputById('islMidRadius');
const islMidDepthEl = inputById('islMidDepth');
const islMid2CountEl = inputById('islMid2Count');
const islMid2RingEl = inputById('islMid2Ring');
const islMid2RadiusEl = inputById('islMid2Radius');
const islMid2DepthEl = inputById('islMid2Depth');
const islBridgeCountEl = inputById('islBridgeCount');
const islBridgeRadiusEl = inputById('islBridgeRadius');
const islInterCountEl = inputById('islInterCount');
const islInterRadiusEl = inputById('islInterRadius');
const islInterRingEl = inputById('islInterRing');
const islNoiseEl = inputById('islNoise');
const islRimSegsEl = inputById('islRimSegs');
const islRingsEl = inputById('islRings');
const islSideRingsEl = inputById('islSideRings');
const islSubdivisionEl = inputById('islSubdivision');
const islMirrorSymmetricEl = inputById('islMirrorSymmetric');

const undoBtn = byId<HTMLButtonElement>('undoBtn');
const redoBtn = byId<HTMLButtonElement>('redoBtn');

const { renderer, scene, camera, controls } = createScene(viewport);
const lighting = new Lighting(scene);

const terrain = new Terrain(scene);
const water = new Water(scene);
const selection = new Selection(scene, terrain, camera, renderer);
const models = new ModelLibrary(scene);
const brushCursor = new BrushCursor(scene);
const previewGhost = new PreviewGhost(scene);

const islandMap = new IslandMap(scene);
let islandSelection: IslandSelection = new IslandSelection(scene, islandMap, camera, renderer);
const viewModeCtl = new ViewModeController(islandMap);

let mapType: MapType = 'plane';
let mirrorEnabled = true;

function setMirrorEnabled(v: boolean): void {
  mirrorEnabled = v;
  const cb = byId<HTMLInputElement>('mirrorEnabled');
  if (cb) cb.checked = v;
}

const history = new History(200);
history.onChange = (): void => {
  undoBtn.disabled = !history.canUndo();
  redoBtn.disabled = !history.canRedo();
};

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

function readIslandConfig(): MapConfig {
  return {
    seed: parseFloat(islSeedEl.value) || 1,
    globalScale: parseFloat(islScaleEl.value) || 1,
    playerCount: parseInt(islPlayersEl.value, 10) || 8,
    playerRingRadius: parseFloat(islPlayerRingEl.value) || 40,
    playerIslandRadius: parseFloat(islPlayerRadiusEl.value) || 6,
    playerIslandHeight: parseFloat(islPlayerDepthEl.value) || 3.5,
    hubStyle: islHubStyleEl.value as HubStyle,
    hubRadius: parseFloat(islHubRadiusEl.value) || 10,
    hubIslandCount: parseInt(islHubCountEl.value, 10) || 4,
    hubLobeRadius: parseFloat(islHubLobeEl.value) || 4,
    midIslandCount: parseInt(islMidCountEl.value, 10) || 0,
    midRingRadius: parseFloat(islMidRingEl.value) || 22,
    midIslandRadius: parseFloat(islMidRadiusEl.value) || 3.5,
    midIslandHeight: parseFloat(islMidDepthEl.value) || 2.5,
    mid2IslandCount: parseInt(islMid2CountEl.value, 10) || 0,
    mid2RingRadius: parseFloat(islMid2RingEl.value) || 30,
    mid2IslandRadius: parseFloat(islMid2RadiusEl.value) || 2.5,
    mid2IslandHeight: parseFloat(islMid2DepthEl.value) || 2,
    bridgeIslandsPerSpoke: parseInt(islBridgeCountEl.value, 10) || 0,
    bridgeIslandRadius: parseFloat(islBridgeRadiusEl.value) || 1.5,
    interPlayerCount: parseInt(islInterCountEl.value, 10) || 0,
    interPlayerRadius: parseFloat(islInterRadiusEl.value) || 2,
    interPlayerRingRadius: parseFloat(islInterRingEl.value) || 40,
    shapeNoise: parseFloat(islNoiseEl.value) || 0.25,
    rimSegments: parseInt(islRimSegsEl.value, 10) || 14,
    rings: parseInt(islRingsEl.value, 10) || 3,
    sideRings: parseInt(islSideRingsEl.value, 10) || 3,
    subdivision: parseInt(islSubdivisionEl.value, 10) || 1,
    mirrorSymmetric: islMirrorSymmetricEl.checked,
  };
}

function writeIslandConfigUI(cfg: MapConfig): void {
  islSeedEl.value = String(cfg.seed);
  islScaleEl.value = String(cfg.globalScale);
  islPlayersEl.value = String(cfg.playerCount);
  islPlayerRingEl.value = String(cfg.playerRingRadius);
  islPlayerRadiusEl.value = String(cfg.playerIslandRadius);
  islPlayerDepthEl.value = String(cfg.playerIslandHeight);
  islHubStyleEl.value = cfg.hubStyle;
  islHubRadiusEl.value = String(cfg.hubRadius);
  islHubCountEl.value = String(cfg.hubIslandCount);
  islHubLobeEl.value = String(cfg.hubLobeRadius);
  islMidCountEl.value = String(cfg.midIslandCount);
  islMidRingEl.value = String(cfg.midRingRadius);
  islMidRadiusEl.value = String(cfg.midIslandRadius);
  islMidDepthEl.value = String(cfg.midIslandHeight);
  islMid2CountEl.value = String(cfg.mid2IslandCount);
  islMid2RingEl.value = String(cfg.mid2RingRadius);
  islMid2RadiusEl.value = String(cfg.mid2IslandRadius);
  islMid2DepthEl.value = String(cfg.mid2IslandHeight);
  islBridgeCountEl.value = String(cfg.bridgeIslandsPerSpoke);
  islBridgeRadiusEl.value = String(cfg.bridgeIslandRadius);
  islInterCountEl.value = String(cfg.interPlayerCount);
  islInterRadiusEl.value = String(cfg.interPlayerRadius);
  islInterRingEl.value = String(cfg.interPlayerRingRadius);
  islNoiseEl.value = String(cfg.shapeNoise);
  islRimSegsEl.value = String(cfg.rimSegments);
  islRingsEl.value = String(cfg.rings);
  islSideRingsEl.value = String(cfg.sideRings);
  islSubdivisionEl.value = String(cfg.subdivision);
  islMirrorSymmetricEl.checked = cfg.mirrorSymmetric;
}

function rebuildPlane(): void {
  models.clearPlaced();
  terrain.build(mapW, mapL, density);
  terrain.setVoidY(parseFloat(voidYEl.value));
  water.build(mapW, mapL, parseFloat(waterYEl.value), waterOnEl.checked);
  selection.clear();
  selection.rebuildHelpers();
  updateSelCount();
  history.clear();
}

function generateIslandMap(): void {
  models.clearPlaced();
  islandMap.config = readIslandConfig();
  islandMap.generate();
  viewModeCtl.reapply();
  islandSelection.clear();
  islandSelection.rebuildHelpers();
  water.dispose();
  terrain.dispose();
  selection.disposeHelpers();
  updateSelCount();
  history.clear();
}

function readEditorState(): EditorState {
  return {
    tool,
    moveAxis: moveAxisEl.value as 'x' | 'y' | 'z',
    moveStep: parseFloat(moveStepEl.value) || 1,
    hExact: parseFloat(hExactEl.value) || 0,
    currentModelIndex: models.currentDefIndex,
    currentTextureIndex: currentTexIdx,
    modelYOffset: parseFloat(mYEl.value) || 0,
    modelScale: parseFloat(mScaleEl.value) || 1,
    modelRotation: parseFloat(mRotationEl.value) || 0,
    mirrorEnabled: mirrorEnabled,
    attachLight: attachLightEl.checked,
    lightColor: lightColorEl.value,
    lightIntensity: parseFloat(lightIntensityEl.value) || 0,
    lightRange: parseFloat(lightRangeEl.value) || 0,
    lightY: parseFloat(lightYEl.value) || 0,
    brushRadius: parseFloat(brushRadiusEl.value) || 3,
    brushDensity: parseFloat(brushDensityEl.value) || 0.5,
    brushScaleMin: parseFloat(brushScaleMinEl.value) || 0.8,
    brushScaleMax: parseFloat(brushScaleMaxEl.value) || 1.2,
    brushSpacing: parseFloat(brushSpacingEl.value) || 1,
    viewMode: viewModeCtl.mode,
  };
}

function applyEditorState(s: EditorState): void {
  setActiveTool(s.tool);
  moveAxisEl.value = s.moveAxis;
  moveStepEl.value = String(s.moveStep);
  hExactEl.value = String(s.hExact);
  if (models.defs[s.currentModelIndex]) models.setCurrent(s.currentModelIndex);
  setActiveTexture(s.currentTextureIndex);
  mYEl.value = String(s.modelYOffset);
  mScaleEl.value = String(s.modelScale);
  if (s.modelRotation !== undefined) mRotationEl.value = String(s.modelRotation);
  if (s.mirrorEnabled !== undefined) setMirrorEnabled(s.mirrorEnabled);
  attachLightEl.checked = s.attachLight;
  lightColorEl.value = s.lightColor;
  lightIntensityEl.value = String(s.lightIntensity);
  lightRangeEl.value = String(s.lightRange);
  lightYEl.value = String(s.lightY);
  brushRadiusEl.value = String(s.brushRadius);
  brushDensityEl.value = String(s.brushDensity);
  brushScaleMinEl.value = String(s.brushScaleMin);
  brushScaleMaxEl.value = String(s.brushScaleMax);
  brushSpacingEl.value = String(s.brushSpacing);
  setActiveView(s.viewMode);
}

function setMapType(t: MapType, regenerate = true): void {
  mapType = t;
  document.querySelectorAll<HTMLButtonElement>('.maptype-btn').forEach(b => {
    b.classList.toggle('active', b.dataset['maptype'] === t);
  });
  byId('planeSection').hidden = (t !== 'plane');
  byId('islandSection').hidden = (t !== 'island');
  byId('viewModeSection').hidden = (t !== 'island');
  byId('mirrorSection').hidden = (t !== 'island');
  if (t === 'plane') {
    islandMap.clear();
    islandSelection.disposeHelpers();
    if (regenerate) rebuildPlane();
  } else {
    selection.disposeHelpers();
    terrain.dispose();
    water.dispose();
    if (regenerate) generateIslandMap();
  }
}

document.querySelectorAll<HTMLButtonElement>('.maptype-btn').forEach(b => {
  b.onclick = (): void => setMapType(b.dataset['maptype'] as MapType);
});

let tool: ToolName = 'select';

setupToolButtons(byId('panel'), byId('toolHint'), t => {
  tool = t;
  controls.enabled = (t === 'orbit');
  if (t !== 'brush') brushCursor.hide();
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

document.querySelectorAll<HTMLButtonElement>('.view-btn').forEach(b => {
  b.onclick = (): void => {
    document.querySelectorAll('.view-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    viewModeCtl.apply(b.dataset['view'] as ViewMode);
  };
});

function setMoodUI(m: Mood): void {
  currentMood = m;
  document.querySelectorAll<HTMLButtonElement>('.mood-btn').forEach(b => {
    b.classList.toggle('active', b.dataset['mood'] === m);
  });
}

function setActiveTool(t: ToolName): void {
  tool = t;
  controls.enabled = (t === 'orbit');
  if (t !== 'brush') brushCursor.hide();
  if (t !== 'place') previewGhost.hide();
  document.querySelectorAll<HTMLButtonElement>('.tool-btn').forEach(b => {
    b.classList.toggle('active', b.dataset['tool'] === t);
  });
  const hint = byId('toolHint');
  const hints: Record<ToolName, string> = {
    select: 'Drag to box-select. Shift to add.',
    orbit:  'Drag to orbit. Wheel to zoom.',
    place:  'Click ground to drop a model.',
    remove: 'Click a model to remove it.',
    brush:  'Click & drag to scatter models.',
  };
  hint.textContent = hints[t];
}

function setActiveView(v: ViewMode): void {
  viewModeCtl.apply(v);
  document.querySelectorAll<HTMLButtonElement>('.view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset['view'] === v);
  });
}

let currentTexIdx = 0;
function setActiveTexture(idx: number): void {
  currentTexIdx = idx;
  const swatches = document.querySelectorAll<HTMLElement>('#texGrid .tex-swatch');
  swatches.forEach((el, i) => el.classList.toggle('active', i === idx));
}

function updateSelCount(): void {
  const n = mapType === 'plane' ? selection.size() : islandSelection.size();
  byId('selCount').textContent = `(${n} selected)`;
}

function getAxisVec(delta: number): THREE.Vector3 {
  const axis = moveAxisEl.value;
  if (axis === 'x') return new THREE.Vector3(delta, 0, 0);
  if (axis === 'z') return new THREE.Vector3(0, 0, delta);
  return new THREE.Vector3(0, delta, 0);
}

function expandRefsForMirror(
  refs: VertRef[],
  before: THREE.Vector3[],
  after: THREE.Vector3[],
): { refs: VertRef[]; before: THREE.Vector3[]; after: THREE.Vector3[] } {
  if (!mirrorEnabled) return { refs, before, after };
  const outRefs: VertRef[] = [];
  const outBefore: THREE.Vector3[] = [];
  const outAfter: THREE.Vector3[] = [];
  for (let k = 0; k < refs.length; k++) {
    outRefs.push(refs[k]);
    outBefore.push(before[k]);
    outAfter.push(after[k]);
    const sibs = siblingsOf(islandMap, refs[k].islandId);
    for (const sib of sibs) {
      const pos = sib.mesh.geometry.attributes['position'] as THREE.BufferAttribute;
      const i = refs[k].vertIndex;
      if (i >= pos.count) continue;
      const curSib = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      const deltaLocal = after[k].clone().sub(before[k]);
      outRefs.push({ islandId: sib.id, vertIndex: i });
      outBefore.push(curSib.clone());
      outAfter.push(curSib.clone().add(deltaLocal));
    }
  }
  return { refs: outRefs, before: outBefore, after: outAfter };
}

function runMove(delta: number): void {
  if (mapType === 'plane') {
    if (moveAxisEl.value === 'y') {
      runPlaneHeightOp(selection.computeDelta(delta));
    } else {
      toast('Plane mode only supports Y editing');
    }
  } else {
    const vec = getAxisVec(delta);
    const r = islandSelection.computeTranslate(vec);
    if (!r) return;
    const expanded = expandRefsForMirror(r.refs, r.before, r.after);
    const cmd = new VertexMoveCommand(islandMap, expanded.refs, expanded.before, expanded.after, () => islandSelection.sync());
    history.execute(cmd);
    updateSelCount();
  }
}

function runPlaneHeightOp(result: { indices: number[]; newHeights: number[] } | null): void {
  if (!result || result.indices.length === 0) return;
  const cmd = new HeightEditCommand(terrain, result.indices, result.newHeights, () => selection.sync());
  history.execute(cmd);
  updateSelCount();
}

byId('hUp').onclick    = (): void => runMove(parseFloat(moveStepEl.value) || 1);
byId('hDown').onclick  = (): void => runMove(-(parseFloat(moveStepEl.value) || 1));
byId('hUpS').onclick   = (): void => runMove(0.1);
byId('hDownS').onclick = (): void => runMove(-0.1);

byId('hApply').onclick = (): void => {
  if (mapType === 'plane') {
    runPlaneHeightOp(selection.computeSet(parseFloat(hExactEl.value) || 0));
  } else {
    const refs = islandSelection.refs();
    if (refs.length === 0) return;
    const before: THREE.Vector3[] = [];
    const after: THREE.Vector3[] = [];
    const targetY = parseFloat(hExactEl.value) || 0;
    for (const ref of refs) {
      const isl = islandMap.findById(ref.islandId);
      if (!isl) continue;
      const pos = isl.mesh.geometry.attributes['position'] as THREE.BufferAttribute;
      const i = ref.vertIndex;
      const cur = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      before.push(cur.clone());
      after.push(new THREE.Vector3(cur.x, targetY - isl.mesh.position.y, cur.z));
    }
    const expanded = expandRefsForMirror(refs, before, after);
    const cmd = new VertexMoveCommand(islandMap, expanded.refs, expanded.before, expanded.after, () => islandSelection.sync());
    history.execute(cmd);
    updateSelCount();
  }
};

byId('hFlat').onclick = (): void => {
  if (mapType === 'plane') {
    runPlaneHeightOp(selection.computeFlatten());
  } else {
    const refs = islandSelection.refs();
    if (refs.length === 0) return;
    let avg = 0;
    const localYs: number[] = [];
    for (const ref of refs) {
      const isl = islandMap.findById(ref.islandId);
      if (!isl) continue;
      const pos = isl.mesh.geometry.attributes['position'] as THREE.BufferAttribute;
      const y = pos.getY(ref.vertIndex);
      localYs.push(y);
      avg += y;
    }
    avg /= localYs.length;
    avg = Math.round(avg * 10) / 10;
    const before: THREE.Vector3[] = [];
    const after: THREE.Vector3[] = [];
    let k = 0;
    for (const ref of refs) {
      const isl = islandMap.findById(ref.islandId);
      if (!isl) continue;
      const pos = isl.mesh.geometry.attributes['position'] as THREE.BufferAttribute;
      const i = ref.vertIndex;
      const cur = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      before.push(cur.clone());
      after.push(new THREE.Vector3(cur.x, avg, cur.z));
      k++;
    }
    const expanded = expandRefsForMirror(refs, before, after);
    const cmd = new VertexMoveCommand(islandMap, expanded.refs, expanded.before, expanded.after, () => islandSelection.sync());
    history.execute(cmd);
    updateSelCount();
  }
};

byId('selAll').onclick = (): void => {
  if (mapType === 'plane') {
    selection.toggleAll();
    selection.sync();
  } else {
    islandSelection.toggleAll();
    islandSelection.sync();
  }
  updateSelCount();
};

buildTextureGrid(byId('texGrid'), idx => {
  currentTexIdx = idx;
  if (mapType !== 'plane') {
    toast('Texture paint only works on plane maps');
    return;
  }
  if (selection.isEmpty()) return;
  const cmd = new PaintCommand(terrain, selection.indices(), idx);
  history.execute(cmd);
});

models.onChange = (): void => {
  buildModelGrid(byId('modelGrid'), models);
  previewGhost.dispose();
};
buildModelGrid(byId('modelGrid'), models);

byId('uploadGlbBtn').onclick = (): void => inputById('glbFile').click();
inputById('glbFile').addEventListener('change', async e => {
  const target = e.target as HTMLInputElement;
  if (!target.files?.length) return;
  const n = await models.addGLBFiles(target.files);
  target.value = '';
  toast(`Loaded ${n} model(s)`);
});

function nudgeRotation(deltaDeg: number): void {
  const cur = parseFloat(mRotationEl.value) || 0;
  const next = ((cur + deltaDeg) % 360 + 360) % 360;
  mRotationEl.value = String(Math.round(next * 10) / 10);
}
byId('rotLeft').onclick = (): void => nudgeRotation(-15);
byId('rotRight').onclick = (): void => nudgeRotation(15);
byId('rotRandom').onclick = (): void => { mRotationEl.value = String(Math.round(Math.random() * 360)); };
byId('rotReset').onclick = (): void => { mRotationEl.value = '0'; };

function readLightConfig(): AttachedLight {
  return {
    color: new THREE.Color(lightColorEl.value).getHex(),
    intensity: parseFloat(lightIntensityEl.value) || 0,
    range: parseFloat(lightRangeEl.value) || 0,
    offset: [0, parseFloat(lightYEl.value) || 0, 0],
  };
}

waterYEl.addEventListener('input', () => water.setY(parseFloat(waterYEl.value) || 0));
voidYEl.addEventListener('input',  () => { if (mapType === 'plane') terrain.setVoidY(parseFloat(voidYEl.value)); });
waterOnEl.addEventListener('change', () => water.setVisible(waterOnEl.checked));
byId<HTMLInputElement>('mirrorEnabled').addEventListener('change', e => {
  mirrorEnabled = (e.target as HTMLInputElement).checked;
});

byId('rebuild').onclick = (): void => { readMapInputs(); rebuildPlane(); };
byId('islGenerate').onclick = (): void => generateIslandMap();

byId('saveBtn').onclick = (): void => {
  const editorState = readEditorState();
  if (mapType === 'plane') {
    const data = buildSaveData({
      mapW, mapL, density, terrain, models,
      waterY:  parseFloat(waterYEl.value),
      voidY:   parseFloat(voidYEl.value),
      waterOn: waterOnEl.checked,
      mood:    currentMood,
      editorState,
    });
    downloadJSON(data);
  } else {
    const data = buildIslandSaveData({ islandMap, models, mood: currentMood, editorState });
    downloadJSON(data);
  }
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
    const detected = detectMapType(raw);
    if (detected === 'island') {
      setMapType('island', false);
      await applyIslandLoadedData(raw, {
        scene,
        islandMap,
        models,
        lighting,
        setMoodUI,
        setConfigUI: writeIslandConfigUI,
        rebuildSelection: () => {
          islandSelection.clear();
          islandSelection.rebuildHelpers();
        },
        applyEditorState,
      });
    } else {
      setMapType('plane', false);
      await applyLoadedData(raw, {
        scene,
        rebuildMap: rebuildPlane,
        terrain,
        water,
        models,
        lighting,
        setWaterY:  v => { waterYEl.value = String(v); },
        setVoidY:   v => { voidYEl.value = String(v); },
        setWaterOn: v => { waterOnEl.checked = v; },
        setMapInputs: writeMapInputs,
        setMoodUI,
        applyEditorState,
      });
    }
    history.clear();
    updateSelCount();
    toast('Map loaded');
  } catch (err) {
    console.error(err);
    toast('Load failed');
  }
});

undoBtn.onclick = (): void => history.undo();
redoBtn.onclick = (): void => history.redo();

window.addEventListener('keydown', (e: KeyboardEvent) => {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
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

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let dragStart: { x: number; y: number } | null = null;
let dragging = false;
let shiftHeld = false;

let brushing = false;
let brushStroke: THREE.Object3D[] = [];
let lastBrushPoint: THREE.Vector3 | null = null;

function getPointerPos(e: PointerEvent): { px: number; py: number } {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  return { px: e.clientX - r.left, py: e.clientY - r.top };
}

function getGroundTargets(): THREE.Object3D[] {
  if (mapType === 'plane') {
    return terrain.mesh ? [terrain.mesh] : [];
  }
  return islandMap.allMeshes();
}

function rayGround(): THREE.Vector3 | null {
  const targets = getGroundTargets();
  if (targets.length === 0) return null;
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(targets, false)[0];
  return hit ? hit.point.clone() : null;
}

function readBrushOptions(): {
  radius: number;
  density: number;
  scaleMin: number;
  scaleMax: number;
  spacingMultiplier: number;
} {
  return {
    radius: parseFloat(brushRadiusEl.value) || 3,
    density: parseFloat(brushDensityEl.value) || 0.5,
    scaleMin: parseFloat(brushScaleMinEl.value) || 1,
    scaleMax: parseFloat(brushScaleMaxEl.value) || 1,
    spacingMultiplier: parseFloat(brushSpacingEl.value) || 1,
  };
}

function brushSourceIslandAt(point: THREE.Vector3): IslandInstance | undefined {
  if (mapType !== 'island') return undefined;
  let best: IslandInstance | undefined;
  let bestDist = Infinity;
  for (const isl of islandMap.islands) {
    const dx = isl.mesh.position.x - point.x;
    const dz = isl.mesh.position.z - point.z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) { bestDist = d; best = isl; }
  }
  return best;
}

function doStamp(point: THREE.Vector3): void {
  const b = readBrushOptions();
  const opts = {
    radius: b.radius,
    density: b.density,
    yOffset: parseFloat(mYEl.value) || 0,
    scaleMin: b.scaleMin,
    scaleMax: b.scaleMax,
    attachLight: attachLightEl.checked,
    lightCfg: attachLightEl.checked ? readLightConfig() : undefined,
    spacingMultiplier: b.spacingMultiplier,
  };
  const created = stamp(point, models.currentDefIndex, opts, models, getGroundTargets());
  for (const obj of created) {
    scene.add(obj);
    models.placed.add(obj);
    brushStroke.push(obj);
  }
  if (mirrorEnabled && mapType === 'island') {
    const source = brushSourceIslandAt(point);
    if (source) {
      const sibs = siblingsOf(islandMap, source.id);
      for (const sib of sibs) {
        const offset = angularOffsetTo(source, sib);
        const mirroredCenter = rotateAroundY(point, offset);
        const mc = stamp(mirroredCenter, models.currentDefIndex, opts, models, getGroundTargets());
        for (const obj of mc) {
          obj.rotation.y += offset;
          scene.add(obj);
          models.placed.add(obj);
          brushStroke.push(obj);
        }
      }
    }
  }
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
    if (mapType === 'plane' || !mirrorEnabled) {
      const point = rayGround();
      if (!point) return;
      const rotDeg = parseFloat(mRotationEl.value) || 0;
      const m = models.build(
        models.currentDefIndex,
        point,
        parseFloat(mYEl.value) || 0,
        parseFloat(mScaleEl.value) || 1,
        attachLightEl.checked,
        rotDeg * Math.PI / 180,
      );
      if (m) {
        if (attachLightEl.checked && !m.userData['attachedLight']) {
          attachLight(m, readLightConfig());
        }
        history.execute(new PlaceModelCommand(models, m));
      }
    } else {
      raycaster.setFromCamera(mouse, camera);
      const targets = getGroundTargets();
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length === 0) return;
      const hit = hits[0];
      const point = hit.point.clone();
      const sourceIsland = hit.object as THREE.Mesh;
      const rotDeg = parseFloat(mRotationEl.value) || 0;
      const yOff = parseFloat(mYEl.value) || 0;
      const sc = parseFloat(mScaleEl.value) || 1;
      const baseRot = rotDeg * Math.PI / 180;
      const islandId = sourceIsland.userData['islandId'] as string | undefined;
      const sourceInst = islandId ? islandMap.findById(islandId) : undefined;
      const sibs = sourceInst ? siblingsOf(islandMap, sourceInst.id) : [];

      const placed: THREE.Object3D[] = [];
      const mirrorGroupId = `mg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const m = models.build(models.currentDefIndex, point, yOff, sc, attachLightEl.checked, baseRot);
      if (!m) return;
      if (attachLightEl.checked && !m.userData['attachedLight']) attachLight(m, readLightConfig());
      m.userData['mirrorGroup'] = mirrorGroupId;
      placed.push(m);

      if (sourceInst) {
        for (const sib of sibs) {
          const offset = angularOffsetTo(sourceInst, sib);
          const rotated = rotateAroundY(point, offset);
          const sm = models.build(models.currentDefIndex, rotated, yOff, sc, attachLightEl.checked, baseRot + offset);
          if (!sm) continue;
          if (attachLightEl.checked && !sm.userData['attachedLight']) attachLight(sm, readLightConfig());
          sm.userData['mirrorGroup'] = mirrorGroupId;
          placed.push(sm);
        }
      }

      history.execute(new BrushStrokeCommand(models, placed));
    }
  } else if (tool === 'remove') {
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(Array.from(models.placed), true);
    if (hits.length) {
      const root = models.findPlacedRoot(hits[0].object);
      if (!root) return;
      const groupId = root.userData['mirrorGroup'] as string | undefined;
      if (groupId && mirrorEnabled) {
        const peers: THREE.Object3D[] = [];
        models.placed.forEach(m => {
          if (m.userData['mirrorGroup'] === groupId) peers.push(m);
        });
        history.execute(new RemoveMultipleCommand(models, peers));
      } else {
        history.execute(new RemoveModelCommand(models, root));
      }
    }
  } else if (tool === 'brush') {
    const point = rayGround();
    if (!point) return;
    brushing = true;
    brushStroke = [];
    lastBrushPoint = point.clone();
    doStamp(point);
  }
});

renderer.domElement.addEventListener('pointermove', (e: PointerEvent) => {
  const p = getPointerPos(e);

  if (tool === 'brush') {
    const point = rayGround();
    if (point) {
      brushCursor.update(point, parseFloat(brushRadiusEl.value) || 3);
      if (brushing && lastBrushPoint) {
        const r = parseFloat(brushRadiusEl.value) || 3;
        const dx = point.x - lastBrushPoint.x;
        const dz = point.z - lastBrushPoint.z;
        if (dx * dx + dz * dz > (r * 0.5) * (r * 0.5)) {
          doStamp(point);
          lastBrushPoint.copy(point);
        }
      }
    } else {
      brushCursor.hide();
    }
    previewGhost.hide();
    return;
  }
  brushCursor.hide();

  if (tool === 'place') {
    const point = rayGround();
    const def = models.defs[models.currentDefIndex];
    if (point && def) {
      previewGhost.show(
        def,
        point,
        parseFloat(mYEl.value) || 0,
        parseFloat(mScaleEl.value) || 1,
        (parseFloat(mRotationEl.value) || 0) * Math.PI / 180,
      );
    } else {
      previewGhost.hide();
    }
  } else {
    previewGhost.hide();
  }

  if (!dragging || tool !== 'select' || !dragStart) return;
  const x = Math.min(dragStart.x, p.px);
  const y = Math.min(dragStart.y, p.py);
  const w = Math.abs(p.px - dragStart.x);
  const h = Math.abs(p.py - dragStart.y);
  Object.assign(selBox.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
});

renderer.domElement.addEventListener('pointerleave', () => {
  brushCursor.hide();
  previewGhost.hide();
});

renderer.domElement.addEventListener('pointerup', (e: PointerEvent) => {
  if (brushing) {
    brushing = false;
    lastBrushPoint = null;
    if (brushStroke.length > 0) {
      const objs = brushStroke;
      brushStroke = [];
      for (const o of objs) {
        scene.remove(o);
        models.placed.delete(o);
      }
      history.execute(new BrushStrokeCommand(models, objs));
    }
    return;
  }

  if (!dragging || !dragStart) return;
  dragging = false;
  selBox.style.display = 'none';
  const p = getPointerPos(e);
  const x0 = Math.min(dragStart.x, p.px), x1 = Math.max(dragStart.x, p.px);
  const y0 = Math.min(dragStart.y, p.py), y1 = Math.max(dragStart.y, p.py);
  if (mapType === 'plane') {
    selection.pickInRect(x0, y0, x1, y1, shiftHeld);
    selection.sync();
  } else {
    islandSelection.pickInRect(x0, y0, x1, y1, shiftHeld);
    islandSelection.sync();
  }
  updateSelCount();
});

setMapType('plane');

function tick(): void {
  controls.update();
  const nSel = mapType === 'plane' ? selection.size() : islandSelection.size();
  if (mapType === 'plane') {
    hud.textContent =
      `Plane · ${terrain.cols}×${terrain.rows} verts · ${models.placed.size} models · ${nSel} selected · ${currentMood}`;
  } else {
    hud.textContent =
      `Islands · ${islandMap.islands.length} islands · ${models.placed.size} models · ${nSel} selected · ${currentMood}`;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
