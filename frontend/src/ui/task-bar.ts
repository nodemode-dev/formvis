import { Viewport, type Engine } from '../engine';
import type { ViewInfo } from '../extensions/registry';
import type { Commands } from './commands';
import { delayedIndicator, el, q, setClass, setHidden, setText, setTitle, type Disposer } from './dom';
import { icon } from './icons';
import { onLanguage, t } from './i18n';
import { PopupMenu } from './menu';
import { GEN_CHANGED, genPrefs, saveGenPrefs } from '../io/gen-prefs';
import { fillChoices, modelChoices } from './panels/generative-prefs';

/** The Contextual Task Bar: a small pill floating over the canvas that puts the next likely steps in front of the
 *  person. With a selection it offers Generative Fill with a prompt, Remove, Invert, Feather and
 *  Deselect; with a picture and no selection, Select Subject, Remove Background, Generate Image, Generative Expand,
 *  Upscale and Relight; with no document, Generate Image and New Document. Every button runs the command the menus
 *  run, so what is off here is off there, with the reason as its tooltip. Built once: a change of state hides and shows
 *  groups and sets disabled, titles and text in place, and never rebuilds a node. */

type Mode = 'selection' | 'pixels' | 'empty';

interface Act {
  key: string;
  cmd: string;
  label: string;
  /** What the button does, as its tooltip while it is on. */
  tip: string;
  /** Why it is off, when nothing outside the document says. */
  why: string;
  icon: string;
  mode: Mode;
  /** Keeps its words when the stage is narrow; the others shrink to their icon. */
  lead?: boolean;
  /** Always an icon only; the label is its tooltip and accessible name. */
  bare?: boolean;
  primary?: boolean;
}

const ACTS: Act[] = [
  { key: 'generate', cmd: 'generative-fill', label: 'Generate', tip: 'Generative Fill: fills the selection from your description, or removes what is in it when the description is empty.', why: 'Make a selection first.', icon: 'generate', mode: 'selection', lead: true, primary: true },
  { key: 'remove', cmd: 'content-fill', label: 'Remove', tip: 'Fills the selection from its surroundings (Quick Content-Aware Fill).', why: 'Make a selection on a pixel layer first.', icon: 'tRemove', mode: 'selection', lead: true },
  { key: 'invert', cmd: 'inverse', label: 'Invert', tip: 'Selects everything except the current selection.', why: 'Make a selection first.', icon: 'invert', mode: 'selection', bare: true },
  { key: 'feather', cmd: 'feather', label: 'Feather...', tip: 'Softens the edge of the selection.', why: 'Make a selection first.', icon: 'feather', mode: 'selection', bare: true },
  { key: 'deselect', cmd: 'deselect', label: 'Deselect', tip: 'Drops the selection.', why: 'There is no selection.', icon: 'deselect', mode: 'selection', bare: true },
  { key: 'subject', cmd: 'select-subject', label: 'Select Subject', tip: 'Selects the main subject of the picture.', why: 'Open a picture first.', icon: 'wandSelect', mode: 'pixels', lead: true },
  { key: 'removebg', cmd: 'remove-bg', label: 'Remove Background', tip: 'Cuts the background out of the active layer.', why: 'Choose a layer that holds pixels first.', icon: 'removeBg', mode: 'pixels', lead: true },
  { key: 'image', cmd: 'generate-image', label: 'Generate Image...', tip: 'Makes a new picture from a description.', why: 'Generate Image is not available.', icon: 'generate', mode: 'pixels', lead: true },
  { key: 'expand', cmd: 'generative-expand', label: 'Generative Expand...', tip: 'Grows the canvas and fills the new area to match.', why: 'Open a picture first.', icon: 'expandCanvas', mode: 'pixels' },
  { key: 'upscale', cmd: 'upscale-2x', label: 'Upscale...', tip: 'Enlarges the picture two times.', why: 'Open a picture first.', icon: 'upscale', mode: 'pixels' },
  { key: 'relight', cmd: 'filter-relight', label: 'Relight...', tip: 'Adds lights to the picture on a Relight layer.', why: 'Open a picture first.', icon: 'relight', mode: 'pixels' },
  { key: 'image0', cmd: 'generate-image', label: 'Generate Image...', tip: 'Makes a new picture from a description.', why: 'Generate Image is not available.', icon: 'generate', mode: 'empty', lead: true, primary: true },
  { key: 'new', cmd: 'new', label: 'New Document...', tip: 'Starts a new, empty document.', why: 'New Document is not available.', icon: 'newFile', mode: 'empty', lead: true },
];

const KEY = 'formvis.taskBar';
/** Space kept clear inside the stage: the left and top clear the rulers that lie over its edges. */
const PAD = { l: 24, t: 24, r: 10, b: 10 };
/** The gap between a selection's box and the bar below (or above) it. */
const GAP = 12;

interface Saved { hidden: boolean; pinned: boolean; fx: number; fy: number }

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>;
    const f = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
    return { hidden: v.hidden === true, pinned: v.pinned === true, fx: f(v.fx), fy: f(v.fy) };
  } catch { return { hidden: false, pinned: false, fx: 0, fy: 0 }; }
}

export class TaskBar {
  private readonly bar: HTMLElement;
  private readonly grip: HTMLButtonElement;
  private readonly more: HTMLButtonElement;
  private readonly prompt: HTMLInputElement;
  private readonly model = el<HTMLSelectElement>('<select class="cv-tb-model" aria-label="Generative Fill model" title="The model Generate uses (also in Preferences > Generative)"><option value="">Model</option></select>');
  private readonly groups = new Map<Mode, HTMLElement>();
  private readonly busyGroup: HTMLElement;
  private readonly busyText: HTMLElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly menu: PopupMenu;
  private saved: Saved = load();
  private busyShown = false;
  private dismiss: Disposer | null = null;
  private job = '';
  private frame = 0;
  private at = { x: 0, y: 0 };
  private dragging = false;

  constructor(private readonly stage: HTMLElement, private readonly engine: Engine, private readonly commands: Commands, private readonly view: () => ViewInfo) {
    this.bar = el('<div class="cv-taskbar" role="toolbar" hidden></div>');
    this.grip = el<HTMLButtonElement>(`<button type="button" class="cv-tb-grip">${icon('grip', 14)}</button>`);
    this.bar.appendChild(this.grip);
    this.prompt = el<HTMLInputElement>('<input type="text" class="cv-tb-prompt" spellcheck="true" autocomplete="off">');
    for (const mode of ['selection', 'pixels', 'empty'] as const) {
      const g = el(`<div class="cv-tb-set" data-mode="${mode}" hidden></div>`);
      this.groups.set(mode, g);
      this.bar.appendChild(g);
      if (mode === 'selection') g.append(this.prompt, this.model);
      for (const a of ACTS.filter((x) => x.mode === mode)) {
        // The Remove button and the three after it sit after a divider, apart from the generative pair.
        if (a.key === 'remove') g.appendChild(el('<span class="cv-tb-sep" aria-hidden="true"></span>'));
        const b = el<HTMLButtonElement>(`<button type="button" class="cv-tb-btn${a.primary ? ' is-primary' : ''}${a.lead ? ' is-lead' : ''}${a.bare ? ' is-bare' : ''}" data-act="${a.key}">${icon(a.icon, 16)}<span class="cv-tb-lbl"></span></button>`);
        b.addEventListener('click', () => this.activate(a));
        this.buttons.set(a.key, b);
        g.appendChild(b);
      }
    }
    this.busyGroup = el(`<div class="cv-tb-set cv-tb-busy" role="status" hidden>${icon('loading', 14)}<span class="cv-tb-busy-text"></span></div>`);
    this.busyText = q(this.busyGroup, '.cv-tb-busy-text');
    this.bar.appendChild(this.busyGroup);
    this.more = el<HTMLButtonElement>(`<button type="button" class="cv-tb-more" aria-haspopup="menu">${icon('more3', 14)}</button>`);
    this.bar.appendChild(this.more);
    stage.appendChild(this.bar);
    this.menu = new PopupMenu(commands, null, true);

    // The model Generate starts with (1.96.2): Preferences > Generative's Generative Fill choice, picked here too.
    const loadModels = (): void => { void modelChoices('fill').then((c) => fillChoices(this.model, c, genPrefs().fill)); };
    this.model.addEventListener('pointerdown', loadModels);
    this.model.addEventListener('change', () => saveGenPrefs({ fill: this.model.value }));
    window.addEventListener(GEN_CHANGED, () => { const v = genPrefs().fill; if ([...this.model.options].some((o) => o.value === v)) { if (this.model.value !== v) this.model.value = v; } else loadModels(); });
    loadModels();
    this.prompt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const a = ACTS[0]; this.activate(a); }
      else if (e.key === 'Escape') { e.stopPropagation(); this.prompt.blur(); }
    });
    this.more.addEventListener('click', () => {
      this.menu.setItems(['task-bar-pin', 'task-bar-reset', '-', 'toggle-task-bar']);
      const r = this.more.getBoundingClientRect();
      if (this.menu.isOpen) this.menu.close(); else this.menu.openAt(r.left, r.bottom + 4);
    });
    this.bindDrag();

    for (const k of ['projects', 'doc', 'selection', 'active', 'history', 'options', 'tool', 'viewport'] as const) this.engine.on(k, () => this.queue());
    this.engine.on('busy', (on: boolean) => {
      if (on) { if (!this.dismiss) this.dismiss = delayedIndicator(() => { this.busyShown = true; this.queue(); }, () => { this.busyShown = false; this.job = ''; this.queue(); }); }
      else { this.dismiss?.(); this.dismiss = null; }
      this.queue();
    });
    new ResizeObserver(() => this.queue()).observe(this.stage);
    new ResizeObserver(() => this.queue()).observe(this.bar);
    const side = document.querySelector('.cv-props-col');   // opening or closing it changes the room without changing the stage
    if (side) new ResizeObserver(() => this.queue()).observe(side);
    onLanguage(() => this.relabel());
    this.relabel();
    setHidden(this.bar, this.saved.hidden);
    this.queue();
  }

  /** The width of the stage the canvas really has: the Properties column, opened, lies over the stage's right edge. */
  private get room(): number { return Math.max(0, this.stage.clientWidth - Viewport.insetRight); }

  get hidden(): boolean { return this.saved.hidden; }
  get pinned(): boolean { return this.saved.pinned; }

  /** Shows the bar if it is hidden, hides it if it is shown (View > Contextual Task Bar). */
  toggle(): void {
    this.saved.hidden = !this.saved.hidden;
    this.save();
    setHidden(this.bar, this.saved.hidden);
    this.queue();
  }

  /** Pins the bar where it stands, or lets it follow the selection and the default place again. */
  togglePin(): void {
    if (this.saved.pinned) { this.saved.pinned = false; }
    else { this.saved.pinned = true; this.remember(); }
    this.save();
    this.queue();
  }

  /** Back to the bottom centre of the stage and to following the selection. */
  reset(): void {
    this.saved = { ...this.saved, pinned: false, fx: 0, fy: 0 };
    this.save();
    this.queue();
  }

  private save(): void {
    try { localStorage.setItem(KEY, JSON.stringify(this.saved)); } catch { return; }
  }

  private activate(a: Act): void {
    const b = this.buttons.get(a.key);
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    this.job = t(a.label).replace(/\.\.\.$/, '');
    // Generate hands its prompt to Generative Fill, which starts at once when its model needs nothing more.
    this.commands.run(a.cmd, a.key === 'generate' ? { prompt: this.prompt.value.trim() } : undefined);
  }

  /** The words, in the current language: set again in place when it changes. */
  private relabel(): void {
    for (const a of ACTS) {
      const b = this.buttons.get(a.key) as HTMLButtonElement;
      setText(q(b, '.cv-tb-lbl'), t(a.label));
      b.setAttribute('aria-label', t(a.label));
    }
    const ph = t('Describe what to generate (optional)');
    if (this.prompt.placeholder !== ph) this.prompt.placeholder = ph;
    this.prompt.setAttribute('aria-label', ph);
    this.bar.setAttribute('aria-label', t('Contextual Task Bar'));
    setTitle(this.grip, t('Drag to move the task bar'));
    this.grip.setAttribute('aria-label', t('Move the task bar (arrow keys move it)'));
    setTitle(this.more, t('Task bar options'));
    this.more.setAttribute('aria-label', t('Task bar options'));
    this.sync();
  }

  /** One pass per frame, whatever the number of events that asked. */
  private queue(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; if (!this.saved.hidden) { this.sync(); this.place(); } });
  }

  private mode(): Mode {
    const p = this.engine.current;
    return !p ? 'empty' : p.selection ? 'selection' : 'pixels';
  }

  /** The state in the nodes that are already there: which group shows, which buttons are on, and why a button is off. */
  private sync(): void {
    const mode = this.mode(), busy = this.engine.busy;
    for (const [m, g] of this.groups) setHidden(g, this.busyShown || m !== mode);
    setHidden(this.busyGroup, !this.busyShown);
    setText(this.busyText, `${this.job || t('Working')}...`);
    for (const a of ACTS) {
      if (a.mode !== mode) continue;
      const b = this.buttons.get(a.key) as HTMLButtonElement;
      const cmd = this.commands.get(a.cmd);
      const out = cmd ? this.commands.why(cmd) : '';
      const on = !!cmd && !busy && !out && this.commands.enabled(cmd);
      const reason = busy ? t('Wait for the current job to finish.') : out ? t(out) : t(a.why);
      const off = on ? 'false' : 'true';
      if (b.getAttribute('aria-disabled') !== off) b.setAttribute('aria-disabled', off);
      setClass(b, 'is-off', !on);
      setTitle(b, on ? t(a.tip) : `${t(a.label)}: ${reason}`);
    }
    const narrow = this.room;
    setClass(this.bar, 'is-compact', narrow < 900);
    setClass(this.bar, 'is-tiny', narrow < 560);
  }

  /** Where the bar sits: where it was pinned; else just below the selection's box (above it when there is no room
   *  below), clamped inside the stage; else at the bottom centre. */
  private place(): void {
    if (this.dragging || this.bar.hidden) return;
    const W = this.room, H = this.stage.clientHeight, bw = this.bar.offsetWidth, bh = this.bar.offsetHeight;
    if (!W || !H || !bw) return;
    const minX = PAD.l, maxX = Math.max(minX, W - bw - PAD.r), minY = PAD.t, maxY = Math.max(minY, H - bh - PAD.b);
    let x = (W - bw) / 2, y = maxY;
    if (this.saved.pinned) {
      x = minX + this.saved.fx * (maxX - minX);
      y = minY + this.saved.fy * (maxY - minY);
    } else {
      const box = this.selectionBox(W, H);
      if (box) {
        x = (box.l + box.r) / 2 - bw / 2;
        y = box.b + GAP;
        if (y > maxY) { const above = box.t - GAP - bh; y = above >= minY ? above : maxY; }
      }
    }
    this.put(x, y, minX, maxX, minY, maxY);
  }

  /** The selection's bounding box in stage pixels, trimmed to what the stage shows; null with no selection or none of it in view. */
  private selectionBox(W: number, H: number): { l: number; t: number; r: number; b: number } | null {
    const s = this.engine.current?.selection;
    if (!s) return null;
    const v = this.view();
    const a = v.toScreen({ x: s.x, y: s.y }), c = v.toScreen({ x: s.x + s.w, y: s.y }), d = v.toScreen({ x: s.x, y: s.y + s.h }), e = v.toScreen({ x: s.x + s.w, y: s.y + s.h });
    const l = Math.max(0, Math.min(a.x, c.x, d.x, e.x)), r = Math.min(W, Math.max(a.x, c.x, d.x, e.x));
    const top = Math.max(0, Math.min(a.y, c.y, d.y, e.y)), b = Math.min(H, Math.max(a.y, c.y, d.y, e.y));
    return r > l && b > top ? { l, t: top, r, b } : null;
  }

  private put(x: number, y: number, minX: number, maxX: number, minY: number, maxY: number): void {
    const px = Math.round(Math.min(maxX, Math.max(minX, x))), py = Math.round(Math.min(maxY, Math.max(minY, y)));
    this.at = { x: px, y: py };
    const tf = `translate(${px}px, ${py}px)`;
    if (this.bar.style.transform !== tf) this.bar.style.transform = tf;
    if (!this.bar.classList.contains('is-placed')) this.bar.classList.add('is-placed');
  }

  /** The bar's place as fractions of the room the stage leaves it, so a pinned bar keeps its spot when the window resizes. */
  private remember(): void {
    const W = this.room, H = this.stage.clientHeight, bw = this.bar.offsetWidth, bh = this.bar.offsetHeight;
    const rx = Math.max(1, W - bw - PAD.r - PAD.l), ry = Math.max(1, H - bh - PAD.b - PAD.t);
    this.saved.fx = Math.min(1, Math.max(0, (this.at.x - PAD.l) / rx));
    this.saved.fy = Math.min(1, Math.max(0, (this.at.y - PAD.t) / ry));
  }

  private move(x: number, y: number): void {
    const W = this.room, H = this.stage.clientHeight, bw = this.bar.offsetWidth, bh = this.bar.offsetHeight;
    this.put(x, y, PAD.l, Math.max(PAD.l, W - bw - PAD.r), PAD.t, Math.max(PAD.t, H - bh - PAD.b));
  }

  /** Moving the bar by its grip pins it where it is let go; the arrow keys move it too. */
  private bindDrag(): void {
    let id: number | null = null, ox = 0, oy = 0;
    const done = (): void => {
      if (id === null) return;
      id = null;
      this.dragging = false;
      setClass(this.bar, 'is-dragging', false);
      this.saved.pinned = true;
      this.remember();
      this.save();
    };
    this.grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      id = e.pointerId;
      this.grip.setPointerCapture(e.pointerId);
      const b = this.bar.getBoundingClientRect(), s = this.stage.getBoundingClientRect();
      ox = e.clientX - b.left; oy = e.clientY - b.top;
      this.at = { x: Math.round(b.left - s.left), y: Math.round(b.top - s.top) };
      this.dragging = true;
      setClass(this.bar, 'is-dragging', true);
    });
    this.grip.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const s = this.stage.getBoundingClientRect();
      this.move(e.clientX - s.left - ox, e.clientY - s.top - oy);
    });
    this.grip.addEventListener('pointerup', done);
    this.grip.addEventListener('pointercancel', done);
    this.grip.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 40 : 10;
      const d = e.key === 'ArrowLeft' ? [-step, 0] : e.key === 'ArrowRight' ? [step, 0] : e.key === 'ArrowUp' ? [0, -step] : e.key === 'ArrowDown' ? [0, step] : null;
      if (!d) return;
      e.preventDefault();
      this.move(this.at.x + d[0], this.at.y + d[1]);
      this.saved.pinned = true;
      this.remember();
      this.save();
    });
  }
}
