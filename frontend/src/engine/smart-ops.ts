// Smart filters (DEV_PLAN 36.13): the Engine's smart filter stack and filter mask methods, moved out of index.ts. Each
// takes a SmartHost, the few Engine members they use, so this file never imports the Engine class.
import { invert, mul, placement, setMat, translation } from './geometry';
import type { Project } from './project';
import { Raster } from './surface';
import { uid, type ID, type SmartFilter, type SmartObject, type SmartOriginal } from './types';

/** What the smart filter methods need of the Engine. */
export interface SmartHost {
  current: Project | null;
  notice(message: string, kind?: 'info' | 'error'): void;
  /** Re-renders smart object `id` in `p` from a new source, a new filter stack, or both, as one undo step. */
  restackSoon(p: Project, id: ID, source: Raster | null, filters: SmartFilter[] | null, name: string, maskChange?: { filterMask: Raster | null; filterMaskEnabled: boolean } | null, extra?: Partial<SmartObject> | null): boolean;
  smartFiltersShown(id: ID): SmartFilter[] | null;
}

export function smartContents(host: SmartHost): { name: string; raster: Raster; original: SmartOriginal | null } | null {
  const l = host.current?.activeLayer;
  return l?.smart ? { name: l.name, raster: l.smart.source, original: l.smart.original ?? null } : null;
}

export function addSmartFilter(host: SmartHost, kind: string, settings: Record<string, unknown>): void {
  const l = host.current?.activeLayer;
  if (l?.smart) setSmartFilters(host, l.id, [...(host.smartFiltersShown(l.id) ?? l.smart.filters), { id: uid(), kind, settings: structuredClone(settings), enabled: true }], 'Smart Filter');
}

export function setSmartFilters(host: SmartHost, id: ID, filters: SmartFilter[], name = 'Smart Filters'): void { const p = host.current; if (p) host.restackSoon(p, id, null, filters, name); }

export function smartFiltersOff(host: SmartHost): boolean { const f = host.current?.activeLayer?.smart?.filters; return !!f?.length && f.every((x) => !x.enabled); }
export function toggleSmartFilters(host: SmartHost): void {
  const l = host.current?.activeLayer;
  if (!l?.smart?.filters.length) return;
  const on = smartFiltersOff(host);
  setSmartFilters(host, l.id, (host.smartFiltersShown(l.id) ?? l.smart.filters).map((f) => ({ ...f, enabled: on })), on ? 'Enable Smart Filters' : 'Disable Smart Filters');
}
export function clearSmartFilters(host: SmartHost): void {
  const l = host.current?.activeLayer;
  if (l?.smart?.filters.length) setSmartFilters(host, l.id, [], 'Clear Smart Filters');
}

export function addSmartFilterMask(host: SmartHost): void {
  const p = host.current, l = p?.activeLayer, sm = l?.smart;
  if (!p || !l || !sm || !l.raster) { host.notice('Select a smart object first.'); return; }
  if (sm.filterMask) return;
  const src = sm.source, mask = new Raster(src.width, src.height), sel = p.selection;
  if (sel && !sm.warp) {
    const m = (l.raster.width - src.width) / 2;
    setMat(mask.ctx, mul(translation(-m, -m), mul(invert(placement(l.transform, l.raster.width, l.raster.height)), translation(sel.x, sel.y))));
    mask.ctx.drawImage(sel.surface(), 0, 0);
    mask.ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else { mask.ctx.fillStyle = '#ffffff'; mask.ctx.fillRect(0, 0, src.width, src.height); }
  host.restackSoon(p, l.id, null, null, 'Add Smart Filter Mask', { filterMask: mask, filterMaskEnabled: true });
}

export function deleteSmartFilterMask(host: SmartHost): void {
  const p = host.current, l = p?.activeLayer;
  if (p && l?.smart?.filterMask) host.restackSoon(p, l.id, null, null, 'Delete Smart Filter Mask', { filterMask: null, filterMaskEnabled: true });
}

export function toggleSmartFilterMask(host: SmartHost): void {
  const p = host.current, l = p?.activeLayer, sm = l?.smart;
  if (p && l && sm?.filterMask) host.restackSoon(p, l.id, null, null, sm.filterMaskEnabled === false ? 'Enable Smart Filter Mask' : 'Disable Smart Filter Mask', { filterMask: sm.filterMask, filterMaskEnabled: sm.filterMaskEnabled === false });
}
