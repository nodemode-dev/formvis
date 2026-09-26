import type { Engine, TextSpec } from '../../engine';
import { canListSystemFonts, fontFamilies, loadSystemFonts } from '../../ui/fonts';
import type { Tool } from '../registry';

const SYSTEM_FONTS = '__system-fonts';

/** The font menu: this machine's families (the current one kept if it came from elsewhere, as a Photoshop file), and
 *  "Load system fonts..." where the browser can list them. */
function fontChoices(current: string): Array<{ id: string; label: string }> {
  const list = fontFamilies();
  if (current && !list.includes(current)) list.push(current);
  return [...list.map((f) => ({ id: f, label: f })), ...(canListSystemFonts() ? [{ id: SYSTEM_FONTS, label: 'Load system fonts...' }] : [])];
}

/** Changes the Type settings, shows them in the options bar, and restyles text being typed. */
export function setType(e: Engine, patch: Partial<TextSpec>): void {
  e.textSettings = { ...e.textSettings, ...patch };
  e.emit('options', null);
  document.dispatchEvent(new CustomEvent('cv:type-settings'));
}

/** Type (T): click a type layer to edit its text on the canvas, or anywhere else to start new text whose first
 *  baseline begins at the click. The tool announces where; the app's text editor does the typing. */
export const typeTool: Tool = {
  id: 'type', label: 'Type', key: 'T', order: 78,
  icon: () => 'typeTool',
  hint: () => 'Click to add text on a new type layer · Click a type layer to edit its text',
  cursor: () => 'text',
  options: (e) => [
    { kind: 'title', text: 'Type' },
    { kind: 'select', label: 'Font', choices: fontChoices(e.textSettings.family), live: () => fontChoices(e.textSettings.family), get: () => e.textSettings.family, set: (v) => {
      // "Load system fonts..." asks for the machine's font list (a click is what lets the browser ask), then refreshes.
      if (v === SYSTEM_FONTS) { void loadSystemFonts().then(() => e.emit('options', null)); return; }
      setType(e, { family: v });
    } },
    { kind: 'number', label: 'Size', min: 1, max: 2000, unit: 'px', get: () => e.textSettings.size, set: (v) => setType(e, { size: Math.min(2000, Math.max(1, v)) }) },
    { kind: 'segment', label: 'Align', choices: [{ id: 'left', label: 'Left' }, { id: 'center', label: 'Centre' }, { id: 'right', label: 'Right' }], get: () => e.textSettings.align, set: (v) => setType(e, { align: v === 'center' || v === 'right' ? v : 'left' }) },
    { kind: 'toggle', label: 'Bold', get: () => e.textSettings.bold, set: (v) => setType(e, { bold: v }) },
    { kind: 'toggle', label: 'Italic', get: () => e.textSettings.italic, set: (v) => setType(e, { italic: v }) },
    { kind: 'number', label: 'Leading', min: 0.5, max: 4, step: 0.05, unit: 'x', get: () => e.textSettings.lineHeight, set: (v) => setType(e, { lineHeight: Math.min(4, Math.max(0.5, v)) }) },
    // Photoshop's units: tracking in thousandths of an em; kerning the font's own (Metrics) or none (0).
    { kind: 'number', label: 'Tracking', min: -1000, max: 10000, step: 10, unit: '', get: () => e.textSettings.tracking, set: (v) => setType(e, { tracking: Math.round(Math.min(10000, Math.max(-1000, v))) }) },
    { kind: 'select', label: 'Kerning', choices: [{ id: 'metrics', label: 'Metrics' }, { id: 'none', label: '0' }], get: () => e.textSettings.kerning, set: (v) => setType(e, { kerning: v === 'none' ? 'none' : 'metrics' }) },
  ],
  down(ctx, p) {
    if (p.button !== 0 || !ctx.engine.current) return;
    const hit = ctx.engine.textLayerAt(p.doc);
    document.dispatchEvent(new CustomEvent('cv:type', { detail: hit ? { layerId: hit } : { x: p.doc.x, y: p.doc.y } }));
  },
};
