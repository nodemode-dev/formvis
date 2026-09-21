import type { Engine } from '../engine';
import { el, patchList, q, setHidden, setText } from './dom';
import { icon } from './icons';

type Row = { key: string; name: string; index: number };

/** The History panel, below the Timeline: the document's starting point and each step kept, oldest first. Clicking a
 *  row goes back or forward to just after that step; steps undone show muted until a new change replaces them.
 *  Collapsed until opened, with a fixed height, so it never moves the layout. */
export class HistoryPanel {
  private readonly rows: HTMLElement;
  private readonly body: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly count: HTMLElement;

  constructor(root: HTMLElement, private readonly engine: Engine) {
    root.insertAdjacentHTML('beforeend',
      `<section class="cv-history" aria-label="History">` +
      `<div class="cv-panel-head"><button class="cv-paths-toggle cv-history-toggle" type="button" aria-expanded="false"><span class="cv-paths-chevron">${icon('chevronDown', 12)}</span>${icon('undo', 14)}<span>History</span></button><span></span><span class="cv-history-count"></span></div>` +
      `<div class="cv-history-body" hidden><div class="cv-history-list" role="listbox" aria-label="History"></div></div></section>`);
    const section = q(root, '.cv-history');
    this.rows = q(section, '.cv-history-list');
    this.body = q(section, '.cv-history-body');
    this.toggle = q<HTMLButtonElement>(section, '.cv-history-toggle');
    this.count = q(section, '.cv-history-count');
    this.toggle.addEventListener('click', () => {
      const open = this.toggle.getAttribute('aria-expanded') !== 'true';
      this.toggle.setAttribute('aria-expanded', String(open));
      setHidden(this.body, !open);
      if (open) this.sync();
    });
    this.rows.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.cv-history-row');
      if (row) this.engine.jumpHistory(Number(row.dataset.index));
    });
    for (const ev of ['history', 'projects'] as const) engine.on(ev, () => this.sync());
    this.sync();
  }

  private sync(): void {
    const p = this.engine.current, { names, current } = this.engine.historySteps;
    setText(this.count, p ? `${current} of ${names.length}` : '');
    if (this.body.hidden) return;
    const list: Row[] = p ? [{ key: 'start', name: p.name, index: 0 }, ...names.map((name, i) => ({ key: `${i}:${name}`, name, index: i + 1 }))] : [];
    patchList<Row>(this.rows, list, {
      key: (r) => r.key,
      create: (r) => {
        const row = el(`<div class="cv-history-row" role="option"><span class="cv-history-icon">${icon(r.index === 0 ? 'image' : 'history', 12)}</span><span class="cv-history-name"></span></div>`);
        this.fill(row, r, current);
        return row;
      },
      update: (row, r) => this.fill(row, r, current),
    });
    const at = this.rows.querySelector<HTMLElement>('.cv-history-row.is-current');
    if (at) {
      // Keeps the current step in view by scrolling the list itself, which moves nothing else on the page.
      const top = at.offsetTop - this.rows.offsetTop, bottom = top + at.offsetHeight;
      if (top < this.rows.scrollTop) this.rows.scrollTop = top;
      else if (bottom > this.rows.scrollTop + this.rows.clientHeight) this.rows.scrollTop = bottom - this.rows.clientHeight;
    }
  }

  private fill(row: HTMLElement, r: Row, current: number): void {
    row.dataset.index = String(r.index);
    setText(q(row, '.cv-history-name'), r.name);
    row.classList.toggle('is-current', r.index === current);
    row.classList.toggle('is-undone', r.index > current);
    row.setAttribute('aria-selected', String(r.index === current));
  }
}
