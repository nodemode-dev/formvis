import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el } from '../dom';

/** Image > Mode > Merge Channels: pick the grey that becomes red, green and blue, from open documents of the current size, and open the result as a new RGB document. */
export class MergeChannelsDialog extends Dialog {
  private readonly pick = [el<HTMLSelectElement>('<select class="cv-input" aria-label="Red"></select>'), el<HTMLSelectElement>('<select class="cv-input" aria-label="Green"></select>'), el<HTMLSelectElement>('<select class="cv-input" aria-label="Blue"></select>')];

  constructor(private readonly engine: Engine) {
    super('Merge Channels', 380);
    ['Red', 'Green', 'Blue'].forEach((label, i) => this.field(label, this.pick[i]));
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
  }

  show(): void {
    const cur = this.engine.current;
    if (this.isOpen || !cur) return;
    const items: Array<[string, string]> = [];
    for (const d of this.engine.alphaDocuments()) {
      if (d.doc.width !== cur.doc.width || d.doc.height !== cur.doc.height) continue;
      items.push([`${d.id}|`, d.name]);
      for (const a of d.doc.alphas ?? []) items.push([`${d.id}|${a.name}`, `${d.name} / ${a.name}`]);
    }
    if (!items.length) return;
    this.pick.forEach((s, i) => {
      s.replaceChildren(...items.map(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; }));
      s.selectedIndex = Math.min(i, items.length - 1);
    });
    this.open(this.pick[0]);
  }

  private apply(): void {
    const sources = this.pick.map((s) => { const [doc, ...rest] = s.value.split('|'); return { doc, channel: rest.join('|') || undefined }; });
    this.close();
    this.engine.mergeChannels(sources);
  }
}
