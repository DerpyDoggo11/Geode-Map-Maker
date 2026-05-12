import { TEX_DEFS } from './textures';
import type { ModelLibrary } from './models';
import type { ToolName } from './types';

export type ToastFn = (msg: string, ms?: number) => void;

export function makeToast(toastEl: HTMLElement): ToastFn {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return function show(msg: string, ms = 1800): void {
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => { toastEl.style.display = 'none'; }, ms);
  };
}

export function buildTextureGrid(rootEl: HTMLElement, onPaint: (i: number) => void): void {
  rootEl.innerHTML = '';
  TEX_DEFS.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = 'tex-swatch' + (i === 0 ? ' active' : '');
    el.style.backgroundImage = `url(${t.dataUrl})`;
    el.title = t.name;
    el.onclick = () => {
      rootEl.querySelectorAll('.tex-swatch').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      onPaint(i);
    };
    rootEl.appendChild(el);
  });
}

export function buildModelGrid(rootEl: HTMLElement, models: ModelLibrary): void {
  rootEl.innerHTML = '';
  models.defs.forEach((m, i) => {
    const b = document.createElement('button');
    b.className = 'model-btn' + (i === models.currentDefIndex ? ' active' : '');
    b.textContent = m.name + (m.source === 'glb' ? ' ◆' : '');
    b.title = m.source === 'glb' ? 'Uploaded GLB' : 'Built-in';
    b.onclick = () => models.setCurrent(i);
    rootEl.appendChild(b);
  });
}

const TOOL_HINTS: Record<ToolName, string> = {
  select: 'Drag to box-select. Shift to add.',
  orbit:  'Drag to orbit. Wheel to zoom.',
  place:  'Click ground to drop a model.',
  remove: 'Click a model to remove it.',
};

export function setupToolButtons(
  panel: HTMLElement,
  hintEl: HTMLElement,
  onChange: (tool: ToolName) => void,
): void {
  panel.querySelectorAll<HTMLButtonElement>('.tool-btn').forEach(b => {
    b.onclick = () => {
      panel.querySelectorAll('.tool-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      const tool = b.dataset['tool'] as ToolName;
      hintEl.textContent = TOOL_HINTS[tool];
      onChange(tool);
    };
  });
}
