import { BLEND_MODES } from '../../engine';
import { clamp, type Engine, type Pt } from '../../engine';
import { allBrushPresets, identityOption, pressureOption, type SymmetryMode } from '../../engine/brush-dynamics';
import { digitOf, type OptionSpec, type Tool } from '../registry';
import { holdEnd, holdMove, holdStart, quickShapeOption, quickShapeSnapped } from './quick-shape';
import { cursorState, drawBrushCursor } from './brush-common';

let hoverPt: Pt | null = null;

const CURVES: Record<string, number[] | null> = { linear: null, soft: [0, 0.35, 0.6, 0.8, 1], firm: [0, 0.1, 0.3, 0.6, 1], s: [0, 0.1, 0.5, 0.9, 1] };
const symKey = (e: Engine): string => (e.brushSymmetry.mode === 'radial' ? 'r' + e.brushSymmetry.count : e.brushSymmetry.mode);
const curveKey = (e: Engine): string => Object.keys(CURVES).find((k) => JSON.stringify(CURVES[k]) === JSON.stringify(e.pressureCurve)) ?? 'linear';

/** Symmetry and pressure curve choices, shared by the Brush, Pencil and Eraser. */
export function symmetryOptions(e: Engine): OptionSpec[] {
  return [
    { kind: 'select', label: 'Symmetry', priority: 35, choices: [['off', 'Off'], ['vertical', 'Vertical'], ['horizontal', 'Horizontal'], ['both', 'Both axes'], ['r3', 'Radial 3'], ['r4', 'Radial 4'], ['r6', 'Radial 6'], ['r8', 'Radial 8']].map(([id, label]) => ({ id, label })), get: () => symKey(e), set: (v: string) => { e.brushSymmetry = v.startsWith('r') ? { ...e.brushSymmetry, mode: 'radial', count: Number(v.slice(1)) } : { ...e.brushSymmetry, mode: v as SymmetryMode }; e.emit('options', null); } },
    { kind: 'range', label: 'Symmetry X', priority: 11, min: 0, max: 100, unit: '%', when: () => e.brushSymmetry.mode !== 'off', get: () => Math.round(e.symmetryAt.x * 100), set: (v: number) => { e.symmetryAt = { ...e.symmetryAt, x: Math.max(0, Math.min(100, Math.round(v))) / 100 }; e.emit('options', null); } },
    { kind: 'range', label: 'Symmetry Y', priority: 11, min: 0, max: 100, unit: '%', when: () => e.brushSymmetry.mode !== 'off', get: () => Math.round(e.symmetryAt.y * 100), set: (v: number) => { e.symmetryAt = { ...e.symmetryAt, y: Math.max(0, Math.min(100, Math.round(v))) / 100 }; e.emit('options', null); } },
    { kind: 'select', label: 'Pressure curve', priority: 12, choices: [['linear', 'Linear'], ['soft', 'Soft'], ['firm', 'Firm'], ['s', 'S curve']].map(([id, label]) => ({ id, label })), get: () => curveKey(e), set: (v: string) => { e.pressureCurve = CURVES[v] ?? null; e.emit('options', null); } },
  ];
}

/** Build-up: with the Airbrush on, paint keeps landing where the pointer rests, one dab every `interval` ms (Brush Settings sets both too). */
export const airbrushState = { on: false, interval: 60 };
let airTimer = 0, smoothing = 0, steady: { x: number; y: number } | null = null, last: import('../registry').ToolPointer | null = null;
let origin: Pt | null = null, lastDigit: { d: number; at: number; shift: boolean } | null = null;
let smoothMode: 'trail' | 'string' = 'trail', catchUp = true, zoomAdjust = false, smoothRaw: Pt | null = null;

/** The steadied point for the pointer at `pd`. Trail: it covers a share of the gap each move. Pulled String: it moves
 *  only when the pointer is further than the string, which is the Smoothing value in pixels (screen pixels with
 *  Adjust for Zoom). Shared by the Brush and the Pencil. */
export function smoothTo(pd: Pt, zoom: number): Pt {
  smoothRaw = pd;
  if (!steady || smoothing <= 0) return pd;
  if (smoothMode === 'trail') {
    const k = 1 - Math.min(0.95, smoothing / 100);
    steady = { x: steady.x + (pd.x - steady.x) * k, y: steady.y + (pd.y - steady.y) * k };
  } else {
    const len = (smoothing * 0.5) / (zoomAdjust ? Math.max(zoom, 0.01) : 1), dx = pd.x - steady.x, dy = pd.y - steady.y, d = Math.hypot(dx, dy);
    if (d > len) steady = { x: steady.x + (dx * (d - len)) / d, y: steady.y + (dy * (d - len)) / d };
  }
  return steady;
}
export function smoothStart(pt: Pt): void { steady = { ...pt }; smoothRaw = null; }
/** Ends a smoothed stroke: the point to finish at when Catch-up on Stroke End is on and the line lagged, else null. */
export function smoothFinish(): Pt | null {
  const f = steady && smoothing > 0 && catchUp ? smoothRaw : null;
  steady = null; smoothRaw = null;
  return f;
}

/** The Brush Settings shape as options, so the tip's roundness, spacing, jitters and scattering can be set by command. */
function shapeOptions(e: Engine): OptionSpec[] {
  const put = (patch: Partial<Engine['brushShape']>): void => { e.brushShape = { ...e.brushShape, ...patch }; e.brushPresetId = null; e.emit('options', null); };
  const slide = (label: string, min: number, max: number, unit: string, get: () => number, set: (v: number) => void): OptionSpec => ({ kind: 'range', label, priority: 8, min, max, unit, get, set: (v: number) => set(Math.max(min, Math.min(max, Math.round(v)))) });
  return [
    slide('Roundness', 1, 100, '%', () => e.brushShape.roundness, (v) => put({ roundness: v })),
    slide('Spacing', 0, 1000, '%', () => e.brushShape.spacing ?? 0, (v) => put({ spacing: v > 0 ? v : null })),
    { kind: 'toggle', label: 'Flip X', priority: 8, get: () => !!e.brushShape.flipX, set: (v) => put({ flipX: v }) },
    { kind: 'toggle', label: 'Flip Y', priority: 8, get: () => !!e.brushShape.flipY, set: (v) => put({ flipY: v }) },
    slide('Size jitter', 0, 100, '%', () => e.brushShape.sizeJitter, (v) => put({ sizeJitter: v })),
    slide('Angle jitter', 0, 100, '%', () => e.brushShape.angleJitter, (v) => put({ angleJitter: v })),
    slide('Scatter', 0, 1000, '%', () => e.brushShape.scatter, (v) => put({ scatter: v })),
    slide('Count', 1, 16, '', () => e.brushShape.count, (v) => put({ count: v })),
    { kind: 'toggle', label: 'Noise', priority: 8, get: () => !!e.brushShape.noise, set: (v) => put({ noise: v }) },
    { kind: 'toggle', label: 'Wet edges', priority: 8, get: () => !!e.brushShape.wetEdges, set: (v) => put({ wetEdges: v }) },
  ];
}

/** The pressure toggles for size and opacity, shared by every tool that paints with the brush's dynamics. */
export function pressureSizeOption(e: Engine): OptionSpec {
  return { kind: 'toggle', label: 'Pressure: size', priority: 20, get: () => e.brushDynamics.size.enabled, set: (v) => { e.alwaysPressure.size = v; e.brushDynamics.size = v ? pressureOption(e.brushDynamics.size.enabled ? e.brushDynamics.size.min : 0.2) : identityOption(); e.brushPresetId = null; e.emit('options', null); } };
}
export function pressureOpacityOption(e: Engine): OptionSpec {
  return { kind: 'toggle', label: 'Pressure: opacity', priority: 20, get: () => !!e.brushDynamics.opacity?.enabled, set: (v) => { e.alwaysPressure.opacity = v; e.brushDynamics.opacity = v ? pressureOption(0.2) : identityOption(); e.brushPresetId = null; e.emit('options', null); } };
}

/** Smoothing and its modes, shared by the Brush and the Pencil. */
export function smoothingOptions(e: Engine): OptionSpec[] {
  return [
    { kind: 'range', label: 'Smoothing', priority: 30, min: 0, max: 100, unit: '%', get: () => smoothing, set: (v: number) => { smoothing = Math.max(0, Math.min(100, Math.round(v))); e.emit('options', null); } },
    { kind: 'select', label: 'Smoothing mode', priority: 12, choices: [{ id: 'trail', label: 'Trailing point' }, { id: 'string', label: 'Pulled string' }], get: () => smoothMode, set: (v: string) => { smoothMode = v === 'string' ? 'string' : 'trail'; e.emit('options', null); } },
    { kind: 'toggle', label: 'Catch-up on stroke end', priority: 12, get: () => catchUp, set: (v) => { catchUp = v; e.emit('options', null); } },
    { kind: 'toggle', label: 'Adjust for zoom', priority: 12, get: () => zoomAdjust, set: (v) => { zoomAdjust = v; e.emit('options', null); } },
  ];
}

/** One bracket-key step of the brush: size by a step that grows with the diameter, hardness by 25%. */
export function stepBrush(eng: Engine, what: 'size' | 'hardness', dir: 1 | -1): void {
  if (what === 'hardness') {
    eng.setBrush({ hardness: clamp(eng.brush.hardness + dir * 0.25, 0, 1) });
    cursorState.hardAt = performance.now();
    window.setTimeout(() => eng.emit('overlay', null), 1300);
    return;
  }
  const d = eng.brush.diameter, step = d < 10 ? 1 : d < 50 ? 5 : d < 100 ? 10 : d < 300 ? 25 : 50;
  eng.setBrush({ diameter: Math.max(1, d + dir * step) });
}

/** Shift held while dragging a stroke: the point is turned about the stroke's start to the nearest 45 degrees. */
export function shiftLocked(from: Pt | null, pt: Pt, shift: boolean): Pt {
  if (!shift || !from) return pt;
  const dx = pt.x - from.x, dy = pt.y - from.y, d = Math.hypot(dx, dy), q = Math.PI / 4, a = Math.round(Math.atan2(dy, dx) / q) * q;
  return { x: from.x + Math.cos(a) * d, y: from.y + Math.sin(a) * d };
}

export const brushTool: Tool = {
  id: 'brush', label: 'Brush', key: 'B', order: 50,
  icon: (e) => (e.brushMode === 'erase' ? 'tEraser' : 'tBrush'),
  hint: (e) => (e.brushMode === 'erase' ? 'Drag to erase' : 'Drag to paint') + ' · Shift-click draws a line from the last point · [ ] size · Shift+[ ] hardness · 1-0 opacity · E eraser · B brush · Space pans',
  cursor: () => 'none',
  // Smoothing (1.50.3, the tool audit): the stroke follows a steadied point that trails the pointer, and
  // catches up to where it is released.
  // Airbrush (1.50.4): while the button is held, paint keeps building where the pointer rests (every 60 ms).
  down(ctx, p) {
    if (p.button !== 0) return;
    // Alt held: a temporary eyedropper, the colour under the pointer becomes the foreground
    if (p.alt) { const c = ctx.engine.sampleColor(p.doc); if (c) ctx.engine.setColors(c); return; }
    hoverPt = p.doc; smoothStart(p.doc); last = p; origin = p.shift ? null : { ...p.doc };
    if (ctx.engine.beginStroke(p.doc, p.shift, p.pressure, p.pose)) {
      holdStart(p.doc, !airbrushState.on);   // Quick Shape (36.5); not with the Airbrush, whose paint builds where the pointer rests
      if (airbrushState.on) { clearInterval(airTimer); airTimer = window.setInterval(() => ctx.engine.airbrushTick(last?.pressure ?? 1), airbrushState.interval); }
    }
  },
  move(ctx, p) {
    hoverPt = p.doc; last = p;
    if (quickShapeSnapped()) { ctx.engine.emit('overlay', null); return; }   // snapped to a shape: the stroke is that shape now
    ctx.engine.strokeTo(smoothTo(shiftLocked(origin, p.doc, p.shift), ctx.view().zoom), p.pressure, p.pose);
    holdMove(ctx, p, (pt, pr, pose) => ctx.engine.beginStroke(pt, false, pr, pose));
    ctx.engine.emit('overlay', null);
  },
  up(ctx) { clearInterval(airTimer); const end = smoothFinish(); if (end && last && !quickShapeSnapped()) ctx.engine.strokeTo(end, last.pressure, last.pose); holdEnd(); last = null; ctx.engine.endStroke(); },
  hover(ctx, p) { hoverPt = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  cancel(ctx) { clearInterval(airTimer); holdEnd(); ctx.engine.cancelStroke(); },
  keydown(ctx, e) {
    if (e.key === 'CapsLock') { cursorState.caps = e.getModifierState('CapsLock'); ctx.engine.emit('overlay', null); return false; }
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    const eng = ctx.engine;
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
      stepBrush(eng, e.shiftKey ? 'hardness' : 'size', e.code === 'BracketRight' ? 1 : -1);
      return true;
    }
    const digit = digitOf(e);
    if (digit !== null) {
      // A second digit within 700 ms makes an exact value (4 then 5 is 45%); Shift sets Flow instead of Opacity.
      const now = performance.now(), first = lastDigit && lastDigit.shift === e.shiftKey && now - lastDigit.at < 700 ? lastDigit.d : null;
      lastDigit = first === null ? { d: digit, at: now, shift: e.shiftKey } : null;
      const v = first === null ? (digit === 0 ? 1 : digit / 10) : Math.max(0.01, Math.min(100, first * 10 + digit) / 100);
      if (e.shiftKey) { eng.brushFlow = v; eng.emit('options', null); } else eng.setBrush({ opacity: v });
      return true;
    }
    if (e.key === 'Escape' && eng.stroking) { eng.cancelStroke(); return true; }
    return false;
  },
  overlay(ctx, g) {
    drawBrushCursor(ctx, g, hoverPt);
  },
  options: (e) => [
    { kind: 'title', text: 'Brush' },
    { kind: 'toggle', label: 'Airbrush', priority: 40, get: () => airbrushState.on, set: (v) => { airbrushState.on = v; e.emit('options', null); } },
    { kind: 'range', label: 'Build-up interval', priority: 13, min: 10, max: 500, unit: 'ms', get: () => airbrushState.interval, set: (v: number) => { airbrushState.interval = Math.max(10, Math.min(500, Math.round(v))); e.emit('options', null); }, when: () => airbrushState.on },
    quickShapeOption(e),
    ...symmetryOptions(e),
    ...smoothingOptions(e),
    ...shapeOptions(e),
    { kind: 'range', label: 'Angle', priority: 25, min: -180, max: 180, unit: '\u00b0', get: () => Math.round(e.brushShape.angle), set: (v: number) => { e.brushShape = { ...e.brushShape, angle: Math.max(-180, Math.min(180, Math.round(v))) }; e.emit('options', null); } },
    // Mode: Normal, Behind, Clear and all the layer blend modes (the ten the canvas lacks are blended per pixel).
    { kind: 'select', label: 'Mode', priority: 70, choices: [{ id: 'normal', label: 'Normal' }, { id: 'behind', label: 'Behind' }, { id: 'clear', label: 'Clear' }, ...BLEND_MODES.filter((m) => m.id !== 'normal').map((m) => ({ id: m.id, label: m.label }))], get: () => e.brushBlend, set: (v: string) => e.setBrushBlend(v as typeof e.brushBlend) },
    { kind: 'range', label: 'Size', priority: 90, min: 1, max: 1000, unit: 'px', get: () => e.brush.diameter, set: (v) => e.setBrush({ diameter: v }) },
    { kind: 'range', label: 'Hardness', priority: 80, min: 0, max: 100, unit: '%', get: () => Math.round(e.brush.hardness * 100), set: (v) => e.setBrush({ hardness: v / 100 }) },
    { kind: 'range', label: 'Opacity', priority: 95, min: 1, max: 100, unit: '%', get: () => Math.round(e.brush.opacity * 100), set: (v) => e.setBrush({ opacity: v / 100 }) },
    pressureOpacityOption(e),
    { kind: 'range', label: 'Flow', priority: 85, min: 1, max: 100, unit: '%', get: () => Math.round(e.brushFlow * 100), set: (v: number) => { e.brushFlow = Math.max(0.01, Math.min(1, v / 100)); e.emit('options', null); } },
    { kind: 'select', label: 'Preset', priority: 45, choices: [{ id: '', label: 'Custom' }, ...allBrushPresets().map((b) => ({ id: b.id, label: b.name }))], live: () => [{ id: '', label: 'Custom' }, ...allBrushPresets().map((b) => ({ id: b.id, label: b.name }))], get: () => e.brushPresetId ?? '', set: (id) => { const b = allBrushPresets().find((x) => x.id === id); if (b) e.applyBrushPreset(b); else { e.brushPresetId = null; e.setBrush({ tip: null }); } } },
    { kind: 'select', label: 'Right-click', priority: 10, choices: [{ id: 'resize', label: 'Resize only' }, { id: 'picker', label: 'Preset picker' }], get: () => e.brushRightClick, set: (v: string) => { e.brushRightClick = v === 'picker' ? 'picker' : 'resize'; e.emit('options', null); } },
    { kind: 'button', label: 'Import Brushes', priority: 10, icon: 'upload', run: () => e.uiHooks.importBrushes?.() },
    pressureSizeOption(e),
    { kind: 'range', label: 'Min size', priority: 15, min: 0, max: 100, unit: '%', get: () => Math.round((e.brushDynamics.size.enabled ? e.brushDynamics.size.min : 0.2) * 100), set: (v) => { if (e.brushDynamics.size.enabled) e.brushDynamics.size = pressureOption(v / 100); e.brushPresetId = null; e.emit('options', null); } },
    { kind: 'toggle', label: 'Pressure: flow', priority: 20, get: () => e.brushDynamics.flow.enabled, set: (v) => { e.brushDynamics.flow = v ? pressureOption(e.brushDynamics.flow.enabled ? e.brushDynamics.flow.min : 0.2) : identityOption(); e.brushPresetId = null; e.emit('options', null); } },
    { kind: 'range', label: 'Min flow', priority: 15, min: 0, max: 100, unit: '%', get: () => Math.round((e.brushDynamics.flow.enabled ? e.brushDynamics.flow.min : 0.2) * 100), set: (v) => { if (e.brushDynamics.flow.enabled) e.brushDynamics.flow = pressureOption(v / 100); e.brushPresetId = null; e.emit('options', null); } },
  ]
};
