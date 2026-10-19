import type { Engine } from '../engine';
import { Dialog } from './dialogs';

/** View > Show > Slice Options: the active slice's name, URL, alt text and exact rectangle. The dialog is built hidden,
 *  filled, then opened once. Returns false when there is no active slice. */
export function openSliceOptions(engine: Engine): boolean {
  const slice = engine.current?.doc.slices?.find((s) => s.id === engine.activeSlice);
  if (!slice) return false;
  const dlg = new Dialog('Slice Options', 420);
  const text = (value: string): HTMLInputElement => { const i = document.createElement('input'); i.type = 'text'; i.value = value; i.className = 'cv-input'; return i; };
  const num = (value: number): HTMLInputElement => { const i = document.createElement('input'); i.type = 'number'; i.step = '1'; i.value = String(value); i.className = 'cv-input'; return i; };
  const name = text(slice.name), url = text(slice.url ?? ''), alt = text(slice.alt ?? ''), x = num(slice.x), y = num(slice.y), w = num(slice.w), h = num(slice.h);
  const kind = document.createElement('select');
  kind.className = 'cv-select';
  for (const [v, label] of [['image', 'Image'], ['none', 'No Image']] as const) { const o = document.createElement('option'); o.value = v; o.textContent = label; kind.appendChild(o); }
  kind.value = slice.kind === 'none' ? 'none' : 'image';
  const target = text(slice.target ?? ''), message = text(slice.message ?? ''), cell = text(slice.cell ?? ''), bg = text(slice.bg ?? '');
  target.placeholder = '_blank, _self, ...'; bg.placeholder = '#rrggbb, empty for none';
  dlg.field('Slice type', kind);
  dlg.field('Name', name);
  dlg.field('URL', url);
  dlg.field('Target', target);
  dlg.field('Message text', message);
  dlg.field('Alt text', alt);
  dlg.field('Cell text', cell);
  dlg.field('Background', bg);
  dlg.field('X', x);
  dlg.field('Y', y);
  dlg.field('Width', w);
  dlg.field('Height', h);
  const value = (i: HTMLInputElement, fallback: number): number => (Number.isFinite(i.valueAsNumber) ? i.valueAsNumber : fallback);
  dlg.button('Cancel', 'ghost', () => dlg.close());
  dlg.button('OK', 'primary', () => {
    const colour = /^#[0-9a-fA-F]{6}$/.test(bg.value.trim()) ? bg.value.trim() : undefined;
    engine.updateSlice(slice.id, { name: name.value, url: url.value, alt: alt.value, kind: kind.value === 'none' ? 'none' : undefined, target: target.value.trim() || undefined, message: message.value || undefined, cell: cell.value || undefined, bg: colour, x: value(x, slice.x), y: value(y, slice.y), w: value(w, slice.w), h: value(h, slice.h) });
    dlg.close();
  });
  dlg.open(name);
  return true;
}
