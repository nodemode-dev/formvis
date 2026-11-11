import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { COLOURS, UNITS, pixelsPer } from './guide-dialog';

/** View > Guides > New Guide Layout (27.11): columns, rows, gutters and margins in pixels, and whether to clear the
 *  existing guides. Built hidden, filled, then opened once; the values are remembered between uses. */
export function openGuideLayout(engine: Engine): void {
  if (!engine.current) return;
  const dlg = new Dialog('New Guide Layout', 440);
  const num = (name: string, value: number, min: number): HTMLInputElement => {
    const i = document.createElement('input');
    i.type = 'number'; i.min = String(min); i.step = '1'; i.value = String(value); i.name = name; i.className = 'cv-input';
    return i;
  };
  const box = (name: string, on: boolean): HTMLInputElement => { const i = document.createElement('input'); i.type = 'checkbox'; i.name = name; i.checked = on; return i; };
  const columns = num('columns', 8, 0), gutterX = num('gutterX', 20, 0), rows = num('rows', 0, 0), gutterY = num('gutterY', 20, 0);
  const top = num('top', 0, 0), left = num('left', 0, 0), bottom = num('bottom', 0, 0), right = num('right', 0, 0), clear = box('clear', true);
  const columnWidth = num('columnWidth', 0, 0), rowHeight = num('rowHeight', 0, 0), centre = box('centre', false);
  const pick = (name: string, options: ReadonlyArray<readonly [string, string]>): HTMLSelectElement => {
    const s = document.createElement('select');
    s.name = name; s.className = 'cv-input';
    for (const [value, text] of options) { const o = document.createElement('option'); o.value = value; o.textContent = text; s.append(o); }
    return s;
  };
  const units = pick('units', UNITS), tint = pick('color', COLOURS), target = pick('target', [['canvas', 'Canvas'], ['artboard', 'Active artboard']]);
  if (engine.artboards().length) dlg.field('Target', target);
  dlg.field('Units', units);
  dlg.field('Color', tint);
  dlg.field('Columns', columns);
  dlg.field('Column width (0 fits the space)', columnWidth);
  dlg.field('Column gutter', gutterX);
  dlg.field('Rows', rows);
  dlg.field('Row height (0 fits the space)', rowHeight);
  dlg.field('Row gutter', gutterY);
  dlg.field('Center columns and rows', centre).classList.add('cv-check');
  dlg.field('Top margin', top);
  dlg.field('Left margin', left);
  dlg.field('Bottom margin', bottom);
  dlg.field('Right margin', right);
  dlg.field('Clear existing guides', clear).classList.add('cv-check');
  dlg.remember();
  const v = (i: HTMLInputElement): number => (Number.isFinite(i.valueAsNumber) ? Math.max(0, i.valueAsNumber) : 0);
  dlg.button('Cancel', 'ghost', () => dlg.close());
  dlg.onClose = () => dlg.scrim.remove();
  dlg.button('OK', 'primary', () => {
    const d = engine.current?.doc, art = target.value === 'artboard' ? engine.guideArtboard?.artboard : null;
    const px = (i: HTMLInputElement, axis: 'x' | 'y'): number => (d ? v(i) * pixelsPer(units.value, d.resolution, axis === 'x' ? art?.w ?? d.width : art?.h ?? d.height) : v(i));
    engine.guideLayout({ columns: v(columns), rows: v(rows), gutterX: px(gutterX, 'x'), gutterY: px(gutterY, 'y'), margin: { top: px(top, 'y'), left: px(left, 'x'), bottom: px(bottom, 'y'), right: px(right, 'x') }, clear: clear.checked, columnWidth: px(columnWidth, 'x'), rowHeight: px(rowHeight, 'y'), centre: centre.checked, color: tint.value || undefined, artboard: !!art });
    if (!engine.view.guides) engine.setView({ guides: true });
    dlg.close();
  });
  dlg.open(columns);
}
