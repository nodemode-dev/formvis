import type { Engine, Project, SelectionMode } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setDisabled, setText } from '../dom';
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
  return out;
}

const select = (html = ''): HTMLSelectElement => el<HTMLSelectElement>(`<select class="cv-input">${html}</select>`);

/** Select > Save Selection, as Photoshop's dialog: the document, a new channel or one to change, its name and how. */
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

/** Select > Load Selection, as Photoshop's dialog: the document and channel, Invert, and how it joins the selection. */
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
