import type { Engine, NamedPath } from '../engine';
import { el, patchList, q, setHidden, setText } from './dom';
import { icon } from './icons';
import { fillVector, samplePath } from '../engine/paths';

/** The Paths panel, below the layers: the Work Path (in italics) and named paths. Clicking one selects it for the Pen,
 *  Direct Selection and the path commands; clicking the empty list deselects, so the next drawing starts a new Work
 *  Path. Double-clicking renames a path, which saves a Work Path. The list keeps a fixed height, so paths coming and
 *  going never move the layout. */
export class PathsPanel {
  private readonly rows: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly body: HTMLElement;
  private readonly toggle: HTMLButtonElement;

  constructor(root: HTMLElement, private readonly engine: Engine) {
    root.insertAdjacentHTML('beforeend',
      `<section class="cv-paths" aria-label="Paths">` +
      `<div class="cv-panel-head"><button class="cv-paths-toggle" type="button" aria-expanded="false"><span class="cv-paths-chevron">${icon('chevronDown', 12)}</span>${icon('penTool', 14)}<span>Paths</span></button></div>` +
      `<div class="cv-paths-body" hidden><div class="cv-path-list"><div class="cv-path-rows" role="listbox" aria-label="Paths"></div><div class="cv-paths-empty">No paths. Draw one with the Pen (P).</div></div>` +
      `<div class="cv-panel-foot"><button class="cv-icon-btn" type="button" data-cmd="new-path" title="New path" aria-label="New path">${icon('add', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="path-selection" title="Load path as a selection" aria-label="Load path as a selection">${icon('marquee', 16)}</button>` +
      `<button class="cv-icon-btn" type="button" data-cmd="selection-to-work-path" title="Make work path from selection" aria-label="Make work path from selection">${icon('penTool', 16)}</button>` +
      `<button class="cv-icon-btn" type="button" data-cmd="fill-path-dialog" title="Fill path..." aria-label="Fill path">${icon('fill', 16)}</button>` +
      `<button class="cv-icon-btn" type="button" data-cmd="new-shape-path" title="New shape layer from path" aria-label="New shape layer from path">${icon('rectTool', 16)}</button>` +
      `<button class="cv-icon-btn" type="button" data-cmd="stroke-path-dialog" title="Stroke path..." aria-label="Stroke path">${icon('paintbrush', 16)}</button>` +
      `<button class="cv-icon-btn" type="button" data-cmd="delete-path" title="Delete path" aria-label="Delete path">${icon('delete', 16)}</button></div></div></section>`);
    const section = q(root, '.cv-paths');
    this.rows = q(section, '.cv-path-rows');
    this.empty = q(section, '.cv-paths-empty');
    this.body = q(section, '.cv-paths-body');
    this.toggle = q<HTMLButtonElement>(section, '.cv-paths-toggle');
    this.toggle.addEventListener('click', () => {
      const open = this.toggle.getAttribute('aria-expanded') !== 'true';
      this.toggle.setAttribute('aria-expanded', String(open));
      setHidden(this.body, !open);
    });
    q(section, '.cv-path-list').addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.cv-path-row');
      if (row?.querySelector('input')) return;
      this.engine.selectPath(row?.dataset.key ?? null);
    });
    this.rows.addEventListener('dblclick', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.cv-path-row');
      if (row) this.rename(row);
    });
    engine.on('paths', () => this.sync());
    engine.on('projects', () => this.sync());
    engine.on('active', () => this.sync());
    engine.on('doc', () => this.sync());
    this.sync();
  }

  private sync(): void {
    const { list, active } = this.engine.paths;
    patchList<NamedPath>(this.rows, list, {
      key: (n) => n.id,
      create: (n) => {
        const row = el('<div class="cv-path-row" role="option"><canvas class="cv-path-thumb" width="64" height="44" aria-hidden="true"></canvas><span class="cv-path-name"></span></div>');
        row.dataset.key = n.id;
        this.fill(row, n, active);
        return row;
      },
      update: (row, n) => this.fill(row, n, active),
    });
    setHidden(this.empty, list.length > 0);
  }

  private fill(row: HTMLElement, n: NamedPath, active: string | null): void {
    const name = q(row, '.cv-path-name');
    if (!name.querySelector('input')) setText(name, n.name);
    row.classList.toggle('is-work', n.work || !!n.shape);
    row.classList.toggle('is-active', n.id === active);
    row.setAttribute('aria-selected', String(n.id === active));
    row.title = n.mask ? 'The layer\'s vector mask: reshape it with Direct Selection or the Pen' : n.shape ? 'The shape layer\'s outline: reshape it with Direct Selection' : n.work ? 'Work Path: double-click to name and keep it' : 'Double-click to rename';
    this.thumb(q<HTMLCanvasElement>(row, '.cv-path-thumb'), n);
  }

  /** The path drawn small over the document's outline, in place on the row's own canvas. */
  private thumb(cv: HTMLCanvasElement, n: NamedPath): void {
    const d = this.engine.current?.doc, g = cv.getContext('2d');
    if (!d || !g || !d.width || !d.height) return;
    const s = Math.min(cv.width / d.width, cv.height / d.height), ox = (cv.width - d.width * s) / 2, oy = (cv.height - d.height * s) / 2;
    const ink = getComputedStyle(cv).color;
    g.clearRect(0, 0, cv.width, cv.height);
    g.save();
    g.translate(ox, oy);
    g.scale(s, s);
    g.fillStyle = 'rgba(128, 128, 128, 0.16)';
    g.fillRect(0, 0, d.width, d.height);
    g.fillStyle = ink;
    g.globalAlpha = 0.35;
    fillVector(g, n.path);
    g.globalAlpha = 1;
    g.strokeStyle = ink;
    g.lineWidth = 1.5 / s;
    g.lineJoin = 'round';
    for (const sp of n.path.subpaths) {
      const pts = samplePath(sp, 4 / s);
      if (pts.length < 2) continue;
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      if (sp.closed) g.closePath();
      g.stroke();
    }
    g.restore();
  }

  /** Inline renaming in place of the name; Enter or leaving the field keeps the name, Escape cancels. */
  private rename(row: HTMLElement): void {
    const id = row.dataset.key, n = this.engine.paths.list.find((x) => x.id === id), name = q(row, '.cv-path-name');
    if (!n || n.shape || name.querySelector('input')) return;
    const input = el<HTMLInputElement>('<input class="cv-input cv-path-rename" type="text" spellcheck="false">');
    input.value = n.work ? '' : n.name;
    input.placeholder = n.work ? 'Name to keep this path' : '';
    name.replaceChildren(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (keep: boolean): void => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      name.replaceChildren();
      setText(name, n.name);
      if (keep && (value || n.work)) this.engine.renamePath(n.id, value);
    };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true));
  }
}
