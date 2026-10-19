import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el, q, setText } from '../dom';
import { fontFamilies, installed } from '../fonts';

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui']);
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The installed family whose name is closest to a missing one: a name that contains it (or it contains), else the one
 *  sharing the longest start, else the first installed family. */
function closest(missing: string, have: string[]): string {
  const m = norm(missing);
  let best = have[0] ?? '', score = 0;
  for (const f of have) {
    const n = norm(f);
    let s = 0;
    if (m && n && (n.includes(m) || m.includes(n))) s = 1000 - Math.abs(n.length - m.length);
    else while (s < m.length && s < n.length && m[s] === n[s]) s++;
    if (s >= 3 && s > score) { score = s; best = f; }
  }
  return best;
}

/** Layer > Type > Resolve Missing Fonts (DEV_PLAN 32.7 part c): each family a type layer uses that is not installed,
 *  with the layers using it and a choice of installed family; Replace All applies them as one undo step. */
export class MissingFontsDialog extends Dialog {
  private readonly rows = el('<div class="cv-dialog-rows"></div>');
  private readonly choices = new Map<string, HTMLSelectElement>();

  constructor(private readonly engine: Engine) {
    super('Resolve Missing Fonts', 440);
    this.body.append(this.rows);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Replace All', 'primary', () => void this.apply());
  }

  /** Fills the list and opens the dialog; false (and nothing opened) when no type layer uses a missing font. */
  show(): boolean {
    const have = fontFamilies();
    const counts = new Map<string, number>();
    for (const l of this.engine.textLayerInfo()) {
      if (!l.family || GENERIC.has(l.family) || have.includes(l.family) || installed(l.family)) continue;
      counts.set(l.family, (counts.get(l.family) ?? 0) + 1);
    }
    if (!counts.size || !have.length) return false;
    this.choices.clear();
    const rows: HTMLElement[] = [];
    for (const [family, n] of counts) {
      const row = el('<label class="cv-dialog-row"><span></span></label>');
      setText(q(row, 'span'), `${family} (${n} layer${n === 1 ? '' : 's'})`);
      const sel = el<HTMLSelectElement>('<select class="cv-input"></select>');
      sel.append(...have.map((f) => new Option(f, f)));
      sel.value = closest(family, have);
      row.append(sel);
      this.choices.set(family, sel);
      rows.push(row);
    }
    this.rows.replaceChildren(...rows);
    this.open();
    return true;
  }

  /** Type > Replace All Missing Fonts: every missing family set to the default font in one undo step; returns the layers changed. */
  async replaceAll(): Promise<number> {
    const have = fontFamilies(), map = new Map<string, string>(), to = have.includes('Inter') ? 'Inter' : have[0] ?? 'Inter';
    for (const l of this.engine.textLayerInfo()) if (l.family && !GENERIC.has(l.family) && !have.includes(l.family) && !installed(l.family)) map.set(l.family, to);
    return map.size ? this.engine.replaceFontFamilies(map, 'Replace All Missing Fonts') : 0;
  }

  private async apply(): Promise<void> {
    const map = new Map<string, string>();
    for (const [family, sel] of this.choices) map.set(family, sel.value);
    this.close();
    await this.engine.replaceFontFamilies(map, 'Replace Missing Fonts');
  }
}
