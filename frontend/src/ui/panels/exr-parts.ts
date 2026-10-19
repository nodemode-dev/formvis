import type { ExrLayout, ExrPick } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

/** Open EXR Parts: which parts, channel groups (a prefix such as diffuse) and Cryptomatte objects of an OpenEXR become
 *  layers. Parts and groups start ticked, Cryptomatte objects (a matte each) start unticked. */
export class ExrPartsDialog extends Dialog {
  private readonly info = el('<p class="cv-note"></p>');
  private readonly list = el('<div class="cv-list" role="group" aria-label="Parts and channel groups"></div>');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  private rows: Array<{ box: HTMLInputElement; pick: ExrPick }> = [];
  private done: ((picks: ExrPick[] | null) => void) | null = null;

  constructor() {
    super('Open EXR Parts', 460);
    this.body.append(this.info, this.list, this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Open', 'primary', () => this.accept());
    this.onClose = () => { const d = this.done; this.done = null; d?.(null); };
  }

  /** Resolves with the ticked groups, or null when cancelled. */
  ask(name: string, layout: ExrLayout): Promise<ExrPick[] | null> {
    this.rows = [];
    const frag = document.createDocumentFragment();
    const add = (label: string, meta: string, pick: ExrPick, on: boolean): void => {
      const row = el<HTMLLabelElement>('<label class="cv-list-row"><input type="checkbox"><span class="cv-list-name"></span><span class="cv-list-meta"></span></label>');
      const box = row.querySelector('input') as HTMLInputElement;
      box.checked = on;
      setText(row.children[1], label); setText(row.children[2], meta);
      frag.append(row);
      this.rows.push({ box, pick });
    };
    const names = (n: number): string => (n === 1 ? 'grey' : n === 2 ? '2 channels' : n === 3 ? 'RGB' : 'RGBA');
    for (const p of layout.parts) for (const g of p.groups) add(layout.parts.length > 1 && g.label !== p.name ? `${p.name} · ${g.label}` : g.label, names(g.channels), { part: p.part, key: g.key }, true);
    for (const c of layout.crypto) for (const o of c.objects) add(`${c.name} · ${o}`, 'matte', { crypto: c.name, object: o }, false);
    this.list.replaceChildren(frag);
    setText(this.info, `${name} holds ${layout.parts.reduce((n, p) => n + p.groups.length, 0)} channel groups${layout.crypto.length ? ` and ${layout.crypto.reduce((n, c) => n + c.objects.length, 0)} Cryptomatte objects` : ''}. Tick what opens as layers.`);
    setText(this.note, '');
    this.open();
    return new Promise((resolve) => { this.done = resolve; });
  }

  private accept(): void {
    const picks = this.rows.filter((r) => r.box.checked).map((r) => r.pick);
    if (!picks.length) { setText(this.note, 'Tick at least one part or group.'); return; }
    const d = this.done;
    this.done = null;
    this.close();
    d?.(picks);
  }
}
