import type { Engine, TextSpec } from '../../engine';
import { canListSystemFonts, fontFamilies, loadSystemFonts } from '../../ui/fonts';
import type { Pt } from '../../engine';
import { dashed, toolHost, type Tool } from '../registry';

const SYSTEM_FONTS = '__system-fonts';
let draft: { from: Pt; to: Pt } | null = null;

/** The font menu: this machine's families (the current one kept if it came from elsewhere, as a Photoshop file), and
 *  "Load system fonts..." where the browser can list them. */
function fontChoices(current: string): Array<{ id: string; label: string }> {
  const list = fontFamilies();
  if (current && !list.includes(current)) list.push(current);
  return [...list.map((f) => ({ id: f, label: f })), ...(canListSystemFonts() ? [{ id: SYSTEM_FONTS, label: 'Load system fonts...' }] : [])];
}

/** Changes the Type settings, shows them in the options bar, and restyles text being typed. */
const STYLE_KEYS = ['family', 'size', 'bold', 'italic', 'align', 'antialias', 'lineHeight', 'tracking', 'kerning'] as const;

export function setType(e: Engine, patch: Partial<TextSpec>): void {
  e.textSettings = { ...e.textSettings, ...patch };
  e.emit('options', null);
  document.dispatchEvent(new CustomEvent('cv:type-settings'));
  // As Photoshop's bar (1.50.4, the tool audit): the selected type layer takes the style too, when the Type tool is in
  // use and no text is being typed (the editor restyles what is being typed); orientation and mask never pass over.
  const l = e.activeLayer, typing = !!document.querySelector('.cv-type-editor:not([hidden])');
  const style = Object.fromEntries(Object.entries(patch).filter(([k]) => (STYLE_KEYS as readonly string[]).includes(k)));
  if (e.tool === 'type' && !typing && l?.text && Object.keys(style).length) void e.updateTextLayer(l.id, { ...l.text, ...style });
}

/** Type (T): click a type layer to edit its text on the canvas, or anywhere else to start new text whose first
 *  baseline begins at the click. The tool announces where; the app's text editor does the typing. */
export const typeTool: Tool = {
  id: 'type', label: 'Type', key: 'T', order: 78,
  icon: (e) => (e.typeMask ? (e.textSettings.direction === 'vertical' ? 'tTypeMaskV' : 'tTypeMask') : e.textSettings.direction === 'vertical' ? 'tTypeV' : 'tType'),
  // Photoshop's four: Horizontal and Vertical Type, and their masks (which make a selection instead of a layer).
  variants: (e) => ([['h', 'Horizontal Type', 'tType', false, 'horizontal'], ['v', 'Vertical Type', 'tTypeV', false, 'vertical'], ['hm', 'Horizontal Type Mask', 'tTypeMask', true, 'horizontal'], ['vm', 'Vertical Type Mask', 'tTypeMaskV', true, 'vertical']] as const).map(([id, label, icon, mask, dir]) => ({
    id, label, icon, active: () => e.typeMask === mask && (e.textSettings.direction ?? 'horizontal') === dir, pick: () => { e.typeMask = mask; setType(e, { direction: dir }); },
  })),
  hint: (e) => (e.typeMask ? 'Click or drag a box, type, then click away: the text becomes a selection' : 'Click to add point text · Drag a box for paragraph text · Click a type layer to edit its text'),
  cursor: () => 'text',
  options: (e) => [
    { kind: 'title', text: 'Type' },
    { kind: 'select', label: 'Font', choices: fontChoices(e.textSettings.family), live: () => fontChoices(e.textSettings.family), get: () => e.textSettings.family, set: (v) => {
      // "Load system fonts..." asks for the machine's font list (a click is what lets the browser ask), then refreshes.
      if (v === SYSTEM_FONTS) { void loadSystemFonts().then(() => e.emit('options', null)); return; }
      setType(e, { family: v });
    } },
    { kind: 'number', label: 'Size', min: 1, max: 2000, unit: 'px', get: () => e.textSettings.size, set: (v) => setType(e, { size: Math.min(2000, Math.max(1, v)) }) },
    { kind: 'segment', label: 'Align', choices: [{ id: 'left', label: 'Left' }, { id: 'center', label: 'Centre' }, { id: 'right', label: 'Right' }, { id: 'justify', label: 'Justify' }], get: () => e.textSettings.align, set: (v) => setType(e, { align: v === 'justify' ? 'justify' : v === 'center' || v === 'right' ? v : 'left' }) },
    // Font Style and Warp Text as Photoshop's bar (1.50.3, the tool audit; Bold and Italic were two toggles).
    { kind: 'select', label: 'Font Style', choices: [{ id: 'regular', label: 'Regular' }, { id: 'italic', label: 'Italic' }, { id: 'bold', label: 'Bold' }, { id: 'bold-italic', label: 'Bold Italic' }],
      get: () => (e.textSettings.bold ? (e.textSettings.italic ? 'bold-italic' : 'bold') : e.textSettings.italic ? 'italic' : 'regular'),
      set: (v: string) => setType(e, { bold: v.startsWith('bold'), italic: v.endsWith('italic') }) },
    { kind: 'number', label: 'Leading', min: 0.5, max: 4, step: 0.05, unit: 'x', get: () => e.textSettings.lineHeight, set: (v) => setType(e, { lineHeight: Math.min(4, Math.max(0.5, v)) }) },
    // Photoshop's units: tracking in thousandths of an em; kerning the font's own (Metrics) or none (0).
    { kind: 'number', label: 'Tracking', min: -1000, max: 10000, step: 10, unit: '', get: () => e.textSettings.tracking, set: (v) => setType(e, { tracking: Math.round(Math.min(10000, Math.max(-1000, v))) }) },
    { kind: 'select', label: 'Kerning', choices: [{ id: 'metrics', label: 'Metrics' }, { id: 'none', label: '0' }], get: () => e.textSettings.kerning, set: (v) => setType(e, { kerning: v === 'none' ? 'none' : 'metrics' }) },
    // Anti-aliasing and the Color swatch (1.50.4, the tool audit), as Photoshop's bar; the swatch recolours the selected
    // type layer as well as setting the colour new text takes.
    { kind: 'select', label: 'Anti-aliasing', choices: [{ id: 'none', label: 'None' }, { id: 'sharp', label: 'Sharp' }, { id: 'smooth', label: 'Smooth' }], get: () => e.textSettings.antialias ?? 'smooth', set: (v: string) => setType(e, { antialias: v === 'none' || v === 'sharp' ? v : 'smooth' }) },
    { kind: 'color', label: 'Color', get: () => e.fg, set: (c) => { e.fg = c; e.emit('options', null); const l = e.activeLayer; if (l?.text) void e.updateTextLayer(l.id, { ...l.text, color: e.fg }); } },
    { kind: 'button', label: 'Warp Text...', run: () => toolHost.run('warp-text') },
  ],
  // A click starts point text (or edits the type layer under it); a drag draws a box for paragraph text (1.49.7).
  down(ctx, p) {
    if (p.button !== 0 || !ctx.engine.current) return;
    const hit = ctx.engine.typeMask ? null : ctx.engine.textLayerAt(p.doc);
    if (hit) { document.dispatchEvent(new CustomEvent('cv:type', { detail: { layerId: hit } })); return; }
    draft = { from: p.doc, to: p.doc };
  },
  move(ctx, p) { if (!draft) return; draft.to = p.doc; ctx.engine.emit('overlay', null); },
  up(ctx) {
    const d = draft;
    draft = null;
    ctx.engine.emit('overlay', null);
    if (!d) return;
    const v = ctx.view(), a = v.toScreen(d.from), b = v.toScreen(d.to);
    if (Math.abs(b.x - a.x) < 8 || Math.abs(b.y - a.y) < 8) { document.dispatchEvent(new CustomEvent('cv:type', { detail: { x: d.from.x, y: d.from.y } })); return; }
    const x = Math.min(d.from.x, d.to.x), y = Math.min(d.from.y, d.to.y);
    document.dispatchEvent(new CustomEvent('cv:type', { detail: { x, y, box: { w: Math.abs(d.to.x - d.from.x), h: Math.abs(d.to.y - d.from.y) } } }));
  },
  cancel(ctx) { draft = null; ctx.engine.emit('overlay', null); },
  overlay(ctx, g) {
    if (!draft) return;
    const v = ctx.view(), a = v.toScreen(draft.from), b = v.toScreen(draft.to);
    dashed(ctx, g, () => { g.rect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(b.x - a.x), Math.abs(b.y - a.y)); });
  },
};
