import type { Engine } from '../engine';
import type { LayerComp } from '../engine/types';
import { el, patchList, q, setHidden, setText } from './dom';
import { icon } from './icons';

type Row = { key: string; id: string; name: string; comment: string };

/** The Layer Comps panel (Window > Layer Comps, DEV_PLAN 33.3 part b): "Last Document State" on top, then one
 *  fixed-height row per comp. The square on the left marks the active comp and applies one when clicked; a double
 *  click on the name renames it; the chevron shows the comment. Rows are patched in place by comp id. */
export class LayerCompsPanel {
  private readonly rows: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly count: HTMLElement;
  private readonly foot: HTMLButtonElement[];
  private readonly open = new Set<string>();
  /** The row picked by a click; kept here, not in the doc. Without a valid pick the active comp is the target. */
  private selected: string | null = null;

  private target(): string | null {
    const d = this.engine.current?.doc;
    return this.selected && d?.comps?.some((c) => c.id === this.selected) ? this.selected : d?.activeComp ?? null;
  }

  constructor(root: HTMLElement, private readonly engine: Engine) {
    const btn = (cmd: string, title: string, glyph: string): string => `<button class="cv-icon-btn" type="button" data-act="${cmd}" title="${title}" aria-label="${title}">${icon(glyph, 16)}</button>`;
    root.insertAdjacentHTML('beforeend',
      `<section class="cv-layer-comps" aria-label="Layer Comps">` +
      `<div class="cv-panel-head"><span class="cv-comps-title">${icon('layers', 14)}<span>Layer Comps</span></span><span></span><span class="cv-comps-count"></span></div>` +
      `<div class="cv-comps-list" role="listbox" aria-label="Layer Comps"><div class="cv-comp-row cv-comp-state" role="option"><span class="cv-comp-mark"></span><span class="cv-comp-name">Last Document State</span></div>` +
      `<div class="cv-comps-empty">No layer comps yet. Use New to record the current state.</div></div>` +
      `<div class="cv-panel-foot">${btn('previous', 'Previous comp', 'chevronLeft')}${btn('next', 'Next comp', 'chevronRight')}${btn('update', 'Update the selected comp', 'refresh')}${btn('new', 'New layer comp', 'add')}${btn('delete', 'Delete the selected comp', 'delete')}</div></section>`);
    const section = q(root, '.cv-layer-comps');
    this.rows = q(section, '.cv-comps-list');
    this.empty = q(section, '.cv-comps-empty');
    this.count = q(section, '.cv-comps-count');
    this.foot = Array.from(section.querySelectorAll<HTMLButtonElement>('.cv-panel-foot [data-act]'));
    section.querySelector('.cv-panel-foot')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
      if (!b || b.disabled) return;
      const id = this.target();
      switch (b.dataset.act) {
        case 'previous': this.engine.nextLayerComp(-1); break;
        case 'next': this.engine.nextLayerComp(1); break;
        case 'update': if (id) this.engine.updateLayerComp(id); break;
        case 'delete': if (id) this.engine.deleteLayerComp(id); break;
        case 'new': this.engine.newLayerComp(); break;
      }
    });
    this.rows.addEventListener('click', (e) => {
      const t = e.target as HTMLElement, row = t.closest<HTMLElement>('.cv-comp-row[data-id]');
      if (!row) { if (t.closest('.cv-comp-state')) { this.selected = null; this.engine.clearLayerComp(); this.sync(); } return; }
      const id = row.dataset.id!;
      if (t.closest('.cv-comp-twist')) { if (this.open.has(id)) this.open.delete(id); else this.open.add(id); this.sync(); return; }
      this.selected = id;
      if (t.closest('.cv-comp-mark')) this.engine.applyLayerComp(id);
      this.sync();
    });
    this.rows.addEventListener('dblclick', (e) => {
      const t = e.target as HTMLElement, row = t.closest<HTMLElement>('.cv-comp-row[data-id]');
      if (!row || t.closest('.cv-comp-twist') || t.closest('.cv-comp-edit')) return;
      const name = t.closest<HTMLElement>('.cv-comp-name');
      if (name) this.rename(row, name);
      else { this.selected = row.dataset.id!; this.engine.applyLayerComp(this.selected); this.sync(); }
    });
    for (const ev of ['doc', 'history', 'active', 'projects'] as const) engine.on(ev, () => this.sync());
    this.sync();
  }

  private rename(row: HTMLElement, name: HTMLElement): void {
    const id = row.dataset.id!, was = name.textContent ?? '';
    const input = el<HTMLInputElement>(`<input class="cv-comp-edit" type="text" maxlength="80" aria-label="Comp name">`);
    input.value = was;
    name.hidden = true;
    name.after(input);
    input.focus(); input.select();
    let done = false;
    const finish = (keep: boolean): void => {
      if (done) return;
      done = true;
      const next = input.value.trim();
      input.remove(); name.hidden = false;
      if (keep && next && next !== was) this.engine.renameLayerComp(id, next);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); e.stopPropagation(); });
    input.addEventListener('blur', () => finish(true));
  }

  private sync(): void {
    const d = this.engine.current?.doc, comps: readonly LayerComp[] = d?.comps ?? [], active = d?.activeComp ?? null, picked = this.target();
    setText(this.count, comps.length ? String(comps.length) : '');
    setHidden(this.empty, comps.length > 0 || !d);
    const state = q(this.rows, '.cv-comp-state');
    state.classList.toggle('is-active', !active);
    this.foot.forEach((b) => {
      const a = b.dataset.act;
      b.disabled = !d || (a === 'previous' || a === 'next' ? comps.length === 0 : a === 'update' || a === 'delete' ? !picked : false);
    });
    const list: Row[] = comps.map((c) => ({ key: c.id, id: c.id, name: c.name, comment: c.comment }));
    for (const id of [...this.open]) if (!comps.some((c) => c.id === id)) this.open.delete(id);
    patchList<Row>(this.rows, list, {
      key: (r) => r.key,
      create: (r) => {
        const row = el(`<div class="cv-comp-row" role="option"><span class="cv-comp-mark" title="Apply this comp"></span><span class="cv-comp-name"></span><button class="cv-comp-twist" type="button" title="Show the comment" aria-label="Comment">${icon('chevronDown', 12)}</button><div class="cv-comp-comment"></div></div>`);
        this.fill(row, r, active, picked);
        return row;
      },
      update: (row, r) => this.fill(row, r, active, picked),
    });
    // The state row and empty line stay first; rows after them are kept in comp order by patchList.
  }

  private fill(row: HTMLElement, r: Row, active: string | null, picked: string | null): void {
    row.dataset.id = r.id;
    setText(q(row, '.cv-comp-name'), r.name);
    setText(q(row, '.cv-comp-comment'), r.comment || 'No comment.');
    row.classList.toggle('is-active', r.id === active);
    row.classList.toggle('is-open', this.open.has(r.id));
    row.classList.toggle('is-selected', r.id === picked);
    row.setAttribute('aria-selected', String(r.id === picked));
  }
}
