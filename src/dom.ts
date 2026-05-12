/** Get an element by id, throwing a clear error if it's missing. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element #${id}`);
  return el as T;
}

/** Convenience for typed <input> lookup. */
export function inputById(id: string): HTMLInputElement {
  return byId<HTMLInputElement>(id);
}
