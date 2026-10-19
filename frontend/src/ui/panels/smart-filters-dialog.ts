import { BLEND_MODES, type BlendMode, type Engine, type SmartFilter } from '../../engine';
import { Dialog } from '../dialogs';
import { el, patchList, q, setChecked, setText } from '../dom';
import { selectRow, sliderRow, type Row } from './controls';
import { FILTER_LABELS, type FilterKind, type FilterPanel } from './filter-panel';

/** Layer > Smart Filters: the active smart object's filters, top first, each shown or hidden, changed or removed. Every
 *  change re-renders the object from its original pixels as one undo step. */
export class SmartFiltersDialog extends Dialog {
  private layerId: string | null = null;
  private readonly list = el('<div class="cv-list cv-sf-list" tabindex="-1"></div>');
  private readonly note = el('<p class="cv-note"></p>');
  private selId: string | null = null;
  private timer = 0;
  private readonly blendRow: Row<string>;
  private readonly opacityRow: Row<number>;

  constructor(private readonly engine: Engine, private readonly filters: () => FilterPanel) {
    super('Smart Filters', 420);
    this.blendRow = selectRow('Blending', BLEND_MODES.map((m) => [m.id, m.label] as const), (v) => this.setBlend({ blend: v as BlendMode }));
    this.opacityRow = sliderRow('Opacity (%)', 0, 100, 1, (v) => { window.clearTimeout(this.timer); this.timer = window.setTimeout(() => this.setBlend({ opacity: v }), 160); });
    this.body.append(this.list, this.blendRow.el, this.opacityRow.el, this.note);
    this.button('Close', 'primary', () => this.close());
    this.list.addEventListener('click', (e) => {
      const t = e.target as HTMLElement, id = t.closest<HTMLElement>('[data-key]')?.dataset.key;
      if (!id) return;
      if (!t.closest('button, input')) { this.selId = id; this.sync(); return; }
      if (t.closest('[data-act="remove"]')) this.change((fs) => fs.filter((f) => f.id !== id), 'Remove Smart Filter');
      else if (t.closest('[data-act="edit"]')) this.edit(id);
      else if (t.closest('[data-act="up"]') || t.closest('[data-act="down"]')) {
        const by = t.closest('[data-act="up"]') ? -1 : 1;
        this.change((fs) => {
          const i = fs.findIndex((f) => f.id === id), j = i + by;
          if (i < 0 || j < 0 || j >= fs.length) return fs;
          const out = fs.slice();
          [out[i], out[j]] = [out[j], out[i]];
          return out;
        }, 'Reorder Smart Filters');
      }
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
    const shown = this.layerId ? this.engine.smartFiltersShown(this.layerId) ?? [] : [];
    patchList<SmartFilter>(this.list, shown, {
      key: (f) => f.id,
      create: (f) => {
        const row = el(`<div class="cv-list-row cv-sf-row"><input type="checkbox" aria-label="Show this filter"><span class="cv-sf-name"></span><button class="cv-btn cv-btn-ghost" type="button" data-act="up" aria-label="Move up" title="Move up">Up</button><button class="cv-btn cv-btn-ghost" type="button" data-act="down" aria-label="Move down" title="Move down">Down</button><button class="cv-btn cv-btn-ghost" type="button" data-act="edit">Edit</button><button class="cv-btn cv-btn-ghost" type="button" data-act="remove">Remove</button></div>`);
        row.dataset.key = f.id;
        this.fill(row, f);
        return row;
      },
      update: (row, f) => this.fill(row, f),
    });
    if (!shown.some((f) => f.id === this.selId)) this.selId = shown[0]?.id ?? null;
    const cur = shown.find((f) => f.id === this.selId);
    for (const row of Array.from(this.list.children) as HTMLElement[]) row.classList.toggle('is-selected', row.dataset.key === this.selId);
    this.blendRow.el.classList.toggle('is-off', !cur);
    this.opacityRow.el.classList.toggle('is-off', !cur);
    this.blendRow.el.querySelector('select')!.disabled = !cur;
    this.opacityRow.el.querySelectorAll('input').forEach((i) => { i.disabled = !cur; });
    this.blendRow.set(cur?.blend ?? 'normal');
    this.opacityRow.set(cur?.opacity ?? 100);
    setText(this.note, smart && shown.length ? "Filters run top first, each on the one before's result, always from the smart object's original pixels."
      : 'No smart filters yet. Choose a filter from the Filter menu while this smart object is selected.');
  }

  private setBlend(patch: { blend?: BlendMode; opacity?: number }): void {
    const id = this.selId;
    if (id) this.change((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)), 'Smart Filter Blending');
  }

  private fill(row: HTMLElement, f: SmartFilter): void {
    setText(q(row, '.cv-sf-name'), FILTER_LABELS[f.kind as FilterKind] ?? f.kind);
    setChecked(q<HTMLInputElement>(row, 'input'), f.enabled);
  }

  private change(edit: (fs: SmartFilter[]) => SmartFilter[], name: string): void {
    const smart = this.smart();
    if (!smart || !this.layerId) return;
    this.engine.setSmartFilters(this.layerId, edit(this.engine.smartFiltersShown(this.layerId) ?? smart.filters), name);
    this.sync();
    // Removing a row can take the focused button with it; keep focus in the dialog so Escape still closes it.
    if (!this.list.closest('dialog, .cv-dialog')?.contains(document.activeElement)) this.list.focus({ preventScroll: true });
  }

  private edit(id: string): void {
    const f = (this.layerId ? this.engine.smartFiltersShown(this.layerId) : null)?.find((x) => x.id === id), layerId = this.layerId;
    if (!f || !layerId) return;
    this.close();
    this.filters().showFor(f.kind as FilterKind, f.settings, (settings) => {
      const now = this.engine.smartFiltersShown(layerId);
      if (now) this.engine.setSmartFilters(layerId, now.map((x) => (x.id === id ? { ...x, settings } : x)), 'Edit Smart Filter');
    });
  }
}
