import type { Engine, RGB } from '../../engine';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { numberRow, selectRow } from './controls';

const hex = (c: RGB): string => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const fromHex = (h: string): RGB => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });

/** Layer > Artboard Options: the active artboard's position, size and background (White, Black, Transparent or a
 *  colour), as in Photoshop's Artboard properties. OK applies them as one step. */
export class ArtboardDialog extends Dialog {
  private id: string | null = null;
  private readonly x = numberRow('X (px)', -30000, 30000, 1, () => undefined);
  private readonly y = numberRow('Y (px)', -30000, 30000, 1, () => undefined);
  private readonly w = numberRow('Width (px)', 1, 30000, 1, () => undefined);
  private readonly h = numberRow('Height (px)', 1, 30000, 1, () => undefined);
  private readonly bg = selectRow('Background', [['white', 'White'], ['black', 'Black'], ['none', 'Transparent'], ['custom', 'Custom']], () => this.syncColour());
  private readonly colour = el<HTMLInputElement>('<input class="cv-input" type="color" value="#ffffff">');

  constructor(private readonly engine: Engine) {
    super('Artboard Options', 340);
    this.body.append(this.x.el, this.y.el, this.w.el, this.h.el, this.bg.el);
    this.field('Colour', this.colour);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
  }

  private syncColour(): void { this.colour.disabled = (this.bg.el.querySelector('select') as HTMLSelectElement).value !== 'custom'; }

  show(): void {
    const l = this.engine.current?.activeLayer;
    if (this.isOpen) return;
    if (!l?.artboard) { this.engine.notice('Select an artboard first (Layer > New > Artboard makes one).'); return; }
    this.id = l.id;
    const a = l.artboard, b = a.background;
    this.x.set(a.x); this.y.set(a.y); this.w.set(a.w); this.h.set(a.h);
    const kind = !b ? 'none' : b.r === 255 && b.g === 255 && b.b === 255 ? 'white' : b.r === 0 && b.g === 0 && b.b === 0 ? 'black' : 'custom';
    this.bg.set(kind);
    this.colour.value = hex(b ?? { r: 255, g: 255, b: 255 });
    this.syncColour();
    this.open(this.w.input);
  }

  private apply(): void {
    const v = (r: { input: HTMLInputElement }): number => Number(r.input.value);
    const kind = (this.bg.el.querySelector('select') as HTMLSelectElement).value;
    const background = kind === 'none' ? null : kind === 'white' ? { r: 255, g: 255, b: 255 } : kind === 'black' ? { r: 0, g: 0, b: 0 } : fromHex(this.colour.value);
    if (![v(this.x), v(this.y), v(this.w), v(this.h)].every(Number.isFinite)) return;
    this.close();
    if (this.id) this.engine.setArtboard(this.id, { x: v(this.x), y: v(this.y), w: v(this.w), h: v(this.h), background });
  }
}
