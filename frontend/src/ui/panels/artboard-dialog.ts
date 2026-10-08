import type { Engine, RGB } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setHidden } from '../dom';
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

/** Layer > New > Artboard and Artboard from Group (1.65.4), as Photoshop's New Artboard dialogs: a name and a size,
 *  and for a new artboard its background; it goes where Layer > New > Artboard puts the next one, and a folder's
 *  over its contents. */
export class NewArtboardDialog extends Dialog {
  private group: string | null = null;
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="200" spellcheck="false">');
  private readonly w = numberRow('Width (px)', 1, 30000, 1, () => undefined);
  private readonly h = numberRow('Height (px)', 1, 30000, 1, () => undefined);
  private readonly bg = selectRow('Background', [['white', 'White'], ['black', 'Black'], ['none', 'Transparent']], () => undefined);

  constructor(private readonly engine: Engine) {
    super('New Artboard', 340);
    this.field('Name', this.name);
    this.body.append(this.w.el, this.h.el, this.bg.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    for (const input of [this.name, this.w.input, this.h.input]) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.apply(); } });
  }

  /** `fromGroup`: the active folder becomes the artboard (Artboard from Group). */
  show(fromGroup: boolean): void {
    const p = this.engine.current, l = p?.activeLayer;
    if (this.isOpen || !p) return;
    if (fromGroup && (!l?.isGroup || l.parentId || l.artboard || l.frame)) { this.engine.notice('Select a folder outside any other folder, artboard or frame first.'); return; }
    this.group = fromGroup && l ? l.id : null;
    const box = this.group ? this.engine.contentBounds(this.group) ?? { w: p.doc.width, h: p.doc.height } : this.engine.nextArtboardRect();
    this.setTitle(fromGroup ? 'New Artboard from Group' : 'New Artboard');
    this.name.value = this.group && l ? l.name : this.engine.nextArtboardName();
    this.w.set(box?.w ?? p.doc.width);
    this.h.set(box?.h ?? p.doc.height);
    this.bg.set('white');
    setHidden(this.bg.el, fromGroup);
    this.open(this.name);
    this.name.select();
  }

  private apply(): void {
    const w = Number(this.w.input.value), h = Number(this.h.input.value);
    if (!(w >= 1 && h >= 1)) return;
    const kind = (this.bg.el.querySelector('select') as HTMLSelectElement).value, name = this.name.value;
    this.close();
    if (this.group) { this.engine.artboardFromGroup(this.group, { name, w, h }); return; }
    const background = kind === 'none' ? null : kind === 'black' ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
    this.engine.newArtboard(this.engine.nextArtboardRect({ w: Math.round(Math.min(30000, w)), h: Math.round(Math.min(30000, h)) }), background, name);
  }
}
