import { BLEND_MODES, canvasBlend } from '../../engine';
import { clamp, type Pt } from '../../engine';
import { allBrushPresets, identityOption, pressureOption } from '../../engine/brush-dynamics';
import { digitOf, type Tool } from '../registry';

let hoverPt: Pt | null = null;

let airbrush = false, airTimer = 0, smoothing = 0, steady: { x: number; y: number } | null = null, last: import('../registry').ToolPointer | null = null;

export const brushTool: Tool = {
  id: 'brush', label: 'Brush', key: 'B', order: 50,
  icon: (e) => (e.brushMode === 'erase' ? 'tEraser' : 'tBrush'),
  hint: (e) => `${e.brushMode === 'erase' ? 'Drag to erase' : 'Drag to paint'} · Shift-click draws a line from the last point · [ ] size · Shift+[ ] hardness · 1-0 opacity · E eraser · B brush · Space pans`,
  cursor: () => 'none',
  // Smoothing (1.50.3, the tool audit), as Photoshop's: the stroke follows a steadied point that trails the pointer, and
  // catches up to where it is released.
  // Airbrush (1.50.4): while the button is held, paint keeps building where the pointer rests (every 60 ms).
  down(ctx, p) {
    if (p.button !== 0) return;
    hoverPt = p.doc; steady = { ...p.doc }; last = p;
    if (ctx.engine.beginStroke(p.doc, p.shift, p.pressure, p.pose) && airbrush) { clearInterval(airTimer); airTimer = window.setInterval(() => ctx.engine.airbrushTick(last?.pressure ?? 1), 60); }
  },
  move(ctx, p) {
    hoverPt = p.doc; last = p;
    const k = 1 - Math.min(0.95, smoothing / 100);
    if (steady && smoothing > 0) { steady = { x: steady.x + (p.doc.x - steady.x) * k, y: steady.y + (p.doc.y - steady.y) * k }; ctx.engine.strokeTo(steady, p.pressure, p.pose); }
    else ctx.engine.strokeTo(p.doc, p.pressure, p.pose);
    ctx.engine.emit('overlay', null);
  },
  up(ctx) { clearInterval(airTimer); if (steady && last && smoothing > 0) ctx.engine.strokeTo(last.doc, last.pressure, last.pose); steady = null; last = null; ctx.engine.endStroke(); },
  hover(ctx, p) { hoverPt = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  cancel(ctx) { clearInterval(airTimer); ctx.engine.cancelStroke(); },
  keydown(ctx, e) {
    const eng = ctx.engine;
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
      const up = e.code === 'BracketRight';
      if (e.shiftKey) eng.setBrush({ hardness: clamp(eng.brush.hardness + (up ? 0.25 : -0.25), 0, 1) });
      else {
        const d = eng.brush.diameter;
        const step = d < 10 ? 1 : d < 50 ? 5 : d < 100 ? 10 : d < 300 ? 25 : 50;
        eng.setBrush({ diameter: d + (up ? step : -step) });
      }
      return true;
    }
    const digit = digitOf(e);
    if (digit !== null && !e.shiftKey) { eng.setBrush({ opacity: digit === 0 ? 1 : digit / 10 }); return true; }
    if (e.key === 'Escape' && eng.stroking) { eng.cancelStroke(); return true; }
    return false;
  },
  overlay(ctx, g) {
    const at = ctx.engine.tipDrag?.at ?? hoverPt;
    if (!at) return;
    const v = ctx.view();
    const pal = ctx.paint();
    const c = v.toScreen(at);
    const r = Math.max(0.5, (ctx.engine.brush.diameter * v.zoom) / 2);
    g.save();
    g.lineWidth = 1;
    g.strokeStyle = pal.antsA;
    g.beginPath();
    g.arc(c.x, c.y, r, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = pal.antsB;
    g.beginPath();
    g.arc(c.x, c.y, r + 1, 0, Math.PI * 2);
    g.stroke();
    if (r < 6) {
      g.beginPath();
      g.moveTo(c.x - 8, c.y); g.lineTo(c.x - 3, c.y); g.moveTo(c.x + 3, c.y); g.lineTo(c.x + 8, c.y);
      g.moveTo(c.x, c.y - 8); g.lineTo(c.x, c.y - 3); g.moveTo(c.x, c.y + 3); g.lineTo(c.x, c.y + 8);
      g.stroke();
    }
    g.restore();
  },
  options: (e) => [
    { kind: 'title', text: 'Brush' },
    { kind: 'toggle', label: 'Airbrush', get: () => airbrush, set: (v) => { airbrush = v; e.emit('options', null); } },
    { kind: 'range', label: 'Smoothing', min: 0, max: 100, unit: '%', get: () => smoothing, set: (v: number) => { smoothing = Math.max(0, Math.min(100, Math.round(v))); e.emit('options', null); } },
    { kind: 'range', label: 'Angle', min: -180, max: 180, unit: '\u00b0', get: () => Math.round(e.brushShape.angle), set: (v: number) => { e.brushShape = { ...e.brushShape, angle: Math.max(-180, Math.min(180, Math.round(v))) }; e.emit('options', null); } },
    // Photoshop's Mode: Normal, Behind, Clear and the blend modes the canvas truly draws (Paint/Erase was formvis's own;
    // erasing is the Eraser's).
    { kind: 'select', label: 'Mode', choices: [{ id: 'normal', label: 'Normal' }, { id: 'behind', label: 'Behind' }, { id: 'clear', label: 'Clear' }, ...BLEND_MODES.filter((m) => m.id !== 'normal' && canvasBlend(m.id)).map((m) => ({ id: m.id, label: m.label }))], get: () => e.brushBlend, set: (v: string) => e.setBrushBlend(v as typeof e.brushBlend) },
    { kind: 'range', label: 'Size', min: 1, max: 1000, unit: 'px', get: () => e.brush.diameter, set: (v) => e.setBrush({ diameter: v }) },
    { kind: 'range', label: 'Hardness', min: 0, max: 100, unit: '%', get: () => Math.round(e.brush.hardness * 100), set: (v) => e.setBrush({ hardness: v / 100 }) },
    { kind: 'range', label: 'Opacity', min: 1, max: 100, unit: '%', get: () => Math.round(e.brush.opacity * 100), set: (v) => e.setBrush({ opacity: v / 100 }) },
    { kind: 'range', label: 'Flow', min: 1, max: 100, unit: '%', get: () => Math.round(e.brushFlow * 100), set: (v: number) => { e.brushFlow = Math.max(0.01, Math.min(1, v / 100)); e.emit('options', null); } },
    { kind: 'select', label: 'Preset', choices: [{ id: '', label: 'Custom' }, ...allBrushPresets().map((b) => ({ id: b.id, label: b.name }))], live: () => [{ id: '', label: 'Custom' }, ...allBrushPresets().map((b) => ({ id: b.id, label: b.name }))], get: () => e.brushPresetId ?? '', set: (id) => { const b = allBrushPresets().find((x) => x.id === id); if (b) e.applyBrushPreset(b); else { e.brushPresetId = null; e.setBrush({ tip: null }); } } },
    { kind: 'button', label: 'Import Brushes', icon: 'upload', run: () => e.uiHooks.importBrushes?.() },
    { kind: 'toggle', label: 'Pressure: size', get: () => e.brushDynamics.size.enabled, set: (v) => { e.brushDynamics.size = v ? pressureOption(e.brushDynamics.size.enabled ? e.brushDynamics.size.min : 0.2) : identityOption(); e.brushPresetId = null; e.emit('options', null); } },
    { kind: 'range', label: 'Min size', min: 0, max: 100, unit: '%', get: () => Math.round((e.brushDynamics.size.enabled ? e.brushDynamics.size.min : 0.2) * 100), set: (v) => { if (e.brushDynamics.size.enabled) e.brushDynamics.size = pressureOption(v / 100); e.brushPresetId = null; e.emit('options', null); } },
    { kind: 'toggle', label: 'Pressure: flow', get: () => e.brushDynamics.flow.enabled, set: (v) => { e.brushDynamics.flow = v ? pressureOption(e.brushDynamics.flow.enabled ? e.brushDynamics.flow.min : 0.2) : identityOption(); e.brushPresetId = null; e.emit('options', null); } },
    { kind: 'range', label: 'Min flow', min: 0, max: 100, unit: '%', get: () => Math.round((e.brushDynamics.flow.enabled ? e.brushDynamics.flow.min : 0.2) * 100), set: (v) => { if (e.brushDynamics.flow.enabled) e.brushDynamics.flow = pressureOption(v / 100); e.brushPresetId = null; e.emit('options', null); } },
  ],
};
