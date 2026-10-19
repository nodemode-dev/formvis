import { HANDLES, TEXT_ANTIALIAS, type Engine, type Layer, type Rect, type TextSpec } from '../../engine';
import { OT_FEATURES, featureOn, featuresKnown, featuresOf, withFeature } from '../../engine/opentype';
import { canListSystemFonts, fontFamilies, loadSystemFonts, rememberFont } from '../../ui/fonts';
import type { Pt } from '../../engine';
import { dashed, toolHost, type Tool, type ToolContext, type ToolPointer } from '../registry';

const SYSTEM_FONTS = '__system-fonts';
let draft: { from: Pt; to: Pt } | null = null;
// Box handles on the selected paragraph type layer: dragging one resizes the box and reflows the text. A Ctrl drag
// while typing moves the text being typed.
let boxDrag: { id: string; handle: number; from: Rect; start: Pt; to: Pt; scale: number } | null = null;
let moveDrag: Pt | null = null;
const typingNow = (): boolean => !!document.querySelector('.cv-type-editor:not([hidden])');

/** The active layer when it is live paragraph text, upright and unflipped, and no text is being typed. */
function boxLayer(e: Engine): Layer | null {
  const l = e.current?.activeLayer, t = l?.transform;
  return l && t && l.text?.box && l.raster && e.liveText(l) && !t.rotation && !t.flipX && !t.flipY && !typingNow() ? l : null;
}

function boxHit(ctx: ToolContext, p: ToolPointer): { layer: Layer; handle: number } | null {
  const l = boxLayer(ctx.engine);
  if (!l) return null;
  const v = ctx.view(), t = l.transform;
  const handle = HANDLES.findIndex((h) => { const s = v.toScreen({ x: t.x + t.w * h.x, y: t.y + t.h * h.y }); return Math.hypot(s.x - p.screen.x, s.y - p.screen.y) <= 8; });
  return handle < 0 ? null : { layer: l, handle };
}

/** The box as the drag has it: the grabbed edges follow the pointer, the others stay, at least 16 pixels each way. */
function dragRect(d: NonNullable<typeof boxDrag>): Rect {
  const h = HANDLES[d.handle], dx = d.to.x - d.start.x, dy = d.to.y - d.start.y;
  let l = d.from.x, t = d.from.y, r = l + d.from.w, b = t + d.from.h;
  if (h.x === 0) l = Math.min(l + dx, r - 16); else if (h.x === 1) r = Math.max(r + dx, l + 16);
  if (h.y === 0) t = Math.min(t + dy, b - 16); else if (h.y === 1) b = Math.max(b + dy, t + 16);
  return { x: l, y: t, w: r - l, h: b - t };
}

/** The font menu: this machine's families (the current one kept if it came from elsewhere, as a PSD file), and
 *  "Load system fonts..." where the browser can list them. */
function fontChoices(current: string): Array<{ id: string; label: string }> {
  const list = fontFamilies();
  if (current && !list.includes(current)) list.push(current);
  return [...list.map((f) => ({ id: f, label: f })), ...(canListSystemFonts() ? [{ id: SYSTEM_FONTS, label: 'Load system fonts...' }] : [])];
}

/** Changes the Type settings, shows them in the options bar, and restyles text being typed. */
const STYLE_KEYS = ['family', 'size', 'bold', 'italic', 'align', 'antialias', 'lineHeight', 'tracking', 'kerning', 'features', 'hyphenate', 'language', 'shaping', 'weight', 'caps', 'scaleX', 'scaleY', 'baselineShift', 'underline', 'strike', 'variations', 'indentFirst', 'indentLeft', 'indentRight', 'spaceBefore', 'spaceAfter', 'lastLine'] as const;

const LANGUAGES: Array<[string, string]> = [['', 'Default'], ['en-US', 'English'], ['de', 'German'], ['fr', 'French'], ['es', 'Spanish'], ['ja', 'Japanese'], ['zh-CN', 'Chinese (Simplified)'], ['zh-TW', 'Chinese (Traditional)'], ['ko', 'Korean'], ['ar', 'Arabic'], ['he', 'Hebrew']];

/** The OpenType menu (DEV_PLAN 32.6b): each feature marked on or off, a pick toggling it for new text and the selected type layer. */
function featureChoices(e: Engine): Array<{ id: string; label: string }> {
  const s = featureSource(e), { family, bold, italic } = s, known = featuresKnown(family, !!bold, !!italic);
  if (known === undefined) void featuresOf(family, !!bold, !!italic).then(() => e.emit('options', null));
  return [{ id: '', label: 'OpenType' }, ...OT_FEATURES.map((f) => ({ id: f.tag, label: `${featureOn(s.features, f.tag) ? '[x]' : '[ ]'} ${f.label}${known && !known.has(f.tag) ? ' (not in font)' : ''}` }))];
}

/** The spec the OpenType menu reads: the selected live type layer's, else the settings for new text. */
function featureSource(e: Engine): TextSpec {
  const l = e.current?.activeLayer;
  return l?.text && e.liveText(l) ? l.text : e.textSettings;
}

export function setType(e: Engine, patch: Partial<TextSpec>): void {
  e.textSettings = { ...e.textSettings, ...patch };
  if (patch.family) rememberFont(patch.family);
  e.emit('options', null);
  document.dispatchEvent(new CustomEvent('cv:type-settings'));
  // (1.50.4, the tool audit): the selected type layer takes the style too, when the Type tool is in
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
  // The four: Horizontal and Vertical Type, and their masks (which make a selection instead of a layer).
  variants: (e) => ([['h', 'Horizontal Type', 'tType', false, 'horizontal'], ['v', 'Vertical Type', 'tTypeV', false, 'vertical'], ['hm', 'Horizontal Type Mask', 'tTypeMask', true, 'horizontal'], ['vm', 'Vertical Type Mask', 'tTypeMaskV', true, 'vertical']] as const).map(([id, label, icon, mask, dir]) => ({
    id, label, icon, active: () => e.typeMask === mask && (e.textSettings.direction ?? 'horizontal') === dir, pick: () => { e.typeMask = mask; setType(e, { direction: dir }); },
  })),
  hint: (e) => (e.typeMask ? 'Click or drag a box, type, then click away: the text becomes a selection' : 'Click to add point text · Drag a box for paragraph text · Click a type layer to edit its text'),
  cursor: (ctx, p) => {
    const grab = p ? boxHit(ctx, p) : null;
    if (!grab) return 'text';
    const h = HANDLES[grab.handle];
    return h.x === 0.5 ? 'ns-resize' : h.y === 0.5 ? 'ew-resize' : h.x === h.y ? 'nwse-resize' : 'nesw-resize';
  },
  options: (e) => [
    { kind: 'title', text: 'Type' },
    { kind: 'select', label: 'Font', priority: 90, choices: fontChoices(e.textSettings.family), live: () => fontChoices(e.textSettings.family), get: () => e.textSettings.family, set: (v) => {
      // "Load system fonts..." asks for the machine's font list (a click is what lets the browser ask), then refreshes.
      if (v === SYSTEM_FONTS) { void loadSystemFonts().then(() => e.emit('options', null)); return; }
      setType(e, { family: v });
    } },
    { kind: 'number', label: 'Size', priority: 95, min: 1, max: 2000, unit: 'px', get: () => e.textSettings.size, set: (v) => setType(e, { size: Math.min(2000, Math.max(1, v)) }) },
    { kind: 'segment', label: 'Align', priority: 80, choices: [{ id: 'left', label: 'Left' }, { id: 'center', label: 'Centre' }, { id: 'right', label: 'Right' }, { id: 'justify', label: 'Justify' }], get: () => e.textSettings.align, set: (v) => setType(e, { align: v === 'justify' ? 'justify' : v === 'center' || v === 'right' ? v : 'left' }) },
    // Orientation: new text takes it, and so does the selected type layer when none is being typed.
    { kind: 'segment', label: 'Orientation', priority: 60, choices: [{ id: 'horizontal', label: 'Horizontal' }, { id: 'vertical', label: 'Vertical' }], get: () => e.textSettings.direction ?? 'horizontal',
      set: (v: string) => {
        const direction = v === 'vertical' ? 'vertical' : 'horizontal', l = e.activeLayer, typing = !!document.querySelector('.cv-type-editor:not([hidden])');
        setType(e, { direction });
        if (e.tool === 'type' && !typing && l?.text && e.liveText(l) && (l.text.direction ?? 'horizontal') !== direction) void e.updateTextLayer(l.id, { ...l.text, direction, ...(direction === 'vertical' ? { box: null } : {}) });
      } },
    // Font Style and Warp Text (1.50.3, the tool audit; Bold and Italic were two toggles).
    { kind: 'select', label: 'Font Style', priority: 85, choices: [{ id: 'regular', label: 'Regular' }, { id: 'italic', label: 'Italic' }, { id: 'bold', label: 'Bold' }, { id: 'bold-italic', label: 'Bold Italic' }],
      get: () => (e.textSettings.bold ? (e.textSettings.italic ? 'bold-italic' : 'bold') : e.textSettings.italic ? 'italic' : 'regular'),
      set: (v: string) => setType(e, { bold: v.startsWith('bold'), italic: v.endsWith('italic') }) },
    { kind: 'number', label: 'Leading', priority: 50, min: 0.5, max: 4, step: 0.05, unit: 'x', get: () => e.textSettings.lineHeight, set: (v) => setType(e, { lineHeight: Math.min(4, Math.max(0.5, v)) }) },
    // The usual units: tracking in thousandths of an em; kerning the font's own (Metrics) or none (0).
    { kind: 'number', label: 'Tracking', priority: 45, min: -1000, max: 10000, step: 10, unit: '', get: () => e.textSettings.tracking, set: (v) => setType(e, { tracking: Math.round(Math.min(10000, Math.max(-1000, v))) }) },
    { kind: 'select', label: 'Kerning', priority: 35, choices: [{ id: 'metrics', label: 'Metrics' }, { id: 'optical', label: 'Optical' }, { id: 'none', label: '0' }], get: () => e.textSettings.kerning, set: (v) => setType(e, { kerning: v === 'none' || v === 'optical' ? v : 'metrics' }) },
    // Anti-aliasing and the Color swatch (1.50.4, the tool audit); the swatch recolours the selected
    // type layer as well as setting the colour new text takes.
    { kind: 'select', label: 'OpenType', priority: 30, choices: featureChoices(e), live: () => featureChoices(e), get: () => '',
      set: (v: string) => {
        if (!v) return;
        const l = e.current?.activeLayer, typing = !!document.querySelector('.cv-type-editor:not([hidden])');
        if (l?.text && e.liveText(l) && !typing) {
          // One undo step on the selected layer; the settings for new text follow it.
          const features = withFeature(l.text.features, v, !featureOn(l.text.features, v));
          e.textSettings = { ...e.textSettings, features };
          e.emit('options', null);
          void e.updateTextLayer(l.id, { ...l.text, features }).then(() => e.emit('options', null));
          return;
        }
        setType(e, { features: withFeature(e.textSettings.features, v, !featureOn(e.textSettings.features, v)) });
      } },
    { kind: 'select', label: 'Anti-aliasing', priority: 40, choices: [{ id: 'none', label: 'None' }, { id: 'sharp', label: 'Sharp' }, { id: 'crisp', label: 'Crisp' }, { id: 'strong', label: 'Strong' }, { id: 'smooth', label: 'Smooth' }, { id: 'windows-lcd', label: 'Windows LCD' }, { id: 'windows', label: 'Windows' }], get: () => e.textSettings.antialias ?? 'smooth', set: (v: string) => setType(e, { antialias: TEXT_ANTIALIAS.find((m) => m === v) ?? 'smooth' }) },
    { kind: 'toggle', label: 'Hyphenate', priority: 25, get: () => !!e.textSettings.hyphenate, set: (v) => setType(e, { hyphenate: v }) },
    { kind: 'select', label: 'Language', priority: 22, choices: LANGUAGES.map(([id, label]) => ({ id, label })), get: () => e.textSettings.language ?? '', set: (v: string) => setType(e, { language: v || undefined }) },
    { kind: 'select', label: 'Language Options', priority: 21, choices: [{ id: 'default', label: 'Default Features' }, { id: 'eastAsian', label: 'East Asian Features' }, { id: 'middleEastern', label: 'Middle Eastern Features' }], get: () => e.textSettings.shaping ?? 'default', set: (v: string) => setType(e, { shaping: v === 'eastAsian' || v === 'middleEastern' ? v : undefined }) },
    { kind: 'color', label: 'Color', priority: 88, get: () => e.fg, set: (c) => { e.fg = c; e.emit('options', null); const l = e.activeLayer; if (l?.text) void e.updateTextLayer(l.id, { ...l.text, color: e.fg }); } },
    { kind: 'button', label: 'Warp Text...', priority: 30, run: () => toolHost.run('warp-text') },
  ],
  // A click starts point text (or edits the type layer under it); a drag draws a box for paragraph text (1.49.7).
  down(ctx, p) {
    if (p.button !== 0 || !ctx.engine.current) return;
    if (p.mod && typingNow()) { moveDrag = p.doc; return; }
    const grab = boxHit(ctx, p);
    if (grab) { const t = grab.layer.transform; boxDrag = { id: grab.layer.id, handle: grab.handle, from: { x: t.x, y: t.y, w: t.w, h: t.h }, start: p.doc, to: p.doc, scale: t.w / (grab.layer.raster?.width || t.w) }; return; }
    const hit = ctx.engine.typeMask ? null : ctx.engine.textLayerAt(p.doc);
    if (hit) { document.dispatchEvent(new CustomEvent('cv:type', { detail: { layerId: hit } })); return; }
    draft = { from: p.doc, to: p.doc };
  },
  move(ctx, p) {
    if (moveDrag) { document.dispatchEvent(new CustomEvent('cv:type-move', { detail: { x: p.doc.x - moveDrag.x, y: p.doc.y - moveDrag.y } })); moveDrag = p.doc; return; }
    if (boxDrag) { boxDrag.to = p.doc; ctx.engine.emit('overlay', null); return; }
    if (!draft) return;
    draft.to = p.doc;
    ctx.engine.emit('overlay', null);
  },
  up(ctx) {
    if (moveDrag) { moveDrag = null; return; }
    if (boxDrag) {
      const b = boxDrag, r = dragRect(b);
      boxDrag = null;
      if (Math.abs(r.w - b.from.w) < 1 && Math.abs(r.h - b.from.h) < 1 && Math.abs(r.x - b.from.x) < 1 && Math.abs(r.y - b.from.y) < 1) { ctx.engine.emit('overlay', null); return; }
      void ctx.engine.resizeTextBox(b.id, { w: r.w / b.scale, h: r.h / b.scale }, { x: r.x, y: r.y }).then(() => ctx.engine.emit('overlay', null));
      return;
    }
    const d = draft;
    draft = null;
    ctx.engine.emit('overlay', null);
    if (!d) return;
    const v = ctx.view(), a = v.toScreen(d.from), b = v.toScreen(d.to);
    if (Math.abs(b.x - a.x) < 8 || Math.abs(b.y - a.y) < 8) { document.dispatchEvent(new CustomEvent('cv:type', { detail: { x: d.from.x, y: d.from.y } })); return; }
    const x = Math.min(d.from.x, d.to.x), y = Math.min(d.from.y, d.to.y);
    document.dispatchEvent(new CustomEvent('cv:type', { detail: { x, y, box: { w: Math.abs(d.to.x - d.from.x), h: Math.abs(d.to.y - d.from.y) } } }));
  },
  cancel(ctx) { draft = null; boxDrag = null; moveDrag = null; ctx.engine.emit('overlay', null); },
  overlay(ctx, g) {
    const bl = boxLayer(ctx.engine);
    if (bl) {
      const v = ctx.view(), pal = ctx.paint(), t = bl.transform, r = boxDrag ? dragRect(boxDrag) : { x: t.x, y: t.y, w: t.w, h: t.h };
      const a = v.toScreen({ x: r.x, y: r.y }), b = v.toScreen({ x: r.x + r.w, y: r.y + r.h });
      g.save();
      g.strokeStyle = pal.accent;
      g.lineWidth = 1;
      g.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(b.x) - Math.round(a.x), Math.round(b.y) - Math.round(a.y));
      g.fillStyle = pal.handle;
      for (const h of HANDLES) {
        const x = Math.round(a.x + (b.x - a.x) * h.x), y = Math.round(a.y + (b.y - a.y) * h.y);
        g.fillRect(x - 4, y - 4, 8, 8);
        g.strokeRect(x - 3.5, y - 3.5, 7, 7);
      }
      g.restore();
    }
    if (!draft) return;
    const v = ctx.view(), a = v.toScreen(draft.from), b = v.toScreen(draft.to);
    dashed(ctx, g, () => { g.rect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(b.x - a.x), Math.abs(b.y - a.y)); });
  },
};
