import type { Engine, ID } from '../../engine';
import { Dialog } from '../dialogs';
import { el, q, setDisabled, setText, setValue } from '../dom';
import { loadPrefs, updatePrefs } from '../prefs';

interface Unknown { word: string; suggestions: string[] }
interface Item { id: ID; layer: string; word: string; suggestions: string[] }

const LETTER = "[\\p{L}\\p{M}'’]";
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (word: string): RegExp => new RegExp(`(?<!${LETTER})${escapeRe(word)}(?!${LETTER})`, 'gu');

/** Layer > Type > Check Spelling (DEV_PLAN 32.7 part c). The words of every live type layer go to the engine's spell
 *  service; the unknown ones are stepped through here, and every change made is applied as one undo step when the
 *  dialog closes. The DOM is built once and filled before the dialog is shown. */
export class SpellDialog extends Dialog {
  private readonly wordEl = el('<p class="cv-dialog-note"><span>Not in dictionary: </span><strong></strong></p>');
  private readonly layerEl = el('<p class="cv-dialog-note"></p>');
  private readonly input = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="80" aria-label="Change To">');
  private readonly list = el<HTMLSelectElement>('<select class="cv-input" size="6" aria-label="Suggestions"></select>');
  private readonly note = el('<p class="cv-dialog-note" role="status" style="min-height: 1.4em"></p>');
  private readonly acts: HTMLButtonElement[] = [];
  private items: Item[] = [];
  private pos = 0;
  private working = new Map<ID, string>();
  private original = new Map<ID, string>();
  private readonly ignored = new Set<string>();

  constructor(private readonly engine: Engine) {
    super('Check Spelling', 440);
    this.field('Change To', this.input);
    this.field('Suggestions', this.list);
    this.body.prepend(this.wordEl, this.layerEl);
    this.body.append(this.note);
    this.list.addEventListener('change', () => { setValue(this.input, this.list.value); });
    this.button('Done', 'ghost', () => this.close());
    this.acts.push(this.button('Ignore', 'ghost', () => this.next()));
    this.acts.push(this.button('Ignore All', 'ghost', () => { this.ignored.add(this.items[this.pos]?.word ?? ''); this.next(); }));
    this.acts.push(this.button('Add', 'ghost', () => this.add()));
    this.acts.push(this.button('Change', 'primary', () => this.change(false)));
    this.acts.push(this.button('Change All', 'primary', () => this.change(true)));
  }

  /** Checks every live type layer; opens the dialog on the first unknown word. False when there is nothing to fix. */
  async show(): Promise<boolean> {
    const layers = this.engine.textLayerInfo();
    this.original = new Map(layers.map((l) => [l.id, l.content]));
    this.working = new Map(this.original);
    this.ignored.clear();
    const prefs = loadPrefs();
    const mine = new Set(prefs.spellWords.map((w) => w.toLowerCase()));
    const words = new Set<string>();
    for (const l of layers) for (const m of l.content.matchAll(new RegExp(`${LETTER}+`, 'gu'))) { const w = m[0].replace(/^['’]+|['’]+$/g, ''); if (w && !mine.has(w.toLowerCase())) words.add(w); }
    if (!words.size) return false;
    let unknown: Unknown[] = [];
    try {
      const res = await fetch('/api/spell/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ words: [...words], lang: prefs.language }) });
      if (!res.ok) { this.engine.notice('The spell checker is not available.', 'info'); return false; }
      const data: { unknown?: Unknown[] } = await res.json();
      unknown = Array.isArray(data.unknown) ? data.unknown : [];
    } catch { this.engine.notice('The spell checker is not available.', 'info'); return false; }
    const bad = new Map(unknown.map((u) => [u.word, u.suggestions]));
    this.items = [];
    for (const l of layers) {
      const seen = new Set<string>();
      for (const m of l.content.matchAll(new RegExp(`${LETTER}+`, 'gu'))) {
        const w = m[0].replace(/^['’]+|['’]+$/g, '');
        const s = bad.get(w);
        if (s && !seen.has(w)) { seen.add(w); this.items.push({ id: l.id, layer: l.name, word: w, suggestions: s }); }
      }
    }
    if (!this.items.length) return false;
    this.pos = -1;
    this.next();
    this.open();
    return true;
  }

  close(): void {
    if (!this.isOpen) return;
    super.close();
    const edits = [...this.working].filter(([id, content]) => this.original.get(id) !== content).map(([id, content]) => ({ id, content }));
    if (edits.length) void this.engine.setTextContents(edits, 'Check Spelling');
  }

  /** Moves to the next word still worth asking about, or finishes. */
  private next(): void {
    let i = this.pos + 1;
    for (; i < this.items.length; i++) {
      const it = this.items[i];
      if (!this.ignored.has(it.word) && wordRe(it.word).test(this.working.get(it.id) ?? '')) break;
    }
    this.pos = i;
    const it = this.items[i];
    this.acts.forEach((b) => setDisabled(b, !it));
    if (!it) {
      setText(q(this.wordEl, 'strong'), '');
      setText(this.layerEl, '');
      this.list.replaceChildren();
      setValue(this.input, '');
      setText(this.note, 'Spelling check complete.');
      return;
    }
    setText(q(this.wordEl, 'strong'), it.word);
    setText(this.layerEl, `In layer: ${it.layer}`);
    this.list.replaceChildren(...it.suggestions.map((s) => new Option(s, s)));
    setValue(this.input, it.suggestions[0] ?? '');
    if (this.list.options.length) this.list.selectedIndex = 0;
    setText(this.note, it.suggestions.length ? '' : 'No suggestions. Type the correction, or ignore the word.');
  }

  private change(all: boolean): void {
    const it = this.items[this.pos];
    const to = this.input.value.trim();
    if (!it || !to) { setText(this.note, 'Type or choose the correction.'); return; }
    const re = wordRe(it.word);
    for (const [id, content] of this.working) {
      if (all || id === it.id) this.working.set(id, content.replace(re, () => to));
    }
    this.next();
  }

  private add(): void {
    const it = this.items[this.pos];
    if (!it) return;
    const mine = loadPrefs().spellWords;
    const w = it.word.toLowerCase();
    if (!mine.some((x) => x.toLowerCase() === w)) updatePrefs({ spellWords: [...mine, w] });
    this.ignored.add(it.word);
    this.next();
  }
}
