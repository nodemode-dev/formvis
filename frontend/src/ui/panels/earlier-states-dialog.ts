import type { EarlierSet } from '../../io/recovery';
import { Dialog } from '../dialogs';
import { el, patchList, setHidden, setText } from '../dom';

export interface EarlierStatesDeps {
  list(): Promise<EarlierSet[]>;
  /** Opens the set's documents as tabs; resolves with how many opened. */
  open(set: EarlierSet): Promise<number>;
  drop(id: string): Promise<void>;
}

const when = (t: number): string => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** File > Earlier States: the last two sessions and the crash sets formvis kept at its starts, each opened as tabs.
 *  The list is built once and patched by key; deleting a set removes only its row. */
export class EarlierStatesDialog extends Dialog {
  private sets: EarlierSet[] = [];
  private readonly list = el('<div class="cv-earlier-list" role="list" tabindex="0"></div>');
  private readonly empty = el('<p class="cv-dialog-note">Nothing is kept yet. The next start keeps what this one leaves.</p>');

  constructor(private readonly deps: EarlierStatesDeps) {
    super('Earlier States', 520);
    this.body.append(this.list, this.empty, el('<p class="cv-dialog-note">formvis keeps the last two sessions and the last three crash sets. Opening one adds its documents as new tabs and leaves the set kept.</p>'));
    this.list.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]'), row = btn?.closest<HTMLElement>('[data-key]');
      const set = row ? this.sets.find((s) => s.id === row.dataset.key) : undefined;
      if (!btn || !set) return;
      if (btn.dataset.act === 'delete') { void this.deps.drop(set.id).then(() => { this.sets = this.sets.filter((s) => s.id !== set.id); this.paint(); }); return; }
      btn.disabled = true;
      void this.deps.open(set).then((n) => { btn.disabled = false; if (n) this.close(); });
    });
    this.button('Done', 'primary', () => this.close());
  }

  async show(): Promise<void> {
    this.sets = await this.deps.list();
    this.paint();
    this.open();
  }

  private paint(): void {
    patchList(this.list, this.sets, {
      key: (s) => s.id,
      create: (s) => {
        const r = el('<div class="cv-earlier-row" role="listitem" style="display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1) 0"></div>');
        r.append(el('<span class="cv-earlier-kind" style="min-width: 64px; color: var(--text-secondary)"></span>'), el('<span class="cv-earlier-what" style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"></span>'),
          el('<button class="cv-btn" type="button" data-act="open">Open</button>'), el('<button class="cv-btn cv-btn-ghost" type="button" data-act="delete">Delete</button>'));
        this.fill(r, s);
        return r;
      },
      update: (r, s) => this.fill(r, s),
    });
    setHidden(this.empty, this.sets.length > 0);
  }

  private fill(r: HTMLElement, s: EarlierSet): void {
    const names = s.records.map((x) => x.name).join(', ');
    setText(r.querySelector<HTMLElement>('.cv-earlier-kind') as HTMLElement, s.kind === 'crash' ? 'Crash' : 'Session');
    const what = r.querySelector<HTMLElement>('.cv-earlier-what') as HTMLElement;
    setText(what, `${when(s.savedAt)} · ${s.records.length === 1 ? '1 document' : `${s.records.length} documents`}: ${names}`);
    what.title = names;
  }

  /** The row count in the list, for checks. */
  get rows(): number { return this.list.querySelectorAll('[data-key]').length; }
}
