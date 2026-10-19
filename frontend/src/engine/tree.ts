import type { Doc, ID, Layer } from './types';

export interface Entry { layer: Layer; depth: number; visible: boolean }

/** Maps each parent id (null for the top level) to its children in list order. */
export function childrenMap(layers: readonly Layer[]): Map<ID | null, Layer[]> {
  const map = new Map<ID | null, Layer[]>();
  for (const layer of layers) {
    const list = map.get(layer.parentId);
    if (list) list.push(layer);
    else map.set(layer.parentId, [layer]);
  }
  return map;
}

/** Depth-first rows of the layer hierarchy; folders in `collapsed` hide their contents. */
export function hierarchy(doc: Doc, topFirst = false, collapsed?: ReadonlySet<ID>): Entry[] {
  const kids = childrenMap(doc.layers);
  const out: Entry[] = [];
  const walk = (parent: ID | null, depth: number, visible: boolean): void => {
    if (depth > 64) return;
    const list = kids.get(parent);
    if (!list) return;
    const ordered = topFirst ? [...list].reverse() : list;
    for (const layer of ordered) {
      const shown = visible && layer.visible;
      out.push({ layer, depth, visible: shown });
      if (layer.isGroup && !collapsed?.has(layer.id)) walk(layer.id, depth + 1, shown);
    }
  };
  walk(null, 0, true);
  return out;
}

export const byId = (doc: Doc): Map<ID, Layer> => new Map(doc.layers.map((l) => [l.id, l] as const));

/** Whether a folder is composited on its own and then blended with its opacity and mode, as against pass-through,
 *  where its layers act on what lies below. Artboards are always pass-through. */
export const groupIsolated = (l: Layer): boolean => l.isGroup && !l.artboard && (l.isolate === true || l.blend !== 'normal' || l.opacity < 1);

/** The layer's enclosing folders, nearest first. */
export function ancestors(map: ReadonlyMap<ID, Layer>, layer: Layer): Layer[] {
  const out: Layer[] = [];
  let pid = layer.parentId;
  for (let i = 0; i < 64 && pid !== null; i++) {
    const parent = map.get(pid);
    if (!parent) break;
    out.push(parent);
    pid = parent.parentId;
  }
  return out;
}

/** Whether the layer exists and sits somewhere inside the folder ancestorId. */
export function isDescendant(map: ReadonlyMap<ID, Layer>, id: ID, ancestorId: ID): boolean {
  const layer = map.get(id);
  return !!layer && ancestors(map, layer).some((a) => a.id === ancestorId);
}

/** Ids of everything inside the folder rootId, depth-first. */
export function descendantIds(layers: readonly Layer[], rootId: ID): ID[] {
  const kids = childrenMap(layers);
  const out: ID[] = [];
  const walk = (id: ID, depth: number): void => {
    if (depth > 64) return;
    for (const child of kids.get(id) ?? []) {
      out.push(child.id);
      if (child.isGroup) walk(child.id, depth + 1);
    }
  };
  walk(rootId, 0);
  return out;
}
