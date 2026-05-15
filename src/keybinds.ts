export interface Keybind {
  key: string;
  mods?: { ctrl?: boolean; meta?: boolean; shift?: boolean };
  description: string;
  category: string;
  action: () => void;
}

export class KeybindRegistry {
  private binds: Keybind[] = [];

  register(b: Keybind): void {
    this.binds.push(b);
  }

  registerMany(bs: Keybind[]): void {
    for (const b of bs) this.register(b);
  }

  list(): Keybind[] {
    return this.binds;
  }

  handle(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      return false;
    }
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    for (const b of this.binds) {
      if (b.key.toLowerCase() !== key.toLowerCase()) continue;
      const want = b.mods ?? {};
      const wantCtrl = !!want.ctrl;
      const wantMeta = !!want.meta;
      const wantShift = !!want.shift;
      const hasCtrlMeta = e.ctrlKey || e.metaKey;
      if ((wantCtrl || wantMeta) !== hasCtrlMeta) continue;
      if (wantShift !== e.shiftKey) continue;
      e.preventDefault();
      b.action();
      return true;
    }
    return false;
  }
}

export function formatKeybind(b: Keybind): string {
  const parts: string[] = [];
  if (b.mods?.ctrl || b.mods?.meta) parts.push('Ctrl/⌘');
  if (b.mods?.shift) parts.push('Shift');
  const key = b.key === ' ' ? 'Space' : b.key.length === 1 ? b.key.toUpperCase() : b.key;
  parts.push(key);
  return parts.join(' + ');
}

export function renderKeybindOverlay(registry: KeybindRegistry, container: HTMLElement): void {
  const categories = new Map<string, Keybind[]>();
  for (const b of registry.list()) {
    if (!categories.has(b.category)) categories.set(b.category, []);
    categories.get(b.category)!.push(b);
  }

  let html = '<div class="kb-grid">';
  for (const [cat, items] of categories) {
    html += `<div class="kb-cat">${escapeHTML(cat)}</div>`;
    for (const b of items) {
      html += `<div class="kb-row"><kbd>${escapeHTML(formatKeybind(b))}</kbd><span>${escapeHTML(b.description)}</span></div>`;
    }
  }
  html += '</div>';
  container.innerHTML = html;
}

function escapeHTML(s: string): string {
  return s.replace(/[&<>"]/g, c =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );
}
