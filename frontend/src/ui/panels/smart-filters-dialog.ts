import type { Engine, SmartFilter } from '../../engine';
import { Dialog } from '../dialogs';
import { el, patchList, q, setChecked, setText } from '../dom';
import { FILTER_LABELS, type FilterKind, type FilterPanel } from './filter-panel';

/** Layer > Smart Filters: the active smart object's filters, top first, each shown or hidden, changed or removed. Every
 *  change re-renders the object from its original pixels as one undo step. */
export class SmartFiltersDialog extends Dialog {
  private layerId: string | null = null;
  private readonly list = el('<div class="cv-list cv-sf-list" tabindex="-1"></div>');
  private readonly note = el('<p class="cv-note"></p>');

  constructor(private readonly engine: Engine, private readonly filters: () => FilterPanel) {
    super('Smart Filters', 420);
    this.body.append(this.list, this.note);
    this.button('Close', 'primary', () => this.close());
    this.list.addEventListener('click', (e) => {
      const t = e.target as HTMLElement, id = t.closest<HTMLElement>('[data-key]')?.dataset.key;
      if (!id) return;
      if (t.closest('[data-act="remove"]')) this.change((fs) => fs.filter((f) => f.id !== id), 'Remove Smart Filter');
      else if (t.closest('[data-act="edit"]')) this.edit(id);
    });
    this.list.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement, id = t.closest<HTMLElement>('[data-key]')?.dataset.key;
      if (id && t.type === 'checkbox') this.change((fs) => fs.map((f) => (f.id === id ? { ...f, enabled: t.checked } : f)), t.checked ? 'Show Smart Filter' : 'Hide Smart Filter');
    });
  }

  show(): void {
    const l = this.engine.current?.activeLayer;
    if (!l?.smart) { this.engine.notice('Select a smart object to see its filters.'); return; }
    this.layerId = l.id;
    this.sync();
    this.open();
  }

  private smart() { return this.layerId ? this.engine.current?.layer(this.layerId)?.smart ?? null : null; }

  private sync(): void {
    const smart = this.smart();
    patchList<SmartFilter>(this.list, smart?.filters ?? [], {
      key: (f) => f.id,
      create: (f) => {
        const row = el(`<div class="cv-list-row cv-sf-row"><input type="checkbox" aria-label="Show this filter"><span class="cv-sf-name"></span><button class="cv-btn cv-btn-ghost" type="button" data-act="edit">Edit</button><button class="cv-btn cv-btn-ghost" type="button" data-act="remove">Remove</button></div>`);
        row.dataset.key = f.id;
        this.fill(row, f);
        return row;
      },
      update: (row, f) => this.fill(row, f),
    });
    setText(this.note, smart?.filters.length ? "Filters run top first, each on the one before's result, always from the smart object's original pixels."
      : 'No smart filters yet. Choose a filter from the Filter menu while this smart object is selected.');
  }

  private fill(row: HTMLElement, f: SmartFilter): void {
    setText(q(row, '.cv-sf-name'), FILTER_LABELS[f.kind as FilterKind] ?? f.kind);
    setChecked(q<HTMLInputElement>(row, 'input'), f.enabled);
  }

  private change(edit: (fs: SmartFilter[]) => SmartFilter[], name: string): void {
    const smart = this.smart();
    if (!smart || !this.layerId) return;
    this.engine.setSmartFilters(this.layerId, edit(smart.filters), name);
    this.sync();
    // Removing a row can take the focused button with it; keep focus in the dialog so Escape still closes it.
    if (!this.list.closest('dialog, .cv-dialog')?.contains(document.activeElement)) this.list.focus({ preventScroll: true });
  }

  private edit(id: string): void {
    const f = this.smart()?.filters.find((x) => x.id === id), layerId = this.layerId;
    if (!f || !layerId) return;
    this.close();
    this.filters().showFor(f.kind as FilterKind, f.settings, (settings) => {
      const now = this.engine.current?.layer(layerId)?.smart;
      if (now) this.engine.setSmartFilters(layerId, now.filters.map((x) => (x.id === id ? { ...x, settings } : x)), 'Edit Smart Filter');
    });
  }
}
