import { el, patchList, setHidden, setText } from '../dom';

/** Named steps and CFG settings kept per local model in this browser. */
const PRESETS_KEY = 'formvis.genSettings';
type Setting = { steps: number | null; guidance: number | null };
function readPresets(): Record<string, Record<string, Setting>> {
  try { const r = JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '{}'); return r && typeof r === 'object' ? r : {}; } catch { return {}; }
}
function writePresets(all: Record<string, Record<string, Setting>>): void { try { localStorage.setItem(PRESETS_KEY, JSON.stringify(all)); } catch { /* storage may be blocked */ } }

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
  private readonly steps = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="50" step="1" aria-label="Steps" placeholder="Steps" title="Steps (empty: the model\'s own)">');
  private readonly cfg = el<HTMLInputElement>('<input class="cv-input" type="number" min="0" max="15" step="0.1" aria-label="CFG scale" placeholder="CFG" title="CFG scale (empty: the model\'s own; Krea 2 uses it with a negative prompt)">');
  private readonly preset = el<HTMLSelectElement>('<select class="cv-input" aria-label="Setting preset"></select>');
  private readonly keep = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" title="Keep these steps and CFG as a named preset for this model">Keep</button>');
  private readonly drop = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" title="Remove the chosen preset" disabled>Remove</button>');
  private readonly nameIn = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="40" aria-label="Preset name" placeholder="Preset name" spellcheck="false">');
  private readonly recipeRow = el('<div class="cv-improve cv-genopts-recipe"></div>');
  private choice = '';
  private last: number | null = null;
  private kind: 'local' | 'fal' | 'other' = 'fal';

  constructor() {
    const row = el('<div class="cv-improve"></div>');
    row.append(this.mode, this.seed, this.dice, this.note);
    this.recipeRow.append(this.steps, this.cfg, this.preset, this.nameIn, this.keep, this.drop);
    this.el.append(row, this.negative, this.recipeRow);
    this.preset.addEventListener('change', () => this.usePreset());
    this.keep.addEventListener('click', () => this.keepPreset());
    this.drop.addEventListener('click', () => this.dropPreset());
    this.mode.addEventListener('change', () => this.paint());
    this.dice.addEventListener('click', () => { this.seed.value = String(Math.floor(Math.random() * 2147483647)); this.mode.value = 'fixed'; this.paint(); });
    this.paint();
  }

  /** The route the chosen model takes: 'local' (this computer), 'fal', or another provider or a workflow, which take neither. */
  forModel(choice: string): void {
    const kind = choice.startsWith('local:') ? 'local' : choice === 'fal' ? 'fal' : 'other';
    const moved = choice !== this.choice;
    this.choice = choice;
    if (kind === this.kind && !moved) return;
    this.kind = kind;
    if (moved) this.fillPresets();
    this.paint();
  }

  /** The presets kept for the model chosen, patched into the picker in place. */
  private fillPresets(): void {
    const names = Object.keys(readPresets()[this.choice] ?? {}), was = this.preset.value;
    patchList(this.preset, ['', ...names], {
      key: (n) => `p:${n}`,
      create: (n) => { const o = document.createElement('option'); o.value = n; o.textContent = n || 'Settings: model default'; return o; },
      update: () => {},
    });
    this.preset.value = names.includes(was) ? was : '';
    if (!names.includes(was)) { this.steps.value = ''; this.cfg.value = ''; }
    this.drop.disabled = this.kind !== 'local' || !this.preset.value;
  }

  private usePreset(): void {
    const s = readPresets()[this.choice]?.[this.preset.value];
    this.steps.value = s?.steps ? String(s.steps) : '';
    this.cfg.value = s && s.guidance !== null ? String(s.guidance) : '';
    this.drop.disabled = !this.preset.value;
  }

  private keepPreset(): void {
    const name = this.nameIn.value.trim().slice(0, 40);
    if (!name) { this.nameIn.focus(); return; }
    this.nameIn.value = '';
    const all = readPresets(), mine = all[this.choice] ?? {};
    mine[name] = this.setting();
    all[this.choice] = mine;
    writePresets(all);
    this.fillPresets();
    this.preset.value = name;
    this.drop.disabled = false;
  }

  private dropPreset(): void {
    const all = readPresets(), mine = all[this.choice];
    if (!mine || !this.preset.value) return;
    delete mine[this.preset.value];
    writePresets(all);
    this.preset.value = '';
    this.fillPresets();
  }

  private setting(): Setting {
    const steps = Math.round(Number(this.steps.value)), guidance = Number(this.cfg.value);
    return { steps: this.steps.value.trim() !== '' && steps >= 1 ? Math.min(50, steps) : null, guidance: this.cfg.value.trim() !== '' && guidance >= 0 ? Math.min(15, guidance) : null };
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
    for (const c of [this.steps, this.cfg, this.preset, this.nameIn, this.keep]) if (c.disabled !== neg) c.disabled = neg;
    const noDrop = neg || !this.preset.value;
    if (this.drop.disabled !== noDrop) this.drop.disabled = noDrop;
    setText(this.note, !used ? 'This model takes no seed.' : this.mode.value === 'last' ? (this.last === null ? 'No earlier seed yet: random.' : `Seed ${this.last}`) : this.last !== null ? `Last seed ${this.last}` : '');
  }

  /** What to send: the seed (undefined for the engine to choose, on this computer) and the negative prompt. */
  request(): { seed: number | undefined; negative: string; steps?: number; guidance?: number } {
    let seed: number | undefined;
    if (this.kind === 'other') seed = undefined;
    else if (this.mode.value === 'fixed' && this.seed.value.trim() !== '') seed = Math.max(0, Math.floor(Number(this.seed.value)) || 0) % 2147483648;
    else if (this.mode.value === 'last' && this.last !== null) seed = this.last;
    else if (this.kind === 'fal') seed = Math.floor(Math.random() * 2147483647);   // fal does not report one, so choose it here to be able to reuse it
    const s = this.kind === 'local' ? this.setting() : { steps: null, guidance: null };
    return { seed, negative: this.kind === 'local' ? this.negative.value.trim() : '', ...(s.steps !== null ? { steps: s.steps } : {}), ...(s.guidance !== null ? { guidance: s.guidance } : {}) };
  }

  /** The seed of the picture just made, for Reuse last. */
  used(seed: number | undefined): void {
    if (typeof seed !== 'number') return;
    this.last = seed;
    this.paint();
  }
}
