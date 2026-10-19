import type { Engine } from '../engine';
import type { EngineJob } from '../engine/types';
import { el, patchList, q, setHidden, setStyleVar, setText, setTitle } from './dom';
import { onLanguage, t } from './i18n';

/** Window > Jobs and a click on the status bar's Working indicator: every running background job as a row with its name,
 *  a bar, the percent and a Stop of its own. Built once; a row is made when a job starts, patched in place as the job
 *  steps (only the bar, the percent and the button change) and removed when it ends. Esc and a click outside close it. */
export class JobsList {
  private readonly root = el<HTMLElement>(
    '<div class="cv-jobs" role="dialog" aria-label="Jobs" hidden><div class="cv-jobs-head"><span class="cv-jobs-title"></span><span class="cv-jobs-count"></span></div>' +
    '<div class="cv-jobs-list" role="list"></div><p class="cv-jobs-empty"></p></div>');
  private readonly list = q(this.root, '.cv-jobs-list');
  private readonly empty = q(this.root, '.cv-jobs-empty');
  private readonly count = q(this.root, '.cv-jobs-count');
  private frame = 0;

  constructor(private readonly engine: Engine, private readonly anchor: HTMLElement) {
    document.getElementById('overlay-root')?.appendChild(this.root);
    this.words();
    engine.on('progress', () => this.queue());
    onLanguage(() => { this.words(); this.sync(); });
    this.list.addEventListener('click', (e) => {
      const row = e.target instanceof Element && e.target.closest('.cv-jobs-stop') ? (e.target as Element).closest<HTMLElement>('[data-job]') : null;
      if (row?.dataset.job) this.engine.cancelJob(Number(row.dataset.job));
    });
    this.root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); this.hide(); } });
  }

  get isOpen(): boolean { return !this.root.hidden; }

  toggle(): void { if (this.isOpen) this.hide(); else this.show(); }

  show(): void {
    if (this.isOpen) return;
    const r = this.anchor.getBoundingClientRect();
    this.root.hidden = false;
    this.root.style.left = `${Math.max(8, Math.min(window.innerWidth - 8 - this.root.offsetWidth, r.left))}px`;
    this.root.style.bottom = `${Math.max(8, window.innerHeight - r.top + 6)}px`;
    this.sync();
    document.addEventListener('pointerdown', this.outside, true);
    document.addEventListener('keydown', this.escape, true);
  }

  hide(): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    document.removeEventListener('pointerdown', this.outside, true);
    document.removeEventListener('keydown', this.escape, true);
  }

  private readonly escape = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && !e.defaultPrevented && !this.engine.jobs.length) { e.preventDefault(); this.hide(); }
  };

  private readonly outside = (e: PointerEvent): void => {
    if (e.target instanceof Node && !this.root.contains(e.target) && !this.anchor.contains(e.target)) this.hide();
  };

  private words(): void {
    setText(q(this.root, '.cv-jobs-title'), t('Jobs'));
    this.root.setAttribute('aria-label', t('Jobs'));
    setText(this.empty, t('No background jobs are running.'));
  }

  private queue(): void {
    if (!this.isOpen || this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.sync(); });
  }

  private sync(): void {
    if (!this.isOpen) return;
    const jobs = [...this.engine.jobs];
    patchList<EngineJob>(this.list, jobs, {
      key: (j) => String(j.id),
      create: (j) => {
        const row = el('<div class="cv-jobs-row" role="listitem"><span class="cv-jobs-name"></span><span class="cv-jobs-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></span><span class="cv-jobs-pct"></span><button class="cv-jobs-stop" type="button"></button></div>');
        row.dataset.job = String(j.id);
        this.fill(row, j);
        return row;
      },
      update: (row, j) => this.fill(row, j),
    });
    setHidden(this.empty, jobs.length > 0);
    setText(this.count, jobs.length ? String(jobs.length) : '');
  }

  private fill(row: HTMLElement, j: EngineJob): void {
    const name = q(row, '.cv-jobs-name'), bar = q(row, '.cv-jobs-bar'), btn = q<HTMLButtonElement>(row, '.cv-jobs-stop');
    const pct = j.total > 0 ? Math.round(Math.min(1, Math.max(0, j.done / j.total)) * 100) : 0;
    setText(name, j.name);
    setTitle(name, j.name);
    setStyleVar(bar, '--p', `${pct}%`);
    if (bar.getAttribute('aria-valuenow') !== String(pct)) bar.setAttribute('aria-valuenow', String(pct));
    setText(q(row, '.cv-jobs-pct'), j.total > 0 ? `${pct}%` : '');
    setText(btn, t(j.cancelled ? 'Stopping' : 'Stop'));
    setTitle(btn, `${t('Stop')}: ${j.name}`);
    if (btn.disabled !== j.cancelled) btn.disabled = j.cancelled;
  }
}
