import { ancestors, byId, descendantIds, hierarchy, isDescendant } from './tree';
import { LIMITS, clamp, docTransform, newLayer, uid, type BlendMode, type Doc, type ID, type Layer, type Rect } from './types';
import { Raster, createSurface, type Surface } from './surface';
import { integral, intersectRect, invert, placement, setMat, transformBounds, translation, unionRect, type Mat } from './geometry';
import type { Project } from './project';

export interface StructHost {
  readonly current: Project | null;
  readonly projects: readonly Project[];
  readonly busy: boolean;
  settle(): void;
  emit(what: 'active' | 'options' | 'overlay'): void;
  edit(label: string, fn: (p: Project) => boolean | void): void;
  focus(p: Project, id: ID | null): void;
  notice(message: string): void;
  room(bytes: number, what: string): boolean;
  switchTo(projectId: string): void;
  clipCoverage(doc: Doc, baseId: ID): CanvasImageSource | null;
  renderOnly(doc: Doc, target: Surface, view: Mat, only: Set<ID>): void;
  deleteMask(): void;
}

const NAME_MAX = 200;

function cleanName(raw: string | undefined, fallback: string): string {
  const t = (raw ?? '').trim().slice(0, NAME_MAX);
  return t || fallback;
}

function freeName(layers: readonly Layer[], prefix: string): string {
  const used = new Set(layers.map((l) => l.name));
  let n = 1;
  while (used.has(`${prefix} ${n}`)) n++;
  return `${prefix} ${n}`;
}

function subtree(layers: readonly Layer[], id: ID): Set<ID> {
  return new Set<ID>([id, ...descendantIds(layers, id)]);
}

function isPixelBase(l: Layer): boolean {
  return !l.isGroup && !l.adjustment;
}

function renewLinks(link: Map<ID, ID>, l: Layer): ID | undefined {
  if (!l.link) return undefined;
  let fresh = link.get(l.link);
  if (!fresh) {
    fresh = uid();
    link.set(l.link, fresh);
  }
  return fresh;
}

function sameStructure(a: readonly Layer[], b: readonly Layer[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((l, i) => l.id === b[i].id && l.parentId === b[i].parentId && l.clipId === b[i].clipId);
}

export function selectLayer(host: StructHost, id: ID, how: 'replace' | 'toggle' | 'range' = 'replace'): void {
  const p = host.current;
  if (!p || host.busy || !p.layer(id)) return;
  host.settle();
  if (how === 'toggle') {
    const sel = new Set(p.selectedIds);
    if (sel.has(id) && sel.size > 1) {
      sel.delete(id);
      if (p.activeId === id) p.activeId = [...sel].pop() ?? null;
    } else {
      sel.add(id);
      p.activeId = id;
    }
    p.selectedIds = sel;
  } else if (how === 'range') {
    const act = p.activeLayer;
    if (act) {
      const rows = hierarchy(p.doc, true, p.collapsed).map((r) => r.layer.id);
      const a = rows.indexOf(act.id);
      const b = rows.indexOf(id);
      if (a >= 0 && b >= 0) {
        const span = rows.slice(Math.min(a, b), Math.max(a, b) + 1);
        p.selectedIds = new Set([...span, id]);
      }
    }
    p.activeId = id;
  } else {
    p.selectedIds = new Set([id]);
    p.activeId = id;
  }
  p.maskTarget = false;
  host.emit('active');
  host.emit('options');
  host.emit('overlay');
}

export function selectedRoots(p: Project): ID[] {
  const map = byId(p.doc);
  return p.doc.layers
    .filter((l) => p.selectedIds.has(l.id) && !ancestors(map, l).some((a) => p.selectedIds.has(a.id)))
    .map((l) => l.id);
}

export function normalizeClips(layers: Layer[]): Layer[] {
  const lastFree = new Map<ID | null, Layer>();
  return layers.map((l) => {
    const cand = lastFree.get(l.parentId);
    const validBase = cand && isPixelBase(cand) ? cand.id : null;
    let out = l;
    if (l.clipId && l.clipId !== validBase) out = { ...l, clipId: null };
    else out = { ...l };
    if (!out.clipId) lastFree.set(l.parentId, out);
    return out;
  });
}

export function cloneLayer(l: Layer, patch: Partial<Layer> = {}): Layer {
  return {
    ...l,
    raster: l.raster ? l.raster.clone() : null,
    mask: l.mask ? { ...l.mask, raster: l.mask.raster ? l.mask.raster.clone() : null } : null,
    ...patch,
    id: uid(),
  };
}

export function addLayer(
  host: StructHost,
  opts: { name?: string; blend?: BlendMode; opacity?: number; clip?: boolean } = {},
): void {
  host.edit('New Layer', (p) => {
    const layers = p.doc.layers;
    const act = p.activeLayer;
    const patch: Record<string, unknown> = { parentId: null };
    let pos = layers.length;
    if (act) {
      const i = layers.findIndex((l) => l.id === act.id);
      if (act.isGroup) {
        patch.parentId = act.id;
        pos = i;
        p.collapsed.delete(act.id);
      } else {
        patch.parentId = act.parentId;
        pos = i + 1;
        if (opts.clip) patch.clipId = act.clipId ?? act.id;
      }
    }
    if (opts.blend !== undefined) patch.blend = opts.blend;
    if (opts.opacity !== undefined) patch.opacity = clamp(opts.opacity, 0, 1);
    const layer = newLayer(cleanName(opts.name, freeName(layers, 'Layer')), p.doc, patch as Partial<Layer>);
    p.setLayers([...layers.slice(0, pos), layer, ...layers.slice(pos)]);
    host.focus(p, layer.id);
  });
}

export function addFolder(host: StructHost, name?: string): void {
  host.edit('New Folder', (p) => {
    const layers = p.doc.layers;
    const act = p.activeLayer;
    const pos = act ? layers.findIndex((l) => l.id === act.id) + 1 : layers.length;
    const folder = newLayer(cleanName(name, freeName(layers, 'Folder')), p.doc, {
      isGroup: true,
      parentId: act ? act.parentId : null,
    });
    p.setLayers([...layers.slice(0, pos), folder, ...layers.slice(pos)]);
    host.focus(p, folder.id);
  });
}

export function duplicateLayers(host: StructHost, name?: string): void {
  const cur = host.current;
  if (!cur) return;
  let bytes = 0;
  for (const id of cur.selectedIds) {
    const r = cur.layer(id)?.raster;
    if (r) bytes += r.width * r.height * 4;
  }
  if (!host.room(bytes, 'Duplicating')) return;
  host.edit('Duplicate Layer', (p) => {
    const roots = selectedRoots(p);
    if (!roots.length) return false;
    const layers = p.doc.layers;
    const links = new Map<ID, ID>();
    const copiesAfter = new Map<ID, Layer[]>();
    let lastRoot: Layer | null = null;
    for (const rootId of roots) {
      const set = subtree(layers, rootId);
      const originals = layers.filter((l) => set.has(l.id));
      const copies = originals.map((l) => cloneLayer(l));
      const remap = new Map<ID, ID>();
      originals.forEach((l, i) => remap.set(l.id, copies[i].id));
      const fixed = copies.map((c, i) => {
        const o = originals[i];
        const out: Layer = {
          ...c,
          parentId: o.parentId && remap.has(o.parentId) ? remap.get(o.parentId)! : o.parentId,
          clipId: o.clipId && remap.has(o.clipId) ? remap.get(o.clipId)! : o.clipId,
        };
        if (o.link) out.link = renewLinks(links, o);
        if (o.id === rootId) {
          out.name = cleanName(roots.length === 1 ? name : undefined, `${o.name} copy`).slice(0, NAME_MAX);
          lastRoot = out;
        }
        return out;
      });
      copiesAfter.set(rootId, fixed);
    }
    const next: Layer[] = [];
    for (const l of layers) {
      next.push(l);
      const extra = copiesAfter.get(l.id);
      if (extra) next.push(...extra);
    }
    p.setLayers(normalizeClips(next));
    if (lastRoot) host.focus(p, (lastRoot as Layer).id);
  });
}

export function liveMaskDependents(host: StructHost): ID[] {
  const p = host.current;
  if (!p) return [];
  const act = p.activeLayer;
  if (p.maskTarget && act && act.mask && p.selectedIds.size <= 1) return [];
  const removed = new Set<ID>();
  for (const id of selectedRoots(p)) for (const x of subtree(p.doc.layers, id)) removed.add(x);
  return p.doc.layers.filter((l) => !removed.has(l.id) && l.clipId && removed.has(l.clipId)).map((l) => l.id);
}

export function deleteLayers(host: StructHost, bake = false): void {
  const cur = host.current;
  if (!cur) return;
  const act = cur.activeLayer;
  if (cur.maskTarget && act && act.mask && cur.selectedIds.size <= 1) {
    host.deleteMask();
    return;
  }
  host.edit('Delete Layer', (p) => {
    const layers = p.doc.layers;
    const picked = selectedRoots(p);
    const roots = picked.filter((id) => ![...subtree(layers, id)].some((x) => layers.find((l) => l.id === x)?.locks?.all));
    if (roots.length < picked.length) {
      const n = picked.length - roots.length;
      host.notice(roots.length
        ? `${n === 1 ? 'A locked layer was' : `${n} locked layers were`} kept: unlock ${n === 1 ? 'it' : 'them'} in the Layers panel to delete.`
        : picked.length === 1 ? 'The layer is locked. Unlock it in the Layers panel to delete it.' : 'The layers are locked. Unlock them in the Layers panel to delete them.');
    }
    if (!roots.length) return false;
    const order = hierarchy(p.doc, true).map((r) => r.layer.id);
    const first = Math.min(...roots.map((id) => order.indexOf(id)).filter((i) => i >= 0));
    const removed = new Set<ID>();
    for (const id of roots) for (const x of subtree(layers, id)) removed.add(x);
    const survivors = layers
      .filter((l) => !removed.has(l.id))
      .map((l): Layer => {
        if (!l.clipId || !removed.has(l.clipId)) return l;
        const out: Layer = { ...l, clipId: null };
        if (bake && l.raster && isPixelBase(l)) {
          const coverage = host.clipCoverage(p.doc, l.clipId);
          const r = l.raster.clone();
          const ctx = r.ctx;
          ctx.save();
          if (coverage) {
            setMat(ctx, invert(placement(l.transform, r.width, r.height)));
            ctx.globalCompositeOperation = 'destination-in';
            ctx.drawImage(coverage, 0, 0);
          } else {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, r.width, r.height);
          }
          ctx.restore();
          r.touch();
          out.raster = r;
        }
        return out;
      });
    p.setLayers(normalizeClips(survivors));
    const rest = hierarchy(p.doc, true);
    if (!rest.length) host.focus(p, null);
    else host.focus(p, rest[clamp(Number.isFinite(first) ? first : rest.length - 1, 0, rest.length - 1)].layer.id);
  });
}

export function moveLayers(
  host: StructHost,
  ids: ID[],
  targetId: ID,
  where: 'above' | 'below' | 'inside',
  duplicate = false,
): void {
  host.edit(duplicate ? 'Duplicate Layers' : 'Move Layers', (p) => {
    const layers = p.doc.layers;
    const map = byId(p.doc);
    const target = map.get(targetId);
    if (!target) return false;
    if (where === 'inside' && !target.isGroup) return false;
    const want = new Set(ids);
    const moving = layers.filter((l) => want.has(l.id) && !ancestors(map, l).some((a) => want.has(a.id)));
    if (!moving.length || moving.some((m) => m.id === targetId)) return false;
    const dest = where === 'inside' ? target.id : target.parentId;
    if (dest !== null && moving.some((m) => m.id === dest || isDescendant(map, dest, m.id))) return false;

    const slot = (arr: readonly Layer[]): number => {
      const i = arr.findIndex((l) => l.id === targetId);
      if (where === 'above') return i + 1;
      if (where === 'inside') return i;
      const sub = subtree(arr, targetId);
      return arr.findIndex((l) => sub.has(l.id));
    };

    if (duplicate) {
      const links = new Map<ID, ID>();
      const copies = moving
        .filter((m) => !m.isGroup)
        .map((m) => {
          const c = cloneLayer(m, { name: `${m.name} copy`.slice(0, NAME_MAX), parentId: dest });
          if (m.link) c.link = renewLinks(links, m);
          return c;
        });
      if (!copies.length) return false;
      const pos = slot(layers);
      if (where === 'inside') p.collapsed.delete(target.id);
      p.setLayers(normalizeClips([...layers.slice(0, pos), ...copies, ...layers.slice(pos)]));
      host.focus(p, copies[copies.length - 1].id);
      return;
    }

    const heads = new Set(moving.map((m) => m.id));
    const block = new Set<ID>();
    for (const m of moving) for (const x of subtree(layers, m.id)) block.add(x);
    const moved = layers.filter((l) => block.has(l.id)).map((l) => (heads.has(l.id) ? { ...l, parentId: dest } : l));
    const rest = layers.filter((l) => !block.has(l.id));
    const pos = slot(rest);
    const next = normalizeClips([...rest.slice(0, pos), ...moved, ...rest.slice(pos)]);
    if (sameStructure(layers, next)) return false;
    if (where === 'inside') p.collapsed.delete(target.id);
    p.setLayers(next);
  });
}

export function moveActive(host: StructHost, by: 1 | -1): void {
  host.edit('Reorder Layers', (p) => {
    const act = p.activeLayer;
    if (!act) return false;
    const layers = p.doc.layers;
    const i = layers.findIndex((l) => l.id === act.id);
    let j = i + by;
    while (j >= 0 && j < layers.length && layers[j].parentId !== act.parentId) j += by;
    if (j < 0 || j >= layers.length) return false;
    const lo = layers[Math.min(i, j)];
    const hi = layers[Math.max(i, j)];
    const loSet = subtree(layers, lo.id);
    const hiSet = subtree(layers, hi.id);
    const start = layers.findIndex((l) => loSet.has(l.id));
    const end = layers.findIndex((l) => l.id === hi.id);
    const seg = layers.slice(start, end + 1);
    const next = [
      ...layers.slice(0, start),
      ...seg.filter((l) => hiSet.has(l.id)),
      ...seg.filter((l) => loSet.has(l.id)),
      ...layers.slice(end + 1),
    ];
    p.setLayers(normalizeClips(next));
  });
}

export function groupLayers(host: StructHost, name?: string): void {
  host.edit('Group Layers', (p) => {
    const rootIds = selectedRoots(p);
    if (!rootIds.length) return false;
    const layers = p.doc.layers;
    const map = byId(p.doc);
    const roots = rootIds.map((id) => map.get(id)!);
    const chains = roots.map((r) => ancestors(map, r).map((a) => a.id));
    const common = chains[0].find((id) => chains.every((c) => c.includes(id))) ?? null;
    let top = -1;
    for (const r of roots) {
      let cur: Layer = r;
      while (cur.parentId !== common) cur = map.get(cur.parentId!)!;
      top = Math.max(top, layers.findIndex((l) => l.id === cur.id));
    }
    const folder = newLayer(cleanName(name, freeName(layers, 'Folder')), p.doc, { isGroup: true, parentId: common });
    const set = new Set(rootIds);
    const re = layers.map((l) => (set.has(l.id) ? { ...l, parentId: folder.id } : l));
    const next = [...re.slice(0, top + 1), folder, ...re.slice(top + 1)];
    p.setLayers(normalizeClips(next));
    host.focus(p, folder.id);
  });
}

export function moveOutOfFolder(host: StructHost): void {
  host.edit('Move Out of Folder', (p) => {
    const act = p.activeLayer;
    if (!act || !act.parentId) return false;
    const layers = p.doc.layers;
    const parent = layers.find((l) => l.id === act.parentId);
    if (!parent) return false;
    const block = subtree(layers, act.id);
    const moved = layers.filter((l) => block.has(l.id)).map((l) => (l.id === act.id ? { ...l, parentId: parent.parentId } : l));
    const rest = layers.filter((l) => !block.has(l.id));
    const pos = rest.findIndex((l) => l.id === parent.id) + 1;
    p.setLayers(normalizeClips([...rest.slice(0, pos), ...moved, ...rest.slice(pos)]));
  });
}

export function copyLayerToProject(host: StructHost, id: ID, targetProjectId: string): boolean {
  const source = host.projects.find((pr) => pr.layer(id));
  const target = host.projects.find((pr) => pr.id === targetProjectId);
  if (!source || !target || source === target || host.busy) return false;
  host.settle();
  const set = subtree(source.doc.layers, id);
  const included = source.doc.layers.filter((l) => set.has(l.id));
  const pixels = (ls: readonly Layer[]): number => ls.reduce((s, l) => s + (l.raster ? l.raster.width * l.raster.height : 0), 0);
  if (pixels(target.doc.layers) + pixels(included) > LIMITS.pixels) {
    host.notice(`The copied layers exceed this project's ${Math.round(LIMITS.pixels / 1_000_000)}-megapixel limit.`);
    return false;
  }
  const ids = new Map<ID, ID>(included.map((l) => [l.id, uid()]));
  const head = source.layer(id)!;
  const dx = target.doc.width / 2 - (head.transform.x + head.transform.w / 2);
  const dy = target.doc.height / 2 - (head.transform.y + head.transform.h / 2);
  const copies = included.map((l) => {
    const c = cloneLayer(l, {
      parentId: l.parentId && ids.has(l.parentId) ? ids.get(l.parentId)! : null,
      clipId: l.clipId && ids.has(l.clipId) ? ids.get(l.clipId)! : null,
      transform: { ...l.transform, x: l.transform.x + dx, y: l.transform.y + dy },
    });
    if (c.mask && c.mask.placement) {
      c.mask = { ...c.mask, placement: { ...c.mask.placement, x: c.mask.placement.x + dx, y: c.mask.placement.y + dy } };
    }
    return { ...c, id: ids.get(l.id)! };
  });
  host.switchTo(target.id);
  host.edit('Copy Layers from Project', (p) => {
    p.setLayers([...p.doc.layers, ...copies]);
    host.focus(p, ids.get(id)!);
  });
  return true;
}

export function toggleClip(host: StructHost, id?: ID): void {
  host.edit('Clipping Mask', (p) => {
    const layer = id ? p.layer(id) : p.activeLayer;
    if (!layer || layer.isGroup) return false;
    const layers = p.doc.layers;
    if (layer.clipId) {
      p.setLayers(normalizeClips(layers.map((l) => (l.id === layer.id ? { ...l, clipId: null } : l))));
      return;
    }
    let base: Layer | undefined;
    for (let i = layers.findIndex((l) => l.id === layer.id) - 1; i >= 0; i--) {
      const c = layers[i];
      if (c.parentId === layer.parentId && !c.clipId) {
        base = c;
        break;
      }
    }
    if (!base || !isPixelBase(base)) {
      host.notice('A clipping mask needs a pixel layer directly below.');
      return false;
    }
    const baseId = base.id;
    p.setLayers(layers.map((l) => (l.id === layer.id ? { ...l, clipId: baseId } : l)));
  });
}

export function mergeLayers(host: StructHost): void {
  const p0 = host.current;
  if (!p0) return;
  const act = p0.activeLayer;
  if (!act) return;
  const layers0 = p0.doc.layers;
  let label: string;
  let merged: Set<ID>;
  let removed: Set<ID>;
  let anchorId: ID;
  if (p0.selectedIds.size > 1) {
    label = 'Merge Layers';
    merged = new Set();
    let top = -1;
    for (const id of selectedRoots(p0)) {
      for (const x of subtree(layers0, id)) merged.add(x);
      top = Math.max(top, layers0.findIndex((l) => l.id === id));
    }
    removed = merged;
    anchorId = layers0[top]?.id ?? act.id;
  } else if (act.isGroup) {
    label = 'Merge Group';
    removed = subtree(layers0, act.id);
    merged = new Set(removed);
    merged.delete(act.id);
    anchorId = act.id;
  } else {
    label = 'Merge Down';
    let below: Layer | undefined;
    for (let i = layers0.findIndex((l) => l.id === act.id) - 1; i >= 0; i--) {
      if (layers0[i].parentId === act.parentId) {
        below = layers0[i];
        break;
      }
    }
    if (!below || below.isGroup) {
      host.notice('Merge Down needs a layer directly below.');
      return;
    }
    merged = new Set([below.id, act.id]);
    removed = merged;
    anchorId = below.id;
  }
  host.edit(label, (p) => {
    const layers = p.doc.layers;
    const anchor = layers.find((l) => l.id === anchorId);
    if (!anchor) return false;
    let bounds: Rect | null = null;
    for (const l of layers) {
      if (merged.has(l.id) && l.raster && !l.isGroup) bounds = unionRect(bounds, transformBounds(l.transform));
    }
    if (!bounds) return false;
    let r = integral(bounds);
    if (r.w > LIMITS.side || r.h > LIMITS.side || r.w * r.h > LIMITS.pixels) {
      r = intersectRect(r, { x: 0, y: 0, w: p.doc.width, h: p.doc.height }) ?? r;
    }
    const surface = createSurface(r.w, r.h);
    host.renderOnly(p.doc, surface, translation(-r.x, -r.y), merged);
    const fresh = newLayer(anchor.name, p.doc, {
      raster: Raster.from(surface, r.w, r.h),
      parentId: anchor.parentId,
      transform: { ...docTransform(r.w, r.h), x: r.x, y: r.y },
    });
    const next: Layer[] = [];
    for (const l of layers) {
      if (l.id === anchor.id) next.push(fresh);
      else if (!removed.has(l.id)) next.push(l);
    }
    p.setLayers(normalizeClips(next));
    host.focus(p, fresh.id);
  });
}
