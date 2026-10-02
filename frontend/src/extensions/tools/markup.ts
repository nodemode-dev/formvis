import type { Pt } from '../../engine';
import { MARKUP_KINDS, type MarkupKind } from '../../engine/markup';
import type { OptionSpec, Tool } from '../registry';

let drag: { a: Pt; b: Pt } | null = null;

/** Markup (1.60.3, the register's L2, DEV_PLAN 23.13), grouped with the Note and Count tools (I): drag to mark the
 *  picture, each mark its own vector layer and one step. Arrow runs from where the drag starts to its tip; Callout puts
 *  a box where the drag ends, its tail at where it began; Highlight marks over what is dragged; Redact draws a black
 *  box that Apply Redactions burns into every layer beneath it. */
export const markupTool: Tool = {
  id: 'markup', label: 'Markup', key: 'I', order: 80.8,
  icon: () => 'tArrow',
  hint: (e) => (e.markupKind === 'redact' ? 'Drag a box over what to hide · Apply Redactions burns the boxes into every layer beneath them'
    : e.markupKind === 'callout' ? 'Drag from what the callout is about to where its box goes'
      : e.markupKind === 'highlight' ? 'Drag over what to highlight' : 'Drag from the tail of the arrow to its tip'),
  cursor: () => 'crosshair',
  down(ctx, p) {
    if (p.button !== 0 || !ctx.engine.current) return;
    drag = { a: p.doc, b: p.doc };
  },
  move(ctx, p) {
    if (!drag) return;
    drag.b = p.doc;
    ctx.engine.emit('overlay', null);
  },
  up(ctx, p) {
    if (!drag) return;
    const d = drag;
    drag = null;
    ctx.engine.addMarkup(d.a, p.doc);
    ctx.engine.emit('overlay', null);
  },
  overlay(ctx, g) {
    if (!drag) return;
    const v = ctx.view(), a = v.toScreen(drag.a), b = v.toScreen(drag.b), e = ctx.engine, c = e.markupColor;
    g.save();
    g.setLineDash([5, 4]);
    g.lineWidth = 1.5;
    g.strokeStyle = e.markupKind === 'redact' ? '#000000' : `rgb(${c.r}, ${c.g}, ${c.b})`;
    if (e.markupKind === 'arrow') { g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    else g.strokeRect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    g.restore();
  },
  options: (e): OptionSpec[] => [
    { kind: 'title', text: 'Markup' },
    { kind: 'segment', label: 'Mark', choices: MARKUP_KINDS, get: () => e.markupKind, set: (v) => { e.markupKind = v as MarkupKind; e.emit('options', null); e.emit('tool', null); } },
    { kind: 'color', label: 'Color', get: () => e.markupColor, set: (c) => { e.markupColor = c; e.emit('options', null); } },
    { kind: 'number', label: 'Width', min: 1, max: 64, step: 1, unit: 'px', get: () => e.markupWidth, set: (v) => { e.markupWidth = Math.max(1, Math.min(64, Math.round(v))); e.emit('options', null); } },
    { kind: 'button', label: 'Apply Redactions', run: () => { const n = e.applyRedactions(); if (n) e.notice(`Redacted: the boxes burned into ${n} layer${n === 1 ? '' : 's'}.`); } },
  ],
};
