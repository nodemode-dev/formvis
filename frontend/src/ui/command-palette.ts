import type { Engine } from '../engine';
import { toolList } from '../extensions/registry';
import type { Commands } from './commands';
import { Dialog } from './dialogs';
import { el, patchList, q, setClass, setHidden, setHtml, setText, setTitle } from './dom';
import { t } from './i18n';
import { icon } from './icons';
import type { MenuDef, MenuItem } from './menu';

/** How well `query` names `text` (case ignored), or null when its letters are not all in `text` in order. The best
 *  placing of the letters wins: each letter scores 1, 7 more when it directly follows the one before, and 5 more at the
 *  start of a word (after a space or a mark, or a capital after a small letter), a little less the further in it
 *  lies; an eighth of the text's length is taken off, so shorter names rank first. */
export function fuzzyScore(query: string, text: string): number | null {
  const q = Array.from(query.toLowerCase()), raw = Array.from(text), t = raw.map((c) => c.toLowerCase()), m = q.length, n = t.length;
  if (!m) return 0;
  if (m > n) return null;
  const opens = (j: number): boolean => j === 0 || /[\s>\-/(.,:]/.test(raw[j - 1]) || (raw[j] !== t[j] && raw[j - 1] === t[j - 1] && /[a-z]/.test(t[j - 1]));
  let prev = new Float64Array(n).fill(-Infinity), row = new Float64Array(n);
  for (let i = 0; i < m; i++) {
    let earlier = -Infinity;
    for (let j = 0; j < n; j++) {
      if (j >= 2) earlier = Math.max(earlier, prev[j - 2]);
      if (t[j] !== q[i]) { row[j] = -Infinity; continue; }
      const own = 1 + (opens(j) ? 5 : 0) - j * 0.01, before = i === 0 ? 0 : Math.max(j >= 1 ? prev[j - 1] + 7 : -Infinity, earlier);
      row[j] = before === -Infinity ? -Infinity : before + own;
    }
    [prev, row] = [row, prev];
  }
  let best = -Infinity;
  for (let j = 0; j < n; j++) best = Math.max(best, prev[j]);
  return best === -Infinity ? null : Math.round(best) - Math.floor(n / 8);
}

/** Each command's place in the menus ("Edit > Transform"), the first place it appears. */
function pathsOf(menus: MenuDef[]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (items: MenuItem[], path: string): void => {
    for (const it of items) {
      if (it === '-') continue;
      if (typeof it === 'object') walk(it.items, `${path} > ${it.label}`);
      else if (!out.has(it)) out.set(it, path);
    }
  };
  for (const m of menus) walk(typeof m.items === 'function' ? m.items() : m.items, m.label);
  return out;
}

interface Hit { key: string; label: string; meta: string; icon: string; enabled: boolean; why?: string; score: number; run: () => void }

const SHOWN = 12;

/** Edit > Search (Mod+K; 1.65.9, after Photoshop's Search): every command, with where it sits in the
 *  menus and its keys, and every tool, ranked by `fuzzyScore` as the query is typed (on its name, or 10 behind on its
 *  name and menu path together, so "blur" puts Blur before Average; a tool a little ahead); the twelve
 *  best are listed, Up and Down choose, Enter or a click runs one (a disabled one shows, dimmed, and does not run), and
 *  Escape closes. With no query, what was last run from here comes first. The rows are twelve slots in a list sized for
 *  them from the start, each updated in place as the results change (only the last ones come and go), so typing moves
 *  neither the dialog nor a row. */
export class CommandPalette extends Dialog {
  private readonly input = el<HTMLInputElement>('<input class="cv-input" type="search" placeholder="Search commands and tools" aria-label="Search commands and tools" spellcheck="false" autocomplete="off">');
  private readonly list = el('<div class="cv-palette-list" role="listbox" aria-label="Commands and tools"></div>');
  private readonly empty = el('<p class="cv-note cv-palette-empty" hidden>No command or tool matches.</p>');
  private hits: Hit[] = [];
  private selected = 0;
  private paths = new Map<string, string>();
  private recent: string[] = [];

  constructor(private readonly commands: Commands, private readonly menus: () => MenuDef[], private readonly engine: Engine) {
    super('Search', 560);
    const box = el('<div class="cv-palette-box"></div>');
    box.append(this.list, this.empty);
    this.body.append(this.input, box);
    this.input.addEventListener('input', () => { this.selected = 0; this.render(); });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.selected = Math.max(0, Math.min(this.hits.length - 1, this.selected + (e.key === 'ArrowDown' ? 1 : -1)));
        this.mark();
      } else if (e.key === 'Enter') { e.preventDefault(); this.runHit(this.selected); }
    });
    this.list.addEventListener('mousedown', (e) => e.preventDefault());
    this.list.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.cv-palette-row');
      if (row) this.runHit(Number(row.dataset.key));
    });
  }

  show(): void {
    if (this.isOpen) return;
    this.paths = pathsOf(this.menus());
    this.input.value = '';
    this.selected = 0;
    this.render();
    this.open(this.input);
  }

  private runHit(i: number): void {
    const h = this.hits[i];
    if (!h?.enabled) return;
    this.recent = [h.key, ...this.recent.filter((k) => k !== h.key)].slice(0, SHOWN);
    this.close();
    h.run();
  }

  private render(): void {
    const query = this.input.value.trim(), hits: Hit[] = [];
    const first = (key: string): number => { const i = this.recent.indexOf(key); return query || i < 0 ? 0 : 1000 - i; };
    for (const c of this.commands.all()) {
      const label = t(this.commands.label(c)).replace(/\.\.\.$/, ''), path = this.paths.get(c.id) ?? '';
      if (!label || c.id === 'recent-heading') continue;
      const own = fuzzyScore(query, label), wide = own === null ? fuzzyScore(query, `${label} ${path}`) : null;
      if (own === null && wide === null) continue;
      const score = own ?? (wide as number) - 10;
      hits.push({ key: c.id, label, meta: [path, this.commands.keyLabel(c)].filter(Boolean).join(' · '), icon: c.icon ?? '', enabled: this.commands.enabled(c), why: t(this.commands.why(c)), score: score + first(c.id), run: () => { this.commands.run(c.id); } });
    }
    for (const t of toolList()) {
      const key = `tool:${t.id}`, score = t.hidden ? null : fuzzyScore(query, `${t.label} tool`);
      if (score === null) continue;
      hits.push({ key, label: `${t.label} Tool`, meta: `Tool · ${t.key}`, icon: t.icon(this.engine), enabled: true, score: score + (query ? 2 : 0) + first(key), run: () => this.engine.setTool(t.id) });
    }
    hits.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
    this.hits = hits.slice(0, SHOWN);
    this.selected = Math.max(0, Math.min(this.selected, this.hits.length - 1));
    patchList(this.list, this.hits, {
      key: (h) => String(this.hits.indexOf(h)),
      create: (h) => { const n = el<HTMLButtonElement>('<button class="cv-list-row cv-palette-row" type="button" role="option" tabindex="-1"><span class="cv-palette-icon"></span><span class="cv-list-name"></span><span class="cv-list-meta"></span></button>'); this.fill(n, h); return n; },
      update: (n, h) => this.fill(n, h),
    });
    setHidden(this.empty, this.hits.length > 0);
    this.mark();
  }

  private fill(n: HTMLElement, h: Hit): void {
    setText(q(n, '.cv-list-name'), h.label);
    setText(q(n, '.cv-list-meta'), h.meta);
    setClass(n, 'is-off', !h.enabled);
    if (h.why || n.title) setTitle(n, h.why ?? '');
    if (n.getAttribute('aria-disabled') !== String(!h.enabled)) n.setAttribute('aria-disabled', String(!h.enabled));
    setHtml(q(n, '.cv-palette-icon'), h.icon ? icon(h.icon, 16) : '', h.icon);
  }

  private mark(): void {
    Array.from(this.list.children).forEach((n, i) => {
      setClass(n, 'is-selected', i === this.selected);
      if (n.getAttribute('aria-selected') !== String(i === this.selected)) n.setAttribute('aria-selected', String(i === this.selected));
    });
  }
}
