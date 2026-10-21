import type { ExrLayout, ExrPick } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

/** Open EXR Parts: which parts, channel groups (a prefix such as diffuse) and Cryptomatte objects of an OpenEXR become
 *  layers. Parts and groups start ticked, Cryptomatte objects (a matte each) start unticked. */
export class ExrPartsDialog extends Dialog {
  private readonly info = el('<p class="cv-note"></p>');
  private readonly list = el('<div class="cv-list" role="group" aria-label="Parts and channel groups"></div>');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  private readonly viewRow = el<HTMLLabelElement>('<label class="cv-list-row" hidden><span class="cv-list-name">Stereo view</span><select aria-label="Stereo view"></select></label>');
  private readonly viewPick = this.viewRow.querySelector('select') as HTMLSelectElement;
  private readonly beautyRow = el<HTMLLabelElement>('<label class="cv-list-row"><input type="checkbox"><span class="cv-list-name">Add a Beauty layer: the ticked color groups added together</span></label>');
  private readonly beauty = this.beautyRow.querySelector('input') as HTMLInputElement;
  private rows: Array<{ row: HTMLElement; box: HTMLInputElement; pick: ExrPick; view: string; colour: boolean }> = [];
  private done: ((picks: ExrPick[] | null) => void) | null = null;

  constructor() {
    super('Open EXR Parts', 460);
    this.body.append(this.info, this.viewRow, this.list, this.beautyRow, this.note);
    this.viewPick.addEventListener('change', () => this.showView());
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Open', 'primary', () => this.accept());
    this.onClose = () => { const d = this.done; this.done = null; d?.(null); };
  }

  /** Resolves with the ticked groups, or null when cancelled. */
  ask(name: string, layout: ExrLayout): Promise<ExrPick[] | null> {
    this.rows = [];
    const frag = document.createDocumentFragment();
    const add = (label: string, meta: string, pick: ExrPick, on: boolean, view = '', colour = false): void => {
      const row = el<HTMLLabelElement>('<label class="cv-list-row"><input type="checkbox"><span class="cv-list-name"></span><span class="cv-list-meta"></span></label>');
      const box = row.querySelector('input') as HTMLInputElement;
      box.checked = on;
      setText(row.children[1], label); setText(row.children[2], meta);
      frag.append(row);
      this.rows.push({ row, box, pick, view, colour });
    };
    const names = (n: number): string => (n === 1 ? 'gray' : n === 2 ? '2 channels' : n === 3 ? 'RGB' : 'RGBA');
    for (const p of layout.parts) for (const g of p.groups) add(layout.parts.length > 1 && g.label !== p.name ? `${p.name} · ${g.label}` : g.label, names(g.channels), { part: p.part, key: g.key }, true, g.view ?? '', g.channels >= 3);
    for (const c of layout.crypto) for (const o of c.objects) add(`${c.name} · ${o}`, 'matte', { crypto: c.name, object: o }, false);
    this.list.replaceChildren(frag);
    const views = layout.views ?? [];
    this.viewPick.replaceChildren(...['All views', ...views].map((v, k) => { const o = document.createElement('option'); o.value = k ? v : ''; o.textContent = v; return o; }));
    this.viewRow.hidden = views.length < 2;
    this.beauty.checked = false;
    this.showView();
    setText(this.info, `${name} holds ${layout.parts.reduce((n, p) => n + p.groups.length, 0)} channel groups${layout.crypto.length ? ` and ${layout.crypto.reduce((n, c) => n + c.objects.length, 0)} Cryptomatte objects` : ''}. Tick what opens as layers.`);
    setText(this.note, '');
    this.open();
    return new Promise((resolve) => { this.done = resolve; });
  }

  private showView(): void {
    const v = this.viewPick.value;
    for (const r of this.rows) r.row.hidden = !!v && !!r.view && r.view !== v;
  }

  private accept(): void {
    const shown = this.rows.filter((r) => !r.row.hidden && r.box.checked);
    const picks = shown.map((r) => r.pick);
    const light = shown.filter((r) => r.colour && 'part' in r.pick).map((r) => r.pick as { part: number; key: string });
    if (this.beauty.checked && light.length >= 2) picks.push({ sum: light, name: 'Beauty' });
    else if (this.beauty.checked) { setText(this.note, 'A Beauty layer needs two or more ticked color groups.'); return; }
    if (!picks.length) { setText(this.note, 'Tick at least one part or group.'); return; }
    const d = this.done;
    this.done = null;
    this.close();
    d?.(picks);
  }
}
