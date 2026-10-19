import type { Engine } from '../../engine';
import { api, onServiceChange, serviceReady, type GenerativeStatus, type ProviderStatus } from '../../io/api';
import { el, patchList, q, setHidden, setText, setTitle, setValue } from '../dom';
import { icon } from '../icons';
import { onLanguage, t } from '../i18n';
import { PanelGroup } from '../panel-group';
import { BoxesSection } from '../boxes-panel';
import { loadPrefs, recalled, remembered, updatePrefs } from '../prefs';
import { SIZES, fillModelPicker, generationModels, runGeneration } from './generate-image';
import { comfyuiStatusText, nodemodeStatusText } from './send-to';
import { GenerationOptions } from './generation-options';
import { PromptHistory } from './prompt-history';

/** The Generate panel (Window > Generate): the generative side of formvis in one place, always in reach. Generate makes a
 *  picture from a prompt with any model Generate Image offers (the same list and the same run); Edit with AI puts the
 *  generative commands under the selection, each running its own command so it is on or off as in the menus; Connections
 *  holds the ComfyUI and NodeMode addresses with a Test for each, and the API keys of the cloud providers (kept by the
 *  engine, never shown back). Built once; everything after changes text, state and attributes in place. */

export interface GeneratePanelDeps {
  /** Runs a command by id, as the menus do; false when it did not run. */
  run: (id: string, params?: Record<string, unknown>) => boolean;
  /** Whether a command can run now, and the reason from outside the document when it cannot. */
  state: (id: string) => { enabled: boolean; why: string };
  toast: (text: string, kind?: 'info' | 'error') => void;
  /** A local model's notice and the filter's warning, shown with its picture. */
  heard: (r: { notice?: string; warning?: string; notes: string[] }) => void;
}

type SecId = 'gen' | 'boxes' | 'edit' | 'conn';
type Kind = 'comfyui' | 'nodemode';
type Dot = 'up' | 'down' | 'unchecked';

interface Act { key: string; cmd: string; label: string; icon: string; tip: string; group: 'edit' | 'conn'; needs?: 'selection' }

const ACTS: readonly Act[] = [
  { key: 'fill', cmd: 'generative-fill', label: 'Generative Fill', icon: 'tWand', group: 'edit', needs: 'selection', tip: 'Fills the selection from the prompt, or removes what is in it when the prompt is empty.' },
  { key: 'replace', cmd: 'generative-fill', label: 'Replace', icon: 'genReplace', group: 'edit', needs: 'selection', tip: 'Generative Fill with the prompt written above.' },
  { key: 'remove', cmd: 'generate-remove', label: 'Remove / Repair', icon: 'tRemove', group: 'edit', tip: 'Fills the selection from its surroundings.' },
  { key: 'expand', cmd: 'generative-expand', label: 'Generative Expand', icon: 'expandCanvas', group: 'edit', tip: 'Grows the canvas and fills the new area to match.' },
  { key: 'removebg', cmd: 'remove-bg', label: 'Remove Background', icon: 'removeBg', group: 'edit', tip: 'Cuts the background out of the active layer.' },
  { key: 'relight', cmd: 'filter-relight', label: 'Relight', icon: 'relight', group: 'edit', tip: 'Adds lights to the picture on a Relight layer.' },
  { key: 'up2', cmd: 'upscale-2x', label: 'Upscale 2x', icon: 'upscale', group: 'edit', tip: 'Enlarges the picture two times, as a new document.' },
  { key: 'up4', cmd: 'upscale-4x', label: 'Upscale 4x', icon: 'upscale', group: 'edit', tip: 'Enlarges the picture four times, as a new document.' },
  { key: 'run', cmd: 'comfyui-run', label: 'Run ComfyUI Workflow...', icon: 'genPlug', group: 'conn', tip: 'Runs a workflow saved from ComfyUI with Export (API) on this picture.' },
  { key: 'tocomfy', cmd: 'send-comfyui', label: 'Send to ComfyUI...', icon: 'send', group: 'conn', tip: 'Sends the picture, a layer or the selection to ComfyUI.' },
  { key: 'tonode', cmd: 'send-nodemode', label: 'Send to NodeMode...', icon: 'genNodes', group: 'conn', tip: 'Sends the picture, a layer or the selection to NodeMode.' },
];

const FOLDS = 'formvis.generatePanel';
const NAME = 'Generate Panel';

function loadFolds(): Record<SecId, boolean> {
  try {
    const r = JSON.parse(localStorage.getItem(FOLDS) ?? '{}') as Partial<Record<SecId, unknown>>;
    return { gen: r.gen !== false, boxes: r.boxes !== false, edit: r.edit !== false, conn: r.conn === true };
  } catch { return { gen: true, boxes: true, edit: true, conn: false }; }
}

function setAttr(node: Element, name: string, value: string): void { if (node.getAttribute(name) !== value) node.setAttribute(name, value); }

interface Conn {
  kind: Kind;
  name: string;
  root: HTMLElement;
  dot: HTMLElement;
  stateText: HTMLElement;
  input: HTMLInputElement;
  testBtn: HTMLButtonElement;
  testLabel: HTMLElement;
  msg: HTMLElement;
  state: Dot;
  busy: boolean;
}

interface KeyRow { id: string; name: string; configured: boolean; source: 'environment' | 'settings' | null; engine: boolean }

export class GeneratePanel {
  readonly group: PanelGroup;
  private readonly body: HTMLElement;
  private readonly prompt: HTMLTextAreaElement;
  private readonly model: HTMLSelectElement;
  private readonly size: HTMLSelectElement;
  private readonly custom: HTMLElement;
  private readonly cw: HTMLInputElement;
  private readonly ch: HTMLInputElement;
  private readonly go: HTMLButtonElement;
  private readonly goLabel: HTMLElement;
  private readonly status: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly linkHint: HTMLElement;
  private readonly keyList: HTMLElement;
  private readonly keyMsg: HTMLElement;
  private readonly secs = new Map<SecId, { head: HTMLButtonElement; body: HTMLElement }>();
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly conns: Record<Kind, Conn>;
  private providers: ProviderStatus[] = [];
  private fal: GenerativeStatus | null = null;
  private chosen: string | null = null;
  private readonly opts = new GenerationOptions();
  private readonly promptHistory: PromptHistory;
  private busy = false;
  private stopped = false;
  private frame = 0;
  private modelRun = 0;
  private lastModels = 0;

  constructor(host: HTMLElement, private readonly engine: Engine, private readonly deps: GeneratePanelDeps) {
    const folds = loadFolds();
    this.body = el(`<div class="cv-genp">
      <section class="cv-genp-sec" data-sec="gen">
        <button class="cv-genp-sechead" type="button" aria-expanded="true">${icon('chevronDown', 12)}<span data-t="Generate"></span></button>
        <div class="cv-genp-secbody">
          <textarea class="cv-input cv-genp-prompt" rows="3" spellcheck="true" data-t-ph="Describe the image to generate" data-t-aria="Prompt"></textarea>
          <label class="cv-genp-row"><span data-t="Model"></span><select class="cv-input cv-genp-model" data-t-aria="Model"><option value="fal" data-key="fal">FLUX1.1 [pro] (fal)</option></select></label>
          <label class="cv-genp-row"><span data-t="Size"></span><select class="cv-input cv-genp-size" data-t-aria="Size"></select></label>
          <div class="cv-genp-row cv-genp-custom" hidden><span></span><div class="cv-genp-wh"><input class="cv-input cv-genp-cw" type="number" min="256" max="2048" step="16" value="1024" data-t-aria="Width"><input class="cv-input cv-genp-ch" type="number" min="256" max="2048" step="16" value="1024" data-t-aria="Height"></div></div>
          <button class="cv-genp-go" type="button">${icon('generate', 14)}<span class="cv-genp-golabel"></span></button>
          <p class="cv-note cv-genp-status" role="status"></p>
        </div>
      </section>
      <section class="cv-genp-sec" data-sec="boxes">
        <button class="cv-genp-sechead" type="button" aria-expanded="true">${icon('chevronDown', 12)}<span data-t="Boxes"></span></button>
        <div class="cv-genp-secbody"><div class="cv-genp-boxes"></div></div>
      </section>
      <section class="cv-genp-sec" data-sec="edit">
        <button class="cv-genp-sechead" type="button" aria-expanded="true">${icon('chevronDown', 12)}<span data-t="Edit with AI"></span></button>
        <div class="cv-genp-secbody">
          <div class="cv-genp-acts" role="group" data-t-aria="Edit with AI"></div>
          <p class="cv-note cv-genp-hint" role="status"></p>
        </div>
      </section>
      <section class="cv-genp-sec" data-sec="conn">
        <button class="cv-genp-sechead" type="button" aria-expanded="true">${icon('chevronDown', 12)}<span data-t="Connections"></span></button>
        <div class="cv-genp-secbody">
          <div class="cv-genp-conns"></div>
          <div class="cv-genp-keys-title"><span data-t="API providers"></span></div>
          <div class="cv-genp-keys"></div>
          <p class="cv-note cv-genp-keymsg" role="status"></p>
          <div class="cv-genp-acts cv-genp-links" role="group" data-t-aria="Connections"></div>
          <p class="cv-note cv-genp-linkhint" role="status"></p>
        </div>
      </section>
    </div>`);
    const b = this.body;
    this.prompt = q<HTMLTextAreaElement>(b, '.cv-genp-prompt');
    this.model = q<HTMLSelectElement>(b, '.cv-genp-model');
    this.size = q<HTMLSelectElement>(b, '.cv-genp-size');
    this.custom = q(b, '.cv-genp-custom');
    this.cw = q<HTMLInputElement>(b, '.cv-genp-cw');
    this.ch = q<HTMLInputElement>(b, '.cv-genp-ch');
    this.go =q<HTMLButtonElement>(b, '.cv-genp-go');
    this.goLabel = q(b, '.cv-genp-golabel');
    this.status = q(b, '.cv-genp-status');
    this.hint = q(b, '.cv-genp-hint');
    this.linkHint = q(b, '.cv-genp-linkhint');
    this.keyList = q(b, '.cv-genp-keys');
    this.keyMsg = q(b, '.cv-genp-keymsg');

    // Size: the picture's own, then the shapes above.
    const customOpt = el<HTMLOptionElement>('<option value="custom"></option>');
    customOpt.dataset.t = 'Custom width and height';
    this.size.append(el('<option value="doc"></option>'), ...SIZES.map(([id, label]) => { const o = el<HTMLOptionElement>(`<option value="${id}"></option>`); o.dataset.t = label; return o; }), customOpt);
    const savedSize = recalled(NAME, 'size');
    if (typeof savedSize === 'string' && [...this.size.options].some((o) => o.value === savedSize)) this.size.value = savedSize;
    const savedWh = recalled(NAME, 'custom');
    const whParts = typeof savedWh === 'string' ? savedWh.split('x').map(Number) : [];
    if (whParts.length === 2) { this.cw.value = String(this.side(whParts[0])); this.ch.value = String(this.side(whParts[1])); }
    setHidden(this.custom, this.size.value !== 'custom');
    const savedModel = recalled(NAME, 'model');
    this.chosen = typeof savedModel === 'string' ? savedModel : null;

    // The sections fold, each remembered on this device.
    for (const sec of b.querySelectorAll<HTMLElement>('.cv-genp-sec')) {
      const id = sec.dataset.sec as SecId, head = q<HTMLButtonElement>(sec, '.cv-genp-sechead');
      this.secs.set(id, { head, body: q(sec, '.cv-genp-secbody') });
      head.addEventListener('click', () => this.setOpen(id, head.getAttribute('aria-expanded') !== 'true'));
      this.setOpen(id, folds[id], false);
    }

    // The buttons of Edit with AI and of Connections: each runs its command.
    for (const a of ACTS) {
      const btn = el<HTMLButtonElement>(`<button class="cv-btn cv-genp-act" type="button" aria-disabled="false">${icon(a.icon, 15)}<span class="cv-genp-actlabel"></span></button>`);
      btn.dataset.act = a.key;
      btn.addEventListener('click', () => this.activate(a));
      this.buttons.set(a.key, btn);
      q(b, a.group === 'edit' ? '.cv-genp-acts:not(.cv-genp-links)' : '.cv-genp-links').appendChild(btn);
    }

    new BoxesSection(q(b, '.cv-genp-boxes'), engine, (text) => setText(this.status, text));
    this.conns = { comfyui: this.makeConn('comfyui', 'ComfyUI'), nodemode: this.makeConn('nodemode', 'NodeMode') };
    q(b, '.cv-genp-conns').append(this.conns.comfyui.root, this.conns.nodemode.root);

    this.go.parentElement?.insertBefore(this.opts.el, this.go);
    this.promptHistory = new PromptHistory(this.prompt);
    this.go.addEventListener('click', () => void this.generate());
    this.prompt.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void this.generate(); } });
    this.model.addEventListener('change', () => { this.chosen = this.model.value; remembered(NAME, 'model', this.model.value); this.opts.forModel(this.model.value); });
    this.size.addEventListener('change', () => { remembered(NAME, 'size', this.size.value); setHidden(this.custom, this.size.value !== 'custom'); });
    for (const f of [this.cw, this.ch]) {
      f.addEventListener('change', () => { f.value = String(this.side(Number(f.value))); remembered(NAME, 'custom', `${this.side(Number(this.cw.value))}x${this.side(Number(this.ch.value))}`); });
      f.addEventListener('keydown', (e) => e.stopPropagation());
    }
    this.keyList.addEventListener('click', (e) => { const btn = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('.cv-genp-save') : null; const row = btn?.closest<HTMLElement>('[data-key]'); if (row) void this.saveKey(row); });
    this.keyList.addEventListener('keydown', (e) => { if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return; const row = e.target.closest<HTMLElement>('[data-key]'); if (row) { e.preventDefault(); void this.saveKey(row); } });

    this.group = new PanelGroup(host, 'generate', [{ id: 'generate', label: 'Generate', body: this.body }], 'Generate');
    this.group.setMenu(() => ['generate-image', 'generative-fill', 'generative-expand', '-', 'generate-remove', 'remove-bg', 'upscale-2x', 'upscale-4x', 'filter-relight', '-', 'comfyui-run', 'send-comfyui', 'send-nodemode']);

    this.retext();
    this.paintGo();
    this.refreshUrls();
    this.renderKeys();
    this.sync();
    for (const ev of ['projects', 'doc', 'selection', 'active', 'history', 'tool'] as const) this.engine.on(ev, () => this.queue());
    // Hovering the panel refreshes what can change behind it: the commands, the addresses, the models (at most every ten seconds).
    this.group.root.addEventListener('pointerenter', () => { this.sync(); this.refreshUrls(); if (Date.now() - this.lastModels > 10_000) void this.refreshModels(); });
    onLanguage(() => { this.retext(); this.paintGo(); for (const c of Object.values(this.conns)) this.paintConn(c); this.renderKeys(); this.sync(); });
    onServiceChange((up) => { if (up) void this.refresh(); else { this.fal = null; this.providers = []; this.renderKeys(); this.sync(); } });
    void serviceReady().then(() => this.refresh());
  }

  /** Window > Generate and the Generate Panel command: open, unfolded, with the prompt ready. */
  reveal(): void {
    this.group.setMinimised(false);
    this.setOpen('gen', true);
    this.prompt.focus();
  }

  /** Brings a key row into view for the model chosen, when its key is missing. */
  private openKey(id: string): void {
    this.group.setMinimised(false);
    this.setOpen('conn', true);
    this.keyList.querySelector<HTMLInputElement>(`[data-key="${id}"] input`)?.focus();
  }

  private setOpen(id: SecId, open: boolean, remember = true): void {
    const s = this.secs.get(id);
    if (!s) return;
    setAttr(s.head, 'aria-expanded', String(open));
    setHidden(s.body, !open);
    if (!remember) return;
    try { const f = loadFolds(); f[id] = open; localStorage.setItem(FOLDS, JSON.stringify(f)); } catch { /* this session only */ }
  }

  /** Every word of the panel in the current language, set where it stands. */
  private retext(): void {
    for (const n of this.body.querySelectorAll<HTMLElement>('[data-t]')) setText(n, t(n.dataset.t as string));
    for (const n of this.body.querySelectorAll<HTMLElement>('[data-t-ph]')) { const v = t(n.dataset.tPh as string); if ((n as HTMLTextAreaElement).placeholder !== v) (n as HTMLTextAreaElement).placeholder = v; }
    for (const n of this.body.querySelectorAll<HTMLElement>('[data-t-aria]')) setAttr(n, 'aria-label', t(n.dataset.tAria as string));
    for (const a of ACTS) setText(q(this.buttons.get(a.key) as HTMLElement, '.cv-genp-actlabel'), t(a.label));
  }

  // ---- Generate -------------------------------------------------------------------------------------------------

  private paintGo(): void {
    setText(this.goLabel, this.busy ? t('Stop') : t('Generate'));
    setAttr(this.go, 'aria-busy', String(this.busy));
    this.go.classList.toggle('is-busy', this.busy);
  }

  /** One side of a custom size: a multiple of 16 from 256 to 2048, the range every local model takes. */
  private side(v: unknown): number {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : 1024;
    return Math.min(2048, Math.max(256, Math.round(n / 16) * 16));
  }

  /** The shape asked for: the picture's own (undefined), a preset, or the custom width and height. */
  private asked(): { width: number; height: number } | undefined {
    if (this.size.value === 'custom') return { width: this.side(Number(this.cw.value)), height: this.side(Number(this.ch.value)) };
    const s = SIZES.find(([id]) => id === this.size.value);
    return s ? { width: s[2], height: s[3] } : undefined;
  }

  private missingKey(choice: string): { id: string; name: string } | null {
    if (choice === 'fal') return this.fal && !this.fal.configured ? { id: 'fal', name: 'fal' } : null;
    const p = choice.startsWith('provider:') ? this.providers.find((x) => `provider:${x.id}` === choice) : undefined;
    return p && !p.configured ? { id: p.id, name: p.name } : null;
  }

  private async generate(): Promise<void> {
    if (this.busy) { this.stopped = true; setText(this.status, t('Stopping...')); return; }
    const prompt = this.prompt.value.trim(), choice = this.model.value;
    if (!prompt) { setText(this.status, t('Describe the image to generate.')); this.prompt.focus(); return; }
    const missing = this.missingKey(choice);
    if (missing) { setText(this.status, t(`Add a ${missing.name} API key first, in Connections below.`)); this.openKey(missing.id); return; }
    this.busy = true;
    this.stopped = false;
    this.paintGo();
    try {
      const added = await runGeneration(this.engine, {
        prompt, choice, providers: this.providers, size: this.asked(),   // none: the picture's own shape (a new 1024 by 1024 picture when none is open)
        ...this.opts.request(), onSeed: (s) => this.opts.used(s), onStop: () => { this.stopped = true; setText(this.status, t('Stopped.')); },
        status: (text) => setText(this.status, text), stopped: () => this.stopped, heard: (r) => this.deps.heard(r),
        keyHint: { fal: t('Add a fal API key first, in Connections below.'), provider: (name) => t(`Add a ${name} API key first, in Connections below.`) },
      });
      if (added) { setText(this.status, t('Added as a new layer.')); this.deps.toast(t('The generated image was added as a layer.')); }
      else setText(this.status, this.stopped ? t('Stopped.') : '');
    } catch (err) {
      if (!this.stopped) setText(this.status, err instanceof Error ? err.message : t('Generating failed.'));
      else setText(this.status, t('Stopped.'));
    } finally { this.busy = false; this.paintGo(); }
  }

  /** The models, in place: the list Generate Image offers, ComfyUI workflows only while ComfyUI answers. */
  private async refreshModels(): Promise<void> {
    const run = ++this.modelRun;
    this.lastModels = Date.now();
    let g: Awaited<ReturnType<typeof generationModels>>;
    try { g = await generationModels(this.conns.comfyui.state === 'up'); } catch { return; }
    if (run !== this.modelRun) return;
    this.providers = g.providers;
    this.fal = g.fal;
    fillModelPicker(this.model, g.models);
    // The person's choice while it stands; else the default (fal with a key, else a model on this computer).
    const ok = (v: string | null): v is string => !!v && g.models.some((m) => m.value === v && !m.disabled);
    setValue(this.model, ok(this.chosen) ? this.chosen : g.preferred);
    this.opts.forModel(this.model.value);
    this.renderKeys();
  }

  // ---- Edit with AI ---------------------------------------------------------------------------------------------

  private queue(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.sync(); });
  }

  /** Why a button cannot run now, in words; '' when it can. */
  private whyNot(a: Act): string {
    const s = this.deps.state(a.cmd);
    if (s.enabled) return '';
    if (s.why) return s.why;
    const p = this.engine.current;
    if (!p) return t('Open or create a picture first.');
    if (a.needs === 'selection' && !p.selection) return t('Make a selection first.');
    return t('Not available for the active layer.');
  }

  private sync(): void {
    const p = this.engine.current, selected = !!p?.selection;
    for (const a of ACTS) {
      const btn = this.buttons.get(a.key) as HTMLButtonElement, why = this.whyNot(a);
      setAttr(btn, 'aria-disabled', why ? 'true' : 'false');
      btn.classList.toggle('is-disabled', !!why);
      const tip = a.key === 'remove' && !selected ? 'Switches to the Remove tool: paint over what to take out.' : a.tip;
      setTitle(btn, why ? `${t(a.label)}: ${why}` : t(tip));
    }
    setText(this.hint, !p ? t('Open or create a picture to use these.') : !selected ? t('Generative Fill and Replace need a selection: make one with a Select tool first.') : '');
    setText(this.linkHint, !p ? t('Open or create a picture to send it.') : '');
    const label = this.size.options[0];
    setText(label, p ? t(`Picture size (${p.doc.width} x ${p.doc.height})`) : t('New picture (1024 x 1024)'));
  }

  private activate(a: Act): void {
    const hint = a.group === 'edit' ? this.hint : this.linkHint, why = this.whyNot(a);
    if (why) { setText(hint, `${t(a.label)}: ${why}`); return; }
    setText(hint, '');
    let ran: boolean;
    if (a.key === 'replace') {
      const prompt = this.prompt.value.trim();
      if (!prompt) {
        setText(hint, t('Write what to put there in the prompt above, then press Replace.'));
        this.setOpen('gen', true);
        this.prompt.focus();
        return;
      }
      ran = this.deps.run(a.cmd, { prompt });
    } else ran = this.deps.run(a.cmd);
    if (!ran) this.deps.toast(t(`${a.label} could not run now.`), 'error');
  }

  // ---- Connections ----------------------------------------------------------------------------------------------

  private makeConn(kind: Kind, name: string): Conn {
    const root = el(`<div class="cv-genp-conn" data-kind="${kind}">
      <div class="cv-genp-line"><span class="cv-genp-dot" data-state="unchecked"></span><span class="cv-genp-name">${name}</span><span class="cv-genp-state"></span></div>
      <div class="cv-genp-keyrow"><input class="cv-input" type="url" spellcheck="false" autocomplete="off" data-t-aria="${name} address in the Generate panel"><button class="cv-btn" type="button"><span class="cv-genp-test"></span></button></div>
      <p class="cv-note cv-genp-msg" role="status"></p>
    </div>`);
    const c: Conn = { kind, name, root, dot: q(root, '.cv-genp-dot'), stateText: q(root, '.cv-genp-state'), input: q<HTMLInputElement>(root, 'input'), testBtn: q<HTMLButtonElement>(root, 'button'), testLabel: q(root, '.cv-genp-test'), msg: q(root, '.cv-genp-msg'), state: 'unchecked', busy: false };
    c.input.addEventListener('change', () => this.setUrl(c));
    c.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); c.input.dispatchEvent(new Event('change')); } });
    c.testBtn.addEventListener('click', () => void this.test(c, false));
    this.paintConn(c);
    return c;
  }

  private target(c: Conn): string { const p = loadPrefs(); return c.kind === 'comfyui' ? p.comfyuiUrl : p.nodemodeUrl; }

  /** The addresses as Preferences keep them, unless one is being typed. */
  private refreshUrls(): void { for (const c of Object.values(this.conns)) setValue(c.input, this.target(c)); }

  private setUrl(c: Conn): void {
    const v = c.input.value.trim();
    if (!/^https?:\/\/./.test(v)) { setText(c.msg, t('Enter an address that starts with http:// or https://.')); return; }
    if (v === this.target(c)) return;
    updatePrefs(c.kind === 'comfyui' ? { comfyuiUrl: v.slice(0, 300) } : { nodemodeUrl: v.slice(0, 300) });
    this.setConn(c, 'unchecked', '');
    void this.test(c, false);
  }

  private paintConn(c: Conn): void {
    setAttr(c.dot, 'data-state', c.state);
    setText(c.stateText, c.state === 'up' ? t('Connected') : c.state === 'down' ? t('Not running') : t('Not checked'));
    setText(c.testLabel, c.busy ? t('Testing...') : t('Test'));
  }

  private setConn(c: Conn, state: Dot, msg: string): void {
    c.state = state;
    this.paintConn(c);
    setText(c.msg, msg);
  }

  /** Asks the engine whether the app answers at its address. `quiet` (the check at start) sets the dot and says nothing more. */
  private async test(c: Conn, quiet: boolean): Promise<void> {
    if (c.busy) return;
    c.busy = true;
    setAttr(c.testBtn, 'aria-disabled', 'true');
    this.paintConn(c);
    const target = this.target(c);
    if (!quiet) setText(c.msg, t(`Checking ${c.name} at ${target}...`));
    const words = (text: string): string => (quiet ? '' : text);
    try {
      if (c.kind === 'comfyui') {
        const r = await api.comfyuiStatus(target);
        if (!r) this.setConn(c, 'unchecked', words(comfyuiStatusText(null, target)));
        else if (r.running) this.setConn(c, 'up', words(comfyuiStatusText(r, target)));
        else this.setConn(c, 'down', words(t(`ComfyUI is not running at ${target}. Start it, or change the address above and press Test.`)));
      } else {
        const r = await api.nodemodeStatus(target);
        if (!r) this.setConn(c, 'unchecked', words(nodemodeStatusText(null, target)));
        else if (r.running) this.setConn(c, 'up', words(nodemodeStatusText(r, target)));
        else this.setConn(c, 'down', words(t(`NodeMode is not running at ${target}. Start it, or change the address above and press Test.`)));
      }
    } finally {
      c.busy = false;
      setAttr(c.testBtn, 'aria-disabled', 'false');
      this.paintConn(c);
    }
    // The ComfyUI workflows join the models only while ComfyUI answers.
    if (c.kind === 'comfyui') void this.refreshModels();
  }

  /** The check at start, and again when the engine comes back. */
  private async refresh(): Promise<void> {
    await Promise.all([this.test(this.conns.comfyui, true), this.test(this.conns.nodemode, true)]);
    await this.refreshModels();
    this.sync();
  }

  // ---- API providers --------------------------------------------------------------------------------------------

  private keyRows(): KeyRow[] {
    return [
      { id: 'fal', name: 'fal', configured: !!this.fal?.configured, source: this.fal?.source ?? null, engine: this.fal !== null },
      ...this.providers.map((p) => ({ id: p.id, name: p.name, configured: p.configured, source: p.source, engine: true })),
    ];
  }

  private fillKeyRow(row: HTMLElement, r: KeyRow): void {
    setAttr(q(row, '.cv-genp-dot'), 'data-state', r.configured ? 'up' : 'unchecked');
    setText(q(row, '.cv-genp-name'), r.name);
    setText(q(row, '.cv-genp-state'), !r.engine ? t('Engine offline') : r.configured ? (r.source === 'environment' ? t('Key set in the environment') : t('Key set')) : t('No key'));
    const input = q<HTMLInputElement>(row, 'input'), ph = r.configured ? t('Paste a new key to replace it') : t(`Paste your ${r.name} key`);
    if (input.placeholder !== ph) input.placeholder = ph;
    setAttr(input, 'aria-label', t(`${r.name} API key`));
    setText(q(row, '.cv-genp-savelabel'), t('Save key'));
  }

  private renderKeys(): void {
    patchList(this.keyList, this.keyRows(), {
      key: (r) => r.id,
      create: (r) => {
        const row = el(`<div class="cv-genp-prov">
          <div class="cv-genp-line"><span class="cv-genp-dot" data-state="unchecked"></span><span class="cv-genp-name"></span><span class="cv-genp-state"></span></div>
          <div class="cv-genp-keyrow"><input class="cv-input" type="password" autocomplete="off" spellcheck="false"><button class="cv-btn cv-genp-save" type="button">${icon('genKey', 14)}<span class="cv-genp-savelabel"></span></button></div>
        </div>`);
        this.fillKeyRow(row, r);
        return row;
      },
      update: (row, r) => this.fillKeyRow(row, r),
    });
  }

  /** Sends a key to the engine, which keeps it; the field is cleared at once and the key is never read back or written anywhere else. */
  private async saveKey(row: HTMLElement): Promise<void> {
    const id = row.dataset.key as string, input = q<HTMLInputElement>(row, 'input'), btn = q<HTMLButtonElement>(row, '.cv-genp-save');
    const key = input.value.trim(), name = this.keyRows().find((r) => r.id === id)?.name ?? id;
    if (!key) { setText(this.keyMsg, t(`Paste your ${name} key first.`)); input.focus(); return; }
    if (btn.getAttribute('aria-disabled') === 'true') return;
    setAttr(btn, 'aria-disabled', 'true');
    try {
      if (id === 'fal') this.fal = await api.saveGenerativeKey(key);
      else this.providers = await api.saveProviderKey(id, key);
      input.value = '';
      setText(this.keyMsg, t(id === 'fal' ? 'The fal key is kept by the formvis engine on this computer.' : `The ${name} key is kept in your system's password store.`));
      this.renderKeys();
      void this.refreshModels();
    } catch (err) {
      setText(this.keyMsg, err instanceof Error && err.message ? err.message : t('The key could not be saved.'));
    } finally { setAttr(btn, 'aria-disabled', 'false'); }
  }
}
