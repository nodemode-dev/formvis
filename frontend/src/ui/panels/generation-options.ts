import { el, setHidden, setText } from '../dom';

/** Seed and negative prompt for Generate (panel and dialog). Seed: Random, Fixed (a number, or the dice) or Reuse last
 *  (the seed of the previous picture, which fal and local models both report back). The negative prompt goes to models on
 *  this computer, the only route that takes one; the seed goes to fal and to models on this computer. Built once, then
 *  patched in place. */
export class GenerationOptions {
  readonly el = el('<div class="cv-genopts"></div>');
  private readonly mode = el<HTMLSelectElement>('<select class="cv-input" aria-label="Seed"><option value="random">Seed: random</option><option value="fixed">Seed: fixed</option><option value="last">Seed: reuse last</option></select>');
  private readonly seed = el<HTMLInputElement>('<input class="cv-input" type="number" min="0" max="2147483647" step="1" aria-label="Seed number" placeholder="Seed">');
  private readonly dice = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" title="Pick a random seed and keep it fixed" aria-label="Random seed">Dice</button>');
  private readonly note = el('<span class="cv-note cv-improve-note" role="status"></span>');
  private readonly negative = el<HTMLInputElement>('<input class="cv-input" type="text" spellcheck="true" aria-label="Negative prompt" placeholder="Negative prompt: what to keep out">');
  private last: number | null = null;
  private kind: 'local' | 'fal' | 'other' = 'fal';

  constructor() {
    const row = el('<div class="cv-improve"></div>');
    row.append(this.mode, this.seed, this.dice, this.note);
    this.el.append(row, this.negative);
    this.mode.addEventListener('change', () => this.paint());
    this.dice.addEventListener('click', () => { this.seed.value = String(Math.floor(Math.random() * 2147483647)); this.mode.value = 'fixed'; this.paint(); });
    this.paint();
  }

  /** The route the chosen model takes: 'local' (this computer), 'fal', or another provider or a workflow, which take neither. */
  forModel(choice: string): void {
    const kind = choice.startsWith('local:') ? 'local' : choice === 'fal' ? 'fal' : 'other';
    if (kind === this.kind) return;
    this.kind = kind;
    this.paint();
  }

  private paint(): void {
    const used = this.kind !== 'other', fixed = this.mode.value === 'fixed';
    if (this.mode.disabled !== !used) this.mode.disabled = !used;
    if (this.dice.disabled !== !used) this.dice.disabled = !used;
    setHidden(this.seed, this.mode.value !== 'fixed');
    if (this.seed.disabled !== !fixed) this.seed.disabled = !fixed;
    const neg = this.kind !== 'local';
    if (this.negative.disabled !== neg) this.negative.disabled = neg;
    const title = neg ? 'Only models on this computer take a negative prompt' : 'Krea 2 uses it with a CFG scale other than 1';
    if (this.negative.title !== title) this.negative.title = title;
    setText(this.note, !used ? 'This model takes no seed.' : this.mode.value === 'last' ? (this.last === null ? 'No earlier seed yet: random.' : `Seed ${this.last}`) : this.last !== null ? `Last seed ${this.last}` : '');
  }

  /** What to send: the seed (undefined for the engine to choose, on this computer) and the negative prompt. */
  request(): { seed: number | undefined; negative: string } {
    let seed: number | undefined;
    if (this.kind === 'other') seed = undefined;
    else if (this.mode.value === 'fixed' && this.seed.value.trim() !== '') seed = Math.max(0, Math.floor(Number(this.seed.value)) || 0) % 2147483648;
    else if (this.mode.value === 'last' && this.last !== null) seed = this.last;
    else if (this.kind === 'fal') seed = Math.floor(Math.random() * 2147483647);   // fal does not report one, so choose it here to be able to reuse it
    return { seed, negative: this.kind === 'local' ? this.negative.value.trim() : '' };
  }

  /** The seed of the picture just made, for Reuse last. */
  used(seed: number | undefined): void {
    if (typeof seed !== 'number') return;
    this.last = seed;
    this.paint();
  }
}
