import type { Doc, ID, Layer } from './types';

export interface Entry { layer: Layer; depth: number; visible: boolean }

export function childrenMap(layers: readonly Layer[]): Map<ID | null, Layer[]> {
  const m = new Map<ID | null, Layer[]>();
  for (const l of layers) {
    const list = m.get(l.parentId);
    if (list) list.push(l);
    else m.set(l.parentId, [l]);
  }
  return m;
}

export function hierarchy(doc: Doc, topFirst = false, collapsed?: ReadonlySet<ID>): Entry[] {
  const kids = childrenMap(doc.layers);
  const out: Entry[] = [];
  const visit = (parent: ID | null, depth: number, visible: boolean): void => {
    if (depth > 64) return;
    const siblings = kids.get(parent) ?? [];
    const list = topFirst ? [...siblings].reverse() : siblings;
    for (const layer of list) {
      const v = visible && layer.visible;
      out.push({ layer, depth, visible: v });
      if (layer.isGroup && !collapsed?.has(layer.id)) visit(layer.id, depth + 1, v);
    }
  };
  visit(null, 0, true);
  return out;
}

export const byId = (doc: Doc): Map<ID, Layer> => new Map(doc.layers.map((l) => [l.id, l]));

export function ancestors(map: ReadonlyMap<ID, Layer>, layer: Layer): Layer[] {
  const out: Layer[] = [];
  let parent = layer.parentId;
  for (let guard = 0; parent && guard < 64; guard++) {
    const g = map.get(parent);
    if (!g) break;
    out.push(g);
    parent = g.parentId;
  }
  return out;
}

export function isDescendant(map: ReadonlyMap<ID, Layer>, id: ID, ancestorId: ID): boolean {
  const layer = map.get(id);
  return !!layer && ancestors(map, layer).some((a) => a.id === ancestorId);
}

export function descendantIds(layers: readonly Layer[], rootId: ID): ID[] {
  const kids = childrenMap(layers);
  const out: ID[] = [];
  const visit = (id: ID, depth: number): void => {
    if (depth > 64) return;
    for (const c of kids.get(id) ?? []) { out.push(c.id); if (c.isGroup) visit(c.id, depth + 1); }
  };
  visit(rootId, 0);
  return out;
}
