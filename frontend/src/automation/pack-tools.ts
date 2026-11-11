import { Raster, type Engine } from '../engine';
import type { McpResult } from './agent-bridge';
import { FILM_STOCKS, curvePoints, filmStock, pointsText, type CurvePoint } from '../engine/film-stocks';
import { withAiLabel, SOURCE, type AiLabel } from '../io/ai-label';
import { GLB_LIMITS, GLB_VIEW, cleanView, glbKeep, glbRestore, glbWith, loadModel, placedGlb, renderModel, type GlbKept, type GlbView, type PlacedGlb } from '../io/glb-scene';

/** The bundled plugins' MCP tools (U2): EU AI label, Film pack and 3D object layers. The window half of ailabel_add,
 *  ailabel_remove, ailabel_info, film_looks, film_apply_look, film_add_point, film_copy_points, film_paste_points,
 *  glb_place, glb_edit and glb_info; each change is one undoable step. */
export const PACK_TOOLS = new Set(['ailabel_add', 'ailabel_remove', 'ailabel_info', 'film_looks', 'film_apply_look', 'film_add_point', 'film_copy_points', 'film_paste_points', 'glb_place', 'glb_edit', 'glb_info']);

const text = (t: string, data?: Record<string, unknown>): McpResult => ({ content: [{ type: 'text', text: t }], ...(data ? { structuredContent: data } : {}) });
const fail = (t: string): McpResult => ({ content: [{ type: 'text', text: t }], isError: true });

export const BADGE_NAME = 'EU AI label';
export const BADGE_ANCHORS = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'] as const;
export const BADGE_STYLES = ['dark', 'light', 'outline'] as const;
export interface BadgeOptions { kind: AiLabel; anchor: (typeof BADGE_ANCHORS)[number]; style: (typeof BADGE_STYLES)[number]; size: number; opacity: number; text?: string }
export const BADGE_DEFAULTS: BadgeOptions = { kind: 'generated', anchor: 'bottom-right', style: 'dark', size: 6, opacity: 1 };

/** The visible badge as a raster: a square "AI" mark and the words, in a rounded plate. */
export function drawBadge(docW: number, docH: number, o: BadgeOptions): { raster: Raster; x: number; y: number } {
  const bh = Math.max(16, Math.round(Math.min(docW, docH) * o.size / 100)), fs = Math.round(bh * 0.4), pad = Math.round(bh * 0.28), gap = Math.round(bh * 0.22), icon = bh - pad * 2;
  const words = (o.text ?? (o.kind === 'edited' ? 'Edited with AI' : 'Made with AI')).slice(0, 40), font = (px: number): string => `600 ${px}px system-ui, "Segoe UI", Arial, sans-serif`;
  const probe = new Raster(8, 8);
  probe.ctx.font = font(fs);
  const tw = Math.ceil(probe.ctx.measureText(words).width), bw = pad + icon + gap + tw + pad;
  const r = new Raster(bw, bh), c = r.ctx, dark = o.style !== 'light';
  const plate = o.style === 'dark' ? 'rgba(17,17,17,0.88)' : o.style === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.35)', ink = dark ? '#ffffff' : '#111111', radius = Math.round(bh * 0.22);
  c.beginPath(); c.roundRect(0.5, 0.5, bw - 1, bh - 1, radius);
  c.fillStyle = plate; c.fill();
  c.lineWidth = Math.max(1, Math.round(bh * 0.04)); c.strokeStyle = o.style === 'outline' ? '#ffffff' : dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'; c.stroke();
  c.beginPath(); c.roundRect(pad, pad, icon, icon, Math.round(icon * 0.2));
  c.fillStyle = ink; c.fill();
  c.fillStyle = dark ? '#111111' : '#ffffff'; c.font = font(Math.round(icon * 0.52)); c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('AI', pad + icon / 2, pad + icon / 2 + Math.round(icon * 0.03));
  c.fillStyle = ink; c.font = font(fs); c.textAlign = 'left';
  c.fillText(words, pad + icon + gap, bh / 2 + Math.round(fs * 0.04));
  r.touch();
  const m = Math.round(bh * 0.5), a = o.anchor, left = a.includes('left'), right = a.includes('right'), top = a.startsWith('top'), bottom = a.startsWith('bottom');
  return { raster: r, x: left ? m : right ? docW - bw - m : Math.round((docW - bw) / 2), y: top ? m : bottom ? docH - bh - m : Math.round((docH - bh) / 2) };
}

/** `blob` with the document's AI label written into it, when it has one (PNG, JPEG and WebP). */
export async function labelExport(e: Engine, blob: Blob, type: string): Promise<Blob> {
  const kind = e.current?.doc.meta?.aiLabel;
  return kind ? withAiLabel(blob, type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png', kind) : blob;
}

/** Adds (or replaces) the document's AI label: the metadata, and by default the visible badge layer. One step. */
export function addAiLabel(e: Engine, o: BadgeOptions, badge: boolean): string | null {
  const p = e.current;
  if (!p) return null;
  let id: string | null = null;
  e.edit('Add AI Label', (q) => {
    const old = q.doc.layers.filter((l) => l.name === BADGE_NAME).map((l) => l.id);
    if (old.length) q.setLayers(q.doc.layers.filter((l) => !old.includes(l.id)));
    e.setMeta({ aiLabel: o.kind });
    if (badge) {
      const b = drawBadge(q.doc.width, q.doc.height, o);
      e.insertRasterLayer(b.raster, BADGE_NAME, b.x, b.y, { opacity: o.opacity }, 'Add AI Label');
      id = e.activeLayer?.id ?? null;
    }
  });
  return id ?? '';
}

export function removeAiLabel(e: Engine): { badges: number; had: boolean } | null {
  const p = e.current;
  if (!p) return null;
  const gone = p.doc.layers.filter((l) => l.name === BADGE_NAME).map((l) => l.id), had = !!p.doc.meta?.aiLabel;
  if (!gone.length && !had) return { badges: 0, had: false };
  e.edit('Remove AI Label', (q) => {
    if (gone.length) q.setLayers(q.doc.layers.filter((l) => !gone.includes(l.id)));
    if (had) e.setMeta({ aiLabel: 'none' });
  });
  return { badges: gone.length, had };
}

export function aiLabelInfo(e: Engine): Record<string, unknown> | null {
  const p = e.current;
  if (!p) return null;
  const label = p.doc.meta?.aiLabel ?? null, badges = p.doc.layers.filter((l) => l.name === BADGE_NAME).map((l) => l.id);
  return { label, digital_source_type: label ? `http://cv.iptc.org/newscodes/digitalsourcetype/${SOURCE[label]}` : null, badge_layers: badges, written_in: label ? ['png', 'jpg', 'webp', 'tiff (inside the XMP packet)'] : [], note: label ? 'Every PNG, JPEG, WebP and TIFF export of this document carries the label in its XMP.' : 'This document is not marked as AI content.' };
}

const ITEMS = SOURCE;

/* Film pack ------------------------------------------------------------------------------------------------------ */
let clipboard: CurvePoint[] | null = null;
export const filmClipboard = (): CurvePoint[] | null => clipboard;
export const setFilmClipboard = (pts: CurvePoint[] | null): void => { clipboard = pts ? pts.map(([x, y]) => [x, y] as CurvePoint) : null; };

const filmLayers = (e: Engine) => (e.current?.doc.layers ?? []).filter((l) => l.adjustment?.kind === 'filmLook');
const paramsOf = (l: { adjustment: { data: Record<string, unknown> } | null }): Record<string, unknown> => ((l.adjustment?.data.params ?? {}) as Record<string, unknown>);

function patchFilm(e: Engine, id: string, params: Record<string, unknown>, undoName: string): boolean {
  return e.edit(undoName, (q) => { const x = q.layer(id); if (!x?.adjustment) return false; q.updateLayer(id, { adjustment: { ...x.adjustment, data: { ...x.adjustment.data, params: { ...paramsOf(x), ...params } } } }); return true; });
}

export function filmPointsOf(e: Engine, id: string): CurvePoint[] | null {
  const l = e.current?.layer(id);
  return l?.adjustment?.kind === 'filmLook' ? curvePoints(paramsOf(l).stock, paramsOf(l).points) : null;
}
export function setFilmPoints(e: Engine, id: string, pts: CurvePoint[], undoName: string): boolean {
  const clean = new Map<number, number>();
  for (const [x, y] of pts) clean.set(Math.round(Math.min(255, Math.max(0, x))), Math.round(Math.min(255, Math.max(0, y))));
  const list = [...clean.entries()].sort((a, b) => a[0] - b[0]).slice(0, 16);
  return list.length >= 2 && patchFilm(e, id, { points: pointsText(list) }, undoName);
}

/* Tool dispatcher ------------------------------------------------------------------------------------------------- */
export async function packTool(e: Engine, name: string, a: Record<string, unknown>): Promise<McpResult> {
  const p = e.current;
  if (!p) return fail('No document is open: call new_document or open_file first.');
  const str = (k: string): string => (typeof a[k] === 'string' ? a[k] as string : ''), num = (k: string, d: number): number => (typeof a[k] === 'number' && Number.isFinite(a[k]) ? a[k] as number : d);
  if (name === 'ailabel_add') {
    const kind: AiLabel = str('kind') === 'edited' ? 'edited' : 'generated';
    const anchor = (BADGE_ANCHORS as readonly string[]).includes(str('anchor')) ? str('anchor') as BadgeOptions['anchor'] : BADGE_DEFAULTS.anchor, style = (BADGE_STYLES as readonly string[]).includes(str('style')) ? str('style') as BadgeOptions['style'] : BADGE_DEFAULTS.style;
    const badge = a.badge !== false, o: BadgeOptions = { kind, anchor, style, size: Math.min(30, Math.max(2, num('size', BADGE_DEFAULTS.size))), opacity: Math.min(1, Math.max(0.05, num('opacity', 1))), ...(str('text') ? { text: str('text') } : {}) };
    const id = addAiLabel(e, o, badge);
    if (id === null) return fail('The AI label could not be added: another edit is running. Try again in a moment.');
    return text(`Marked the document as ${kind === 'edited' ? 'edited with' : 'made with'} AI (${ITEMS[kind]}); exports carry it in their XMP${badge ? `, and the visible badge is layer ${id}` : ''}.`, { label: kind, digital_source_type: ITEMS[kind], ...(id ? { id } : {}) });
  }
  if (name === 'ailabel_remove') {
    const r = removeAiLabel(e);
    return r && (r.badges || r.had) ? text(`Removed the AI label${r.badges ? ` and ${r.badges} badge layer${r.badges === 1 ? '' : 's'}` : ''}.`, { removed_badges: r.badges, had_label: r.had }) : text('The document had no AI label.', { removed_badges: 0, had_label: false });
  }
  if (name === 'ailabel_info') { const i = aiLabelInfo(e); return i ? text(JSON.stringify(i), i) : fail('No document is open.'); }

  if (name === 'film_looks') {
    const stocks = FILM_STOCKS.map((s) => ({ id: s.id, name: s.label, kind: s.kind, iso: s.iso, note: s.note, points: s.points }));
    const layers = filmLayers(e).map((l) => ({ id: l.id, name: l.name, stock: filmStock(paramsOf(l).stock).id, strength: paramsOf(l).strength ?? 100, points: filmPointsOf(e, l.id) }));
    return text(`${stocks.length} film looks: ${stocks.map((s) => s.id).join(', ')}. ${layers.length} film layer${layers.length === 1 ? '' : 's'} in the document.`, { looks: stocks, layers, clipboard_points: clipboard });
  }
  if (name === 'film_apply_look') {
    const look = str('look');
    if (look && !FILM_STOCKS.some((s) => s.id === look)) return fail(`No film look has the id ${look}: film_looks lists them.`);
    const params: Record<string, unknown> = {};
    if (look) params.stock = look;
    if (typeof a.strength === 'number') params.strength = a.strength;
    if (typeof a.grain === 'number') params.grain = a.grain;
    if (typeof a.grain_size === 'number') params.grainSize = a.grain_size;
    if (str('id')) {
      const l = p.layer(str('id'));
      if (!l || l.adjustment?.kind !== 'filmLook') return fail(`${str('id')} is not a film layer: film_looks lists them, or leave id out to add a new one.`);
      if (!Object.keys(params).length) return fail('Give a look, strength, grain or grain_size to change.');
      if (look) params.points = '';
      return patchFilm(e, l.id, params, 'Film Look') ? text(`Updated ${l.name}.`, { id: l.id }) : fail('The film layer could not be changed.');
    }
    if (!look) return fail('Give look (a film look id from film_looks).');
    let id: string | null = null;
    e.edit('Film Look', (q) => {
      id = e.addAdjustmentLayer('filmLook');
      const x = id ? q.layer(id) : null;
      if (id && x?.adjustment) q.updateLayer(id, { name: `Film: ${filmStock(look).label}`, adjustment: { ...x.adjustment, data: { ...x.adjustment.data, params: { ...paramsOf(x), ...params } } } });
    });
    return id ? text(`Added a film layer with ${filmStock(look).label} (id ${id}).`, { id }) : fail('The film layer could not be added.');
  }
  if (name === 'film_add_point' || name === 'film_copy_points' || name === 'film_paste_points') {
    const l = p.layer(str('id'));
    if (!l || l.adjustment?.kind !== 'filmLook') return fail(`${str('id') || 'No id'} is not a film layer: call film_looks for the ids of the film layers, or film_apply_look to add one.`);
    const now = filmPointsOf(e, l.id) as CurvePoint[];
    if (name === 'film_copy_points') { setFilmClipboard(now); return text(`Copied ${now.length} curve points from ${l.name}.`, { points: now }); }
    if (name === 'film_add_point') {
      const x = num('x', NaN), y = num('y', NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 255 || y < 0 || y > 255) return fail('Give x and y from 0 to 255 (x the input tone, y the film curve\'s output).');
      const next = now.filter(([px]) => px !== Math.round(x)).concat([[Math.round(x), Math.round(y)]]);
      if (next.length > 16) return fail('A film curve holds at most 16 points: paste a shorter set or add the point at an x that is already there to move it.');
      if (!setFilmPoints(e, l.id, next, 'Add Film Curve Point')) return fail('The point could not be added.');
      const out = filmPointsOf(e, l.id);
      return text(`The curve of ${l.name} now has ${out?.length} points.`, { points: out });
    }
    if (!clipboard) return fail('No curve points are copied: call film_copy_points on a film layer first.');
    const merged = str('mode') === 'merge' ? (() => { const m = new Map<number, number>(now); for (const [x, y] of clipboard as CurvePoint[]) m.set(x, y); return [...m.entries()] as CurvePoint[]; })() : clipboard;
    if (!setFilmPoints(e, l.id, merged, 'Paste Film Curve Points')) return fail('The points could not be pasted.');
    const out = filmPointsOf(e, l.id);
    return text(`Pasted the points onto ${l.name}; its curve has ${out?.length} points.`, { points: out });
  }

  if (name === 'glb_place' || name === 'glb_edit' || name === 'glb_info') return await glbTool(e, name, a);
  return fail(`${name} is not a tool of this build.`);
}

/* 3D object layers ------------------------------------------------------------------------------------------------ */
const patchOf = (a: Record<string, unknown>): Partial<Record<keyof GlbView, unknown>> => ({
  turn: a.turn, tilt: a.tilt, roll: a.roll, size: a.size, x: a.x, y: a.y, z: a.z, fov: a.fov, lightDir: a.light_direction, lightHeight: a.light_height,
  strength: a.light_strength, ambient: a.ambient, room: a.room_light, shadow: a.shadow, color: a.light_color,
});
const bytesOf = (data: string): ArrayBuffer => { const u = Uint8Array.from(atob(data), (c) => c.charCodeAt(0)); return u.buffer; };
const viewJson = (v: GlbView): Record<string, unknown> => ({ turn: v.turn, tilt: v.tilt, roll: v.roll, size: v.size, x: v.x, y: v.y, z: v.z, fov: v.fov, light_direction: v.lightDir, light_height: v.lightHeight, light_strength: v.strength, ambient: v.ambient, room_light: v.room, shadow: v.shadow, light_color: v.color });

/** The posed model of a 3D layer: from this session, else read back from the bytes the document kept. */
async function placedOf(p: NonNullable<Engine['current']>, id: string): Promise<PlacedGlb | undefined> {
  const have = placedGlb.get(id);
  if (have) return have;
  const k = p.doc.glb?.[id];
  if (!k || !p.layer(id)) return undefined;
  const g = await glbRestore(k as GlbKept);
  placedGlb.set(id, g);
  return g;
}

async function glbTool(e: Engine, name: string, a: Record<string, unknown>): Promise<McpResult> {
  const p = e.current as NonNullable<Engine['current']>, str = (k: string): string => (typeof a[k] === 'string' ? a[k] as string : '');
  const back = (): boolean => { if (e.current !== p && e.projects.includes(p)) e.switchTo(p.id); return e.current === p; }, gone = (): string => `${p.name} was closed or could not be brought forward while the model was drawn`;
  try {
    if (name === 'glb_info') {
      if (str('id')) {
        const g = await placedOf(p, str('id'));
        if (!g || !p.layer(str('id'))) return fail(`${str('id')} is not a 3D layer placed from a model. Give path to the model file instead, or glb_place it again.`);
        return text(`${g.name}: ${g.info.meshes} meshes, ${g.info.triangles} triangles. Pose ${JSON.stringify(viewJson(g.view))}`, { name: g.name, info: g.info, view: viewJson(g.view), ...(g.depthId ? { depth_layer: g.depthId } : {}) });
      }
      if (!str('data')) return fail('Give path (an absolute path to a .glb or .gltf file) or the id of a 3D layer from glb_place.');
      const m = await loadModel(bytesOf(str('data')));
      return text(`${m.info.meshes} meshes, ${m.info.triangles} triangles, ${m.info.materials} materials, ${m.info.textures} textures, ${m.info.animations} animations.`, { info: m.info });
    }
    const W = p.doc.width, H = p.doc.height;
    if (name === 'glb_place') {
      if (!str('data')) return fail('Give path (an absolute path to a .glb or .gltf file) or data (base64).');
      const bytes = bytesOf(str('data')), model = await loadModel(bytes), view = cleanView(GLB_VIEW, patchOf(a)), label = str('name') || 'Model';
      const canvas = await renderModel(model, view, W, H), r = new Raster(W, H);
      r.ctx.drawImage(canvas, 0, 0, W, H); r.touch();
      if (!back()) return fail(`${gone()}; nothing was placed.`);
      let id = '', depthId = '';
      e.edit('Place 3D Model', (pp) => {
        e.insertRasterLayer(r, `3D: ${label}`, 0, 0, {}, 'Place 3D Model');
        id = e.activeLayer?.id ?? '';
        if (id) pp.doc = glbWith(pp.doc, id, glbKeep({ bytes, name: label, view }));
      });
      if (a.depth === true) {
        const dc = await renderModel(model, view, W, H, 'depth'), d = new Raster(W, H);
        d.ctx.drawImage(dc, 0, 0, W, H); d.touch();
        if (!back()) return fail(`${gone()}; the model is layer ${id || 'not placed'}, without its depth map.`);
        e.insertRasterLayer(d, 'Depth Map', 0, 0, {}, 'Place 3D Depth');
        depthId = e.activeLayer?.id ?? '';
        if (id) e.selectLayer(id);
      }
      if (!id) return fail('The 3D layer could not be placed: another edit is running. Try again in a moment.');
      placedGlb.set(id, { bytes, name: label, view, info: model.info, ...(depthId ? { depthId } : {}) });
      return text(`Placed ${label} as layer ${id} (${model.info.triangles} triangles)${depthId ? `; its depth map is layer ${depthId}` : ''}. glb_edit poses it again while this window stays open.`, { id, ...(depthId ? { depth_layer: depthId } : {}), info: model.info, view: viewJson(view) });
    }
    const id = str('id'), g = await placedOf(p, id), l = p.layer(id);
    if (!g || !l) return fail(`${id || 'No id'} is not a 3D layer placed from a model (glb_place makes one; the document keeps the model and its pose).`);
    const keys = Object.keys(patchOf(a)).filter((k) => patchOf(a)[k as keyof GlbView] !== undefined);
    if (!keys.length && a.depth !== true) return fail(`Give at least one of ${Object.keys(GLB_LIMITS).join(', ')}, light_color or depth. Ranges: ${Object.entries(GLB_LIMITS).map(([k, v]) => `${k} ${v[0]} to ${v[1]}`).join('; ')}.`);
    const view = cleanView(g.view, patchOf(a)), model = await loadModel(g.bytes.slice(0)), canvas = await renderModel(model, view, W, H);
    const img = new Raster(W, H);
    img.ctx.drawImage(canvas, 0, 0, W, H);
    const data = img.ctx.getImageData(0, 0, W, H);
    if (!back()) return fail(`${gone()}; it was not re-posed.`);
    let ok = false;
    e.edit('Edit 3D Model', (pp) => {
      ok = e.replaceLayerPixels(id, data, 'Edit 3D Model');
      if (ok) pp.doc = glbWith(pp.doc, id, glbKeep({ bytes: g.bytes, name: g.name, view }));
    });
    if (!ok) return fail('The 3D layer could not be re-posed: it must still be a pixel layer of the document\'s size.');
    g.view = view;
    if (a.depth === true) {
      const dc = await renderModel(model, view, W, H, 'depth'), d = new Raster(W, H);
      d.ctx.drawImage(dc, 0, 0, W, H); d.touch();
      if (!back()) return fail(`${gone()}; it was re-posed, without its depth map.`);
      if (g.depthId && p.layer(g.depthId)) e.replaceLayerPixels(g.depthId, d.ctx.getImageData(0, 0, W, H), 'Edit 3D Depth');
      else { e.insertRasterLayer(d, 'Depth Map', 0, 0, {}, 'Place 3D Depth'); g.depthId = e.activeLayer?.id ?? ''; e.selectLayer(id); }
    }
    return text(`Re-posed ${l.name}.`, { id, view: viewJson(view), ...(g.depthId ? { depth_layer: g.depthId } : {}) });
  } catch (err) {
    return fail(`The 3D model could not be read or drawn${err instanceof Error && err.message ? `: ${err.message}` : ''}. Check that it is a valid .glb (or a .gltf with no outside files).`);
  }
}
