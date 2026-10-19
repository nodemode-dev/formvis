import type { Engine, Project, SelectionMode } from '../../engine';
import { Dialog } from '../dialogs';
import { el, q, setDisabled, setText } from '../dom';
import { checkRow } from './controls';

/** Keeps a select's options in step with `items`, changing only what differs. */
function syncOptions(sel: HTMLSelectElement, items: ReadonlyArray<readonly [string, string]>): void {
  while (sel.options.length > items.length) sel.remove(sel.options.length - 1);
  items.forEach(([value, label], i) => {
    let o = sel.options[i];
    if (!o) { o = document.createElement('option'); sel.appendChild(o); }
    if (o.value !== value) o.value = value;
    if (o.textContent !== label) o.textContent = label;
  });
}

/** What Load Selection can load from document `p`: its alpha channels, then its active layer's transparency and mask. */
export function loadSources(p: Project): Array<[string, string]> {
  const l = p.activeLayer, out = (p.doc.alphas ?? []).map((a): [string, string] => [a.id, a.name]);
  if (l && !l.isGroup && (l.raster || l.adjustment)) out.push(['transparency', `${l.name} Transparency`]);
  if (l?.mask) out.push(['mask', `${l.name} Mask`]);
  if (l?.vectorMask) out.push(['vector', `${l.name} Vector Mask`]);
  return out;
}

const select = (html = ''): HTMLSelectElement => el<HTMLSelectElement>(`<select class="cv-input">${html}</select>`);

/** Select > Save Selection: the document, a new channel or one to change, its name and how. */
export class SaveSelectionDialog extends Dialog {
  private readonly doc = select();
  private readonly channel = select();
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="200" spellcheck="false" placeholder="Alpha">');
  private readonly op = select('<option value="replace">New Channel</option><option value="add">Add to Channel</option><option value="subtract">Subtract from Channel</option><option value="intersect">Intersect with Channel</option>');

  constructor(private readonly engine: Engine) {
    super('Save Selection', 380);
    this.field('Document', this.doc);
    this.field('Channel', this.channel);
    this.field('Name', this.name);
    this.field('Operation', this.op);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.doc.addEventListener('change', () => this.sync());
    this.channel.addEventListener('change', () => this.sync());
    this.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.apply(); } });
  }

  show(): void {
    const p = this.engine.current;
    if (this.isOpen || !p?.selection) return;
    syncOptions(this.doc, this.engine.alphaDocuments().map((d): [string, string] => [d.id, d.name]));
    this.doc.value = p.id;
    this.name.value = '';
    this.sync('new');
    this.open(this.name);
  }

  private target(): Project | undefined { return this.engine.alphaDocuments().find((d) => d.id === this.doc.value); }

  private sync(pick = this.channel.value): void {
    syncOptions(this.channel, [['new', 'New'], ...(this.target()?.doc.alphas ?? []).map((a): [string, string] => [a.id, a.name])]);
    this.channel.value = [...this.channel.options].some((o) => o.value === pick) ? pick : 'new';
    const fresh = this.channel.value === 'new';
    setDisabled(this.name, !fresh);
    setDisabled(this.op, fresh);
    if (fresh) this.op.value = 'replace';
    setText(this.op.options[0], fresh ? 'New Channel' : 'Replace Channel');
  }

  private apply(): void {
    const q = this.target();
    if (!q) return;
    this.close();
    const fresh = this.channel.value === 'new';
    this.engine.saveSelection({ doc: q.id, channel: fresh ? null : this.channel.value, name: fresh ? this.name.value : '', op: this.op.value as SelectionMode });
  }
}

/** Select > Load Selection: the document and channel, Invert, and how it joins the selection. */
export class LoadSelectionDialog extends Dialog {
  private readonly doc = select();
  private readonly channel = select();
  private inverted = false;
  private readonly invert = checkRow('Invert', (v) => { this.inverted = v; });
  private readonly op = select('<option value="replace">New Selection</option><option value="add">Add to Selection</option><option value="subtract">Subtract from Selection</option><option value="intersect">Intersect with Selection</option>');

  constructor(private readonly engine: Engine) {
    super('Load Selection', 380);
    this.field('Document', this.doc);
    this.field('Channel', this.channel);
    this.body.append(this.invert.el);
    this.field('Operation', this.op);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.doc.addEventListener('change', () => this.sync());
    this.remember([this.doc, this.channel]);   // the document and channel are this document's; Invert and how it joins are kept
  }

  show(): void {
    const p = this.engine.current;
    if (this.isOpen || !p) return;
    syncOptions(this.doc, this.engine.alphaDocuments().map((d): [string, string] => [d.id, d.name]));
    this.doc.value = p.id;
    this.sync();
    this.channel.selectedIndex = 0;
    this.inverted = false;
    this.invert.set(false);
    for (const o of [...this.op.options].slice(1)) if (o.disabled !== !p.selection) o.disabled = !p.selection;
    this.op.value = 'replace';
    this.open(this.channel);
  }

  private target(): Project | undefined { return this.engine.alphaDocuments().find((d) => d.id === this.doc.value); }

  private sync(): void {
    const q = this.target(), was = this.channel.value, items = q ? loadSources(q) : [];
    syncOptions(this.channel, items);
    if (items.some(([v]) => v === was)) this.channel.value = was;
  }

  private apply(): void {
    const q = this.target(), channel = this.channel.value;
    if (!q || !channel) return;
    this.close();
    this.engine.loadSelection({ doc: q.id, channel }, this.inverted, this.op.value as SelectionMode);
  }
}

const hex2 = (v: number): string => v.toString(16).padStart(2, '0');

/** Channels > Channel Options: name, what the colour indicates, the colour and its opacity. */
export class ChannelOptionsDialog extends Dialog {
  private id = '';
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="200" spellcheck="false" aria-label="Channel name">');
  private readonly kind = select('<option value="alpha">Alpha Channel</option><option value="spot">Spot Channel</option>');
  private readonly indicates = select('<option value="masked">Masked Areas</option><option value="selected">Selected Areas</option>');
  private readonly color = el<HTMLInputElement>('<input class="cv-input cv-color" type="color" aria-label="Overlay colour">');
  private readonly opacity = el<HTMLInputElement>('<input class="cv-input" type="number" min="0" max="100" step="1" aria-label="Opacity in percent">');
  private readonly opacityLabel: HTMLElement;
  private readonly colorLabel: HTMLElement;

  constructor(private readonly engine: Engine) {
    super('Channel Options', 340);
    this.field('Name', this.name);
    this.field('Type', this.kind);
    this.field('Color Indicates', this.indicates);
    this.colorLabel = q(this.field('Color', this.color), 'span');
    this.opacityLabel = q(this.field('Opacity (%)', this.opacity), 'span');
    this.kind.addEventListener('change', () => this.sync());
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.apply(); } });
  }

  show(id: string): void {
    const a = this.engine.current?.doc.alphas?.find((x) => x.id === id);
    if (this.isOpen || !a) return;
    this.id = id;
    this.name.value = a.name;
    this.kind.value = a.spot ? 'spot' : 'alpha';
    this.indicates.value = a.indicates ?? 'masked';
    const k = a.color ?? { r: 255, g: 0, b: 0 };
    this.color.value = `#${hex2(k.r)}${hex2(k.g)}${hex2(k.b)}`;
    this.opacity.value = String(a.opacity ?? 50);
    this.sync();
    this.open(this.name);
    this.name.select();
  }

  private sync(): void {
    const spot = this.kind.value === 'spot';
    if (spot) this.indicates.value = 'selected';
    setDisabled(this.indicates, spot);
    setText(this.colorLabel, spot ? 'Ink Color' : 'Color');
    setText(this.opacityLabel, spot ? 'Solidity (%)' : 'Opacity (%)');
  }

  private apply(): void {
    const v = this.color.value, n = this.opacity.valueAsNumber;
    this.close();
    this.engine.setAlphaOptions(this.id, { name: this.name.value, spot: this.kind.value === 'spot', indicates: this.indicates.value as 'masked' | 'selected', color: { r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16) }, opacity: Number.isFinite(n) ? n : 50 });
  }
}
