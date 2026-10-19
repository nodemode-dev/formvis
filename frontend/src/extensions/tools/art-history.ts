import type { Engine, Pt } from '../../engine';
import { ART_STYLES, type ArtStyle } from '../../engine/art-history';
import type { OptionSpec, Tool } from '../registry';
import { brushKeys, brushOptions, drawBrushCursor } from './brush-common';

let hover: Pt | null = null;

/** The Art History Brush (Y, with the History Brush; 1.56.3, the parity plan's L4), as Photoshop's: paints stylised
 *  strokes in the colours of the History Brush's source snapshot (engine/art-history.ts). Style and Tolerance in the
 *  options bar, with the Brush's size, hardness and opacity; the strokes are a quarter of the brush wide. */
export const artHistoryTool: Tool = {
  id: 'artHistory', label: 'Art History Brush', key: 'Y', order: 61.5,
  icon: () => 'tHistoryBrush',
  hint: () => 'Paint stylised strokes in the colours of the source snapshot (History panel) · [ ] size',
  cursor: () => 'none',
  down(ctx, p) { if (p.button !== 0) return; hover = p.doc; ctx.engine.beginRetouchStroke('artHistory', p.doc, p.shift); },
  move(ctx, p) { hover = p.doc; ctx.engine.strokeTo(p.doc); ctx.engine.emit('overlay', null); },
  up(ctx) { ctx.engine.endStroke(); },
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  cancel(ctx) { ctx.engine.cancelStroke(); },
  keydown(ctx, e) { return brushKeys(ctx, e); },
  overlay(ctx, g) { drawBrushCursor(ctx, g, hover); },
  options: (e: Engine): OptionSpec[] => [
    { kind: 'title', text: 'Art History Brush' },
    { kind: 'readout', label: 'Source', priority: 45, get: () => e.snapshots.find((s) => s.id === e.historyBrushSourceId)?.name ?? 'none (take a snapshot)' },
    { kind: 'select', label: 'Style', priority: 70, choices: ART_STYLES.map(([id, label]) => ({ id, label })), get: () => e.artHistory.style, set: (v) => { e.artHistory = { ...e.artHistory, style: v as ArtStyle }; } },
    { kind: 'range', label: 'Tolerance', priority: 60, min: 0, max: 100, unit: '%', get: () => e.artHistory.tolerance, set: (v) => { e.artHistory = { ...e.artHistory, tolerance: v }; } },
    ...brushOptions(e, 'Opacity'),
  ],
};
