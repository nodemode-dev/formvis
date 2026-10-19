import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import type { PsdReport } from '../../io/psd';
import { tn } from '../i18n';

/** The conversion report of a PSD opened by hand: what came in as it was, what was approximated and what was left out,
 *  with Cancel and Import. Agents and batches never see it; they get the report as a toast. */
export class PsdReportDialog extends Dialog {
  private readonly head = el('<p class="cv-psd-report-head" style="margin:0 0 8px"></p>');
  private readonly lists = {
    kept: this.section('Kept as they were'),
    approximated: this.section('Approximated'),
    dropped: this.section('Left out'),
  };
  private answer: ((ok: boolean) => void) | null = null;

  constructor() {
    super('Open PSD', 520);
    this.body.append(this.head, ...Object.values(this.lists).map((s) => s.root));
    this.button('Cancel', 'ghost', () => this.settle(false));
    this.button('Import', 'primary', () => this.settle(true));
  }

  private section(title: string): { root: HTMLElement; title: HTMLElement; list: HTMLUListElement } {
    const root = el('<div class="cv-psd-report-part" style="margin:0 0 8px"><b style="font-size:var(--fs-12)"></b><ul style="margin:4px 0 0;padding-left:18px;font-size:var(--fs-12);max-height:150px;overflow:auto"></ul></div>');
    const t = root.querySelector('b') as HTMLElement;
    setText(t, title);
    return { root, title: t, list: root.querySelector('ul') as HTMLUListElement };
  }

  ask(name: string, report: PsdReport): Promise<boolean> {
    this.settle(false);   // an earlier report left open is cancelled
    setText(this.head, `${name}: ${tn(report.layers, '{n} layer read.', '{n} layers read.')}`);
    for (const key of ['kept', 'approximated', 'dropped'] as const) {
      const s = this.lists[key], items = report[key];
      s.root.hidden = !items.length;
      const rows = items.map((t) => { const li = document.createElement('li'); li.textContent = t; return li; });
      s.list.replaceChildren(...rows);
      setText(s.title, `${{ kept: 'Kept as they were', approximated: 'Approximated', dropped: 'Left out' }[key]} (${items.length})`);
    }
    this.open();
    return new Promise((ok) => { this.answer = ok; });
  }

  close(): void { const a = this.answer; this.answer = null; super.close(); a?.(false); }

  private settle(ok: boolean): void { const a = this.answer; this.answer = null; if (a) { super.close(); a(ok); } }
}
