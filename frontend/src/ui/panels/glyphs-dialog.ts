import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el, q, setText } from '../dom';
import { toast } from '../toast';
import { featureOn, featuresKnown, featuresOf, OT_STYLISTIC_SETS, withFeature } from '../../engine/opentype';
import { mappedChars } from '../../engine/glyph-outlines';
import { fontFamilies } from '../fonts';
import { selectRow } from './controls';

/** Window > Glyphs (DEV_PLAN 32.6 part a): a 16-column grid of one Unicode block in a font chosen here (the type layer's
 *  to start), showing only the characters the font file maps, a row of the last 12 glyphs used, and a click that puts the
 *  glyph at the in-canvas editor's caret, or else at the end of the active type layer's content (one undo step).
 *  The grid's 256 buttons are built once; changing the block or font changes only their text and font. */

interface Block { id: string; label: string; from: number; to: number }
const BLOCKS: readonly Block[] = [
  { id: 'latin', label: 'Basic Latin', from: 0x20, to: 0x7e },
  { id: 'latin1', label: 'Latin-1 Supplement', from: 0xa0, to: 0xff },
  { id: 'latinA', label: 'Latin Extended-A', from: 0x100, to: 0x17f },
  { id: 'latinB', label: 'Latin Extended-B', from: 0x180, to: 0x24f },
  { id: 'latinAdd', label: 'Latin Extended Additional', from: 0x1e00, to: 0x1eff },
  { id: 'greek', label: 'Greek', from: 0x370, to: 0x3ff },
  { id: 'cyrillic', label: 'Cyrillic', from: 0x400, to: 0x4ff },
  { id: 'punct', label: 'General Punctuation', from: 0x2010, to: 0x205e },
  { id: 'currency', label: 'Currency', from: 0x20a0, to: 0x20bf },
  { id: 'letterlike', label: 'Letterlike', from: 0x2100, to: 0x214f },
  { id: 'arrows', label: 'Arrows', from: 0x2190, to: 0x21ff },
  { id: 'math', label: 'Math Operators', from: 0x2200, to: 0x22ff },
  { id: 'box', label: 'Box Drawing', from: 0x2500, to: 0x257f },
  { id: 'shapes', label: 'Geometric Shapes', from: 0x25a0, to: 0x25ff },
  { id: 'misc', label: 'Miscellaneous Symbols', from: 0x2600, to: 0x26ff },
  { id: 'dingbats', label: 'Dingbats', from: 0x2700, to: 0x27bf },
];
/** The common alternates offered (the font is not probed): stylistic and contextual alternates, swash, and the first ten sets. */
const ALTERNATES: ReadonlyArray<{ tag: string; label: string }> = [
  { tag: 'salt', label: 'Stylistic' }, { tag: 'swsh', label: 'Swash' }, { tag: 'calt', label: 'Contextual' },
  ...OT_STYLISTIC_SETS.slice(0, 10).map((f) => ({ tag: f.tag, label: `SS${f.tag.slice(2)}` })),
];
const RECENT_KEY ='formvis.glyphsRecent';
const RECENT_MAX = 12;

function loadRecent(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch { return []; }
}
function saveRecent(list: string[]): void {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* storage unavailable: the row lives for the session */ }
}

export class GlyphsDialog extends Dialog {
  private readonly font = el('<label class="cv-field"><span></span><select class="cv-input"></select></label>');
  private readonly fontInput: HTMLSelectElement;
  private readonly charNote = el('<p class="cv-dialog-note"></p>');
  private mapped: Set<number> | null = null;
  private mapSeq = 0;
  private readonly grid = el('<div class="cv-glyph-grid" role="grid" style="display: grid; grid-template-columns: repeat(16, 1fr); gap: 2px; margin-top: 8px"></div>');
  private readonly recentRow = el('<div class="cv-glyph-recent" style="display: flex; gap: 2px; min-height: 30px; margin-top: 8px" aria-label="Recently used"></div>');
  private readonly altRow = el('<div class="cv-glyph-alts" style="display: flex; flex-wrap: wrap; gap: 4px" aria-label="Alternates"></div>');
  private readonly altNote = el('<p class="cv-dialog-note"></p>');
  private altSeq = 0;
  private readonly altCells = new Map<string, HTMLButtonElement>();
  private readonly cells: HTMLButtonElement[] = [];
  private readonly recentCells: HTMLButtonElement[] = [];
  private recent: string[] = loadRecent();
  private block: Block = BLOCKS[0];
  private family = '';

  constructor(private readonly engine: Engine) {
    super('Glyphs', 560);
    setText(q(this.font, 'span'), 'Font');
    this.fontInput = q(this.font, 'select') as HTMLSelectElement;
    this.fontInput.addEventListener('change', () => { this.family = this.fontInput.value; this.fill(); this.detectAlternates(); void this.loadChars(); });
    const show = selectRow('Show', BLOCKS.map((b) => [b.id, b.label] as const), (v) => { this.block = BLOCKS.find((b) => b.id === v) ?? BLOCKS[0]; this.fill(); });
    show.set(this.block.id);
    for (let i = 0; i < 256; i++) {
      const b = el<HTMLButtonElement>('<button type="button" class="cv-btn ghost" style="padding: 2px 0; font-size: 18px; min-width: 0; height: 30px" role="gridcell"></button>');
      b.addEventListener('click', () => { if (b.textContent) void this.insert(b.textContent); });
      this.cells.push(b);
      this.grid.appendChild(b);
    }
    for (let i = 0; i < RECENT_MAX; i++) {
      const b = el<HTMLButtonElement>('<button type="button" class="cv-btn ghost" style="padding: 2px 0; font-size: 18px; width: 30px; height: 30px" hidden></button>');
      b.addEventListener('click', () => { if (b.textContent) void this.insert(b.textContent); });
      this.recentCells.push(b);
      this.recentRow.appendChild(b);
    }
    this.body.append(this.font, show.el, this.charNote, el('<p class="cv-dialog-note">Recently used</p>'), this.recentRow, this.grid,
      el('<p class="cv-dialog-note">Alternates</p>'), this.altRow,
      this.altNote, el('<p class="cv-dialog-note">A click on a glyph adds it to the end of the selected type layer.</p>'));
    for (const f of ALTERNATES) {
      const b = el<HTMLButtonElement>(`<button type="button" class="cv-btn ghost" aria-pressed="false" title="${f.tag}">${f.label}</button>`);
      b.addEventListener('click', () => { void this.toggle(f.tag); });
      this.altCells.set(f.tag, b);
      this.altRow.appendChild(b);
    }
    this.button('Done', 'primary', () => this.close());
    this.paintRecent();
  }

  show(): void {
    const t = this.engine.current?.activeLayer?.text;
    this.family = t && this.engine.liveText(this.engine.current?.activeLayer) ? t.family : this.engine.textSettings.family;
    if (!this.fontInput.options.length) for (const f of fontFamilies()) this.fontInput.add(new Option(f, f));
    if (!Array.from(this.fontInput.options).some((o) => o.value === this.family)) this.fontInput.add(new Option(this.family, this.family));
    this.fontInput.value = this.family;
    this.fill();
    void this.loadChars();
    this.paintRecent();
    this.paintAlternates();
    this.detectAlternates();
    this.open();
  }

  /** Shows only the alternate toggles the layer's font has (hidden flags and the note text; nothing is rebuilt). */
  private detectAlternates(): void {
    const l = this.engine.current?.activeLayer, t = l && this.engine.liveText(l) ? l.text : null;
    const s = t ?? this.engine.textSettings, seq = ++this.altSeq;
    const apply = (found: Set<string> | null): void => {
      if (seq !== this.altSeq) return;
      let shown = 0;
      for (const [tag, b] of this.altCells) { b.hidden = found ? !found.has(tag) : false; if (!b.hidden) shown += 1; }
      setText(this.altNote, !found ? 'The font could not be checked, so the common alternates are shown; one the font lacks changes nothing.'
        : shown ? 'Showing the alternates this font has.' : 'This font has no alternates.');
    };
    const known = featuresKnown(this.family || s.family, !!s.bold, !!s.italic);
    if (known !== undefined) { apply(known); return; }
    apply(null);
    void featuresOf(this.family || s.family, !!s.bold, !!s.italic).then(apply);
  }

  /** Reads which characters the chosen face maps from its font file, then redraws the grid with only those. */
  private async loadChars(): Promise<void> {
    const seq = ++this.mapSeq, l = this.engine.current?.activeLayer, t = l && this.engine.liveText(l) ? l.text : null;
    const list = await mappedChars(this.family, !!(t ?? this.engine.textSettings).bold, !!(t ?? this.engine.textSettings).italic);
    if (seq !== this.mapSeq) return;
    this.mapped = list ? new Set(list) : null;
    this.fill();
  }

  /** Sets the 256 kept buttons for the current block: text and font only, nothing is added or removed. Where the face's
   *  characters are known, only the ones it maps are shown, packed from the first cell. */
  private fill(): void {
    const { from, to } = this.block, cps: number[] = [];
    for (let cp = from; cp <= to; cp++) if (!this.mapped || this.mapped.has(cp)) cps.push(cp);
    const font = this.family ? `"${this.family}", sans-serif` : '';
    this.cells.forEach((b, i) => {
      const cp = cps[i], on = cp !== undefined;
      b.hidden = !on;
      b.style.fontFamily = font;
      b.textContent = on ? String.fromCodePoint(cp) : '';
      b.title = on ? `U+${cp.toString(16).toUpperCase().padStart(4, '0')}` : '';
    });
    setText(this.charNote, !this.mapped ? 'The font file could not be read, so every code point in the block is shown.'
      : `${cps.length} of this font's ${this.mapped.size} mapped characters are in this block.`);
  }

  private paintRecent(): void {
    this.recentCells.forEach((b, i) => {
      const g = this.recent[i];
      b.hidden = g === undefined;
      b.textContent = g ?? '';
      b.style.fontFamily = this.family ? `"${this.family}", sans-serif` : '';
    });
  }

  /** Marks the alternate toggles from the active type layer's features (attributes only; no element is added). */
  private paintAlternates(): void {
    const l = this.engine.current?.activeLayer, t = l && this.engine.liveText(l) ? l.text : null;
    for (const [tag, b] of this.altCells) {
      b.disabled = !t;
      b.setAttribute('aria-pressed', t && featureOn(t.features, tag) ? 'true' : 'false');
    }
  }

  /** Turns one alternate feature on or off for the active type layer: one undo step through the text update path. */
  private async toggle(tag: string): Promise<void> {
    const layer = this.engine.current?.activeLayer;
    if (!layer || !layer.text || !this.engine.liveText(layer)) { toast('Select a type layer to set alternates.', 'info'); return; }
    await this.engine.updateTextLayer(layer.id, { ...layer.text, features: withFeature(layer.text.features, tag, !featureOn(layer.text.features, tag)) });
    this.paintAlternates();
  }

  private async insert(glyph: string): Promise<void> {
    // With the in-canvas editor open, the glyph goes in at its caret (replacing the selection) through its own input path.
    const ed = document.querySelector<HTMLTextAreaElement>('.cv-type-editor:not([hidden])');
    const layer = this.engine.current?.activeLayer;
    if (!ed && (!layer || !layer.text || !this.engine.liveText(layer))) { toast('Select a type layer to insert a glyph.', 'info'); return; }
    this.recent = [glyph, ...this.recent.filter((g) => g !== glyph)].slice(0, RECENT_MAX);
    saveRecent(this.recent);
    this.paintRecent();
    if (ed) {
      ed.setRangeText(glyph, ed.selectionStart, ed.selectionEnd, 'end');
      ed.dispatchEvent(new Event('input', { bubbles: true }));
      ed.focus();
      return;
    }
    if (!layer || !layer.text) return;
    await this.engine.updateTextLayer(layer.id, { ...layer.text, content: layer.text.content + glyph });
  }
}
