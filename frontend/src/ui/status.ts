import type { Engine } from '../engine';
import { docBytes } from '../engine/snapshot-ops';
import { getTool } from '../extensions/registry';
import { evalExpr } from './number-fields';
import { pendingClass, q, setClass, setStyleVar, setText, setTitle, type Disposer } from './dom';
import { onLanguage, t } from './i18n';
import { icon } from './icons';
import { JobsList } from './jobs-list';

/** The one note when the engine service is not running (DEV_PLAN 36.19): the status bar's title and the boot toast. */
export const SERVICE_NOTE = 'The engine service is not running, so editing works but these wait for it: saving to the library, HEIC, RAW, DPX and other camera and film formats, color conversion, AI tools, video, the terminal and agents. Start it with ./formvis boot.';

const INFO_KEY = 'formvis_status_info';
const INFO_KINDS = ['sizes', 'profile', 'resolution', 'efficiency', 'timing'] as const;
type InfoKind = (typeof INFO_KINDS)[number];
const bytesText = (n: number): string => (n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export class StatusBar {
  private readonly zoom: HTMLInputElement;
  private readonly dims: HTMLElement;
  private readonly busy: HTMLElement;
  private readonly par: HTMLElement;
  private readonly engineState: HTMLElement;
  private readonly gpu: HTMLElement;
  private readonly hint: HTMLElement;
  private hintSegs: string[] = [];
  private dismiss: Disposer | null = null;

  constructor(root: HTMLElement, private readonly engine: Engine) {
    root.insertAdjacentHTML('beforeend',
      '<div class="cv-st-tools" role="group" aria-label="History and zoom">' +
      `<button class="cv-icon-btn cv-st-btn" type="button" data-cmd="undo">${icon('undo', 14)}</button>` +
      `<button class="cv-icon-btn cv-st-btn" type="button" data-cmd="redo">${icon('redo', 14)}</button>` +
      '<span class="cv-sep"></span>' +
      `<button class="cv-icon-btn cv-st-btn" type="button" data-cmd="zoom-out">${icon('zoomOut', 14)}</button>` +
      '<input class="cv-st-zoom" type="text" inputmode="decimal" spellcheck="false" autocomplete="off" aria-label="Zoom percent" title="Zoom: type a percent and press Enter">' +
      `<button class="cv-icon-btn cv-st-btn" type="button" data-cmd="zoom-in">${icon('zoomIn', 14)}</button>` +
      `<button class="cv-icon-btn cv-st-btn" type="button" data-cmd="fit">${icon('fitView', 14)}</button>` +
      '</div>' +
      '<span class="cv-st-dims"></span>' +
      '<button class="cv-st-info" type="button"></button>' +
      `<span class="cv-st-engine"></span><span class="cv-st-gpu"></span><span class="cv-st-mem" title="Pixels formvis holds, of what this computer allows it"></span><span class="cv-st-proof"></span><span class="cv-st-hint"></span><span class="cv-st-busy">${icon('loading', 12)}</span>`);
    this.proof = q(root, '.cv-st-proof');
    this.mem = q(root, '.cv-st-mem');   // 1.60.2, DEV_PLAN 26.1
    for (const k of ['doc', 'history', 'projects'] as const) engine.on(k, () => this.syncMemory());
    this.zoom = q(root, '.cv-st-zoom');
    // The zoom is a field: Enter applies the percent typed (1 to 6400), Escape gives the current one back.
    this.zoom.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const n = evalExpr(this.zoom.value) ?? parseFloat(this.zoom.value.replace(',', '.'));
        if (Number.isFinite(n) && n > 0 && this.engine.current) this.engine.zoomTo(n / 100);
        this.zoom.blur();
      } else if (e.key === 'Escape') { this.zoom.blur(); }
      e.stopPropagation();
    });
    this.zoom.addEventListener('focus', () => this.zoom.select());
    this.zoom.addEventListener('blur', () => this.syncView());
    this.dims = q(root, '.cv-st-dims');
    // Pixel Aspect Ratio note (35.4 part b): built once, updated with textContent through setText.
    this.par = document.createElement('span');
    this.par.className = 'cv-st-par';
    this.dims.after(this.par);
    for (const k of ['doc', 'overlay', 'projects'] as const) engine.on(k, () => this.syncView());
    this.info = q(root, '.cv-st-info');
    try { const k = localStorage.getItem(INFO_KEY) as InfoKind | null; if (k && INFO_KINDS.includes(k)) this.infoKind = k; } catch { /* default */ }
    this.info.addEventListener('click', (e) => {
      const n = INFO_KINDS.length;
      this.infoKind = INFO_KINDS[(INFO_KINDS.indexOf(this.infoKind) + (e.shiftKey ? n - 1 : 1)) % n];
      try { localStorage.setItem(INFO_KEY, this.infoKind); } catch { /* not kept */ }
      this.syncInfo();
    });
    for (const k of ['doc', 'history', 'projects', 'active'] as const) engine.on(k, () => this.queueInfo());
    this.busy = q(root, '.cv-st-busy');
    this.busyText = document.createTextNode(t('Working'));
    this.busy.appendChild(this.busyText);
    this.bar = document.createElement('span');
    this.bar.className = 'cv-st-bar';
    this.bar.setAttribute('role', 'progressbar');
    this.bar.setAttribute('aria-valuemin', '0');
    this.bar.setAttribute('aria-valuemax', '100');
    this.bar.innerHTML = '<i></i>';
    this.steps = document.createElement('span');
    this.steps.className = 'cv-st-steps';
    this.steps.appendChild(this.stepsText);
    this.busy.append(this.bar, this.steps);
    this.jobs = new JobsList(engine, root);
    this.busy.title = t('Show the running jobs, each with its own Stop');
    this.busy.addEventListener('click', () => this.jobs.toggle());
    engine.on('progress', () => this.syncProgress());
    engine.on('notice', (n) => { if (n.kind === 'error') this.flashError(n.text); });
    this.engineState = q(root, '.cv-st-engine');
    this.gpu = q(root, '.cv-st-gpu');
    this.hint = q(root, '.cv-st-hint');
    new ResizeObserver(() => this.fitHint()).observe(this.hint);
    for (const k of ['viewport', 'projects'] as const) engine.on(k, () => this.syncView());
    for (const k of ['tool', 'options'] as const) engine.on(k, () => this.syncHint());
    engine.on('busy', (on: boolean) => {
      if (on) { if (!this.dismiss) this.dismiss = pendingClass(this.busy); if (!this.busySince) this.busySince = performance.now(); }
      else { this.dismiss?.(); this.dismiss = null; if (this.busySince) { this.lastMs = performance.now() - this.busySince; this.busySince = 0; this.queueInfo(); } }
    });
    this.syncView();
    this.syncInfo();
    this.syncHint();
    // A language change re-sets every word in place (no rebuild, no flash).
    onLanguage(() => {
      this.busyText.data = t('Working');
      setTitle(this.busy, t('Show the running jobs, each with its own Stop'));
      this.showEngine();
      this.showGpu();
      this.syncMemory();
      this.syncView();
      this.syncInfo();
      this.syncHint();
    });
  }

  private readonly jobs: JobsList;
  /** Window > Jobs: the list of running background jobs, each with its own Stop, opened or closed above the Working indicator. */
  toggleJobs(): void { this.jobs.toggle(); }
  get jobsOpen(): boolean { return this.jobs.isOpen; }

  private readonly info: HTMLElement;
  private infoKind: InfoKind = 'sizes';
  private infoFrame = 0;
  private busySince = 0;
  private lastMs = -1;

  private queueInfo(): void {
    if (this.infoFrame) return;
    this.infoFrame = requestAnimationFrame(() => { this.infoFrame = 0; this.syncInfo(); });
  }

  /** The chosen document readout, written into the one slot that is already there; a click picks the next (Shift the previous). */
  private syncInfo(): void {
    const p = this.engine.current, kind = this.infoKind;
    let text = '', tip = '';
    if (kind === 'timing') {
      text = `${t('Timing')}: ${this.lastMs < 0 ? '-' : this.lastMs < 1000 ? `${Math.round(this.lastMs)} ms` : `${(this.lastMs / 1000).toFixed(1)} s`}`;
      tip = t('How long the last operation took');
    } else if (kind === 'efficiency') {
      const b = this.engine.memoryBudget, u = this.engine.memoryUse();
      text = p ? `${t('Efficiency')}: ${b && u > b ? Math.round((b / u) * 100) : 100}%` : '';
      tip = t('100% while everything fits the memory budget; lower when the document and its history exceed it');
    } else if (p) {
      const d = p.doc, px = d.width * d.height;
      if (kind === 'sizes') {
        const flat = px * 4, all = docBytes(d) || flat;
        text = `${t('Doc')}: ${bytesText(flat)}/${bytesText(all)}`;
        tip = t('Flattened size / size with every layer and mask');
      } else if (kind === 'profile') {
        text = `${d.profile?.name ?? t('Untagged')} · ${(d.mode ?? 'rgb').toUpperCase()}/${d.depth ?? 8}`;
        tip = t('Working color profile, mode and bit depth');
      } else {
        text = `${Math.round(d.resolution || 72)} ppi`;
        tip = t('Document resolution');
      }
    }
    setText(this.info, text);
    setTitle(this.info, `${tip}${tip ? '. ' : ''}${t('Click for the next readout, Shift+click for the previous.')}`);
  }

  private readonly busyText: Text;
  private readonly bar: HTMLElement;
  private readonly steps: HTMLElement;
  private readonly stepsText = document.createTextNode('');
  private errText = '';
  private errTimer = 0;
  private agentText = '';
  private agentTimer = 0;

  /** An outside agent's note in the hint slot (set_status): shown until cleared with empty text or for `seconds`; an error still takes the slot first. */
  setAgentNote(text: string, seconds = 60): void {
    this.agentText = text.slice(0, 160);
    window.clearTimeout(this.agentTimer);
    if (this.agentText) this.agentTimer = window.setTimeout(() => { this.agentText = ''; this.syncHint(); }, Math.max(1, seconds) * 1000);
    this.syncHint();
  }

  /** The bar and the counts, in the nodes that are already there: bands of the running job, else tasks finished of tasks started. */
  private syncProgress(): void {
    const p = this.engine.taskProgress, inner = p.total > 0, many = p.steps > 1;
    const frac = inner ? (p.finished + p.done / p.total) / Math.max(1, p.steps) : p.steps > 0 ? p.finished / p.steps : 0;
    const pct = Math.round(Math.min(1, Math.max(0, frac)) * 100);
    setStyleVar(this.bar, '--p', `${pct}%`);
    this.bar.setAttribute('aria-valuenow', String(pct));
    const part = many ? `${Math.min(p.finished + 1, p.steps)} ${t('of')} ${p.steps}` : '';
    const pc = inner ? `${Math.round((p.done / p.total) * 100)}%` : '';
    const label = [part, pc].filter(Boolean).join(' · ');
    if (this.stepsText.data !== label) this.stepsText.data = label;
    const names = this.engine.jobs.map((j) => (j.cancelled ? `${j.name} (stopping)` : j.name)).join(', ');
    setTitle(this.busy, names ? `${names}: ${t('Show the running jobs, each with its own Stop')}` : t('Show the running jobs, each with its own Stop'));
  }

  /** An error sits in the hint slot in the danger colour for six seconds, then the tool's hint comes back; nothing blinks. */
  private flashError(text: string): void {
    this.errText = text;
    this.syncHint();
    window.clearTimeout(this.errTimer);
    this.errTimer = window.setTimeout(() => { this.errText = ''; this.syncHint(); }, 6000);
  }

  private engineRaw = '';
  private gpuRaw = '';
  private gpuWhy = '';

  setEngine(text: string): void { this.engineRaw = text; this.showEngine(); }

  /** The engine's state in the current language: fixed phrases whole, the version line word by word. */
  private showEngine(): void {
    const raw = this.engineRaw, m = /^Engine (\d\S*)( · desktop)?$/.exec(raw);
    setText(this.engineState, m ? `${t('Engine')} ${m[1]}${m[2] ? ` · ${t('desktop')}` : ''}` : t(raw));
    setTitle(this.engineState, raw === 'Engine offline' ? t(SERVICE_NOTE) : '');
  }

  private readonly proof: HTMLElement;
  /** The badge naming the proof device while Proof Colors is on (empty otherwise); the slot keeps its width. */
  setProof(label: string | null): void {
    setText(this.proof, label ? `${t('Proof')}: ${label}` : '');
    setTitle(this.proof, label ? `${t('Proof Colors is on')}: ${label}` : '');
  }

  private readonly mem: HTMLElement;
  /** Memory, as the engine counts it (1.60.2): what formvis holds in pixels of what this computer allows it. */
  syncMemory(): void {
    const e = this.engine, b = e.memoryBudget;
    if (!b || !e.projects.length) { setText(this.mem, ''); return; }
    const u = e.memoryUse(), f = (n: number): string => (b >= 1073741824 ? `${(n / 1073741824).toFixed(1)}` : `${Math.round(n / 1048576)}`);
    setText(this.mem, t('Memory {used} of {total} {unit}').replace('{used}', f(u)).replace('{total}', f(b)).replace('{unit}', b >= 1073741824 ? 'GB' : 'MB'));
    this.mem.classList.toggle('is-high', u > b * 0.85);
  }

  /** The GPU mode in use, shown in the status bar; the reason is its tooltip. */
  setGpu(text: string, reason: string): void { this.gpuRaw = text; this.gpuWhy = reason; this.showGpu(); }

  /** "GPU: WebGPU" as the word GPU translated, a colon, then the mode (CPU is translated, an API name is not). */
  private showGpu(): void {
    const raw = this.gpuRaw, mode = raw.startsWith('GPU: ') ? raw.slice(5) : raw;
    setText(this.gpu, raw ? `${t('GPU')}: ${mode === 'CPU' ? t('CPU') : mode}` : '');
    this.gpu.title = this.gpuWhy;
  }

  private syncView(): void {
    const p = this.engine.current;
    const zt = p ? `${Number((p.viewport.zoom * 100).toFixed(1))}%` : '';
    if (document.activeElement !== this.zoom && this.zoom.value !== zt) this.zoom.value = zt;
    if (this.zoom.disabled !== !p) this.zoom.disabled = !p;
    setText(this.dims, p ? `${p.doc.width} \u00d7 ${p.doc.height} px` : '');
    const par = p?.doc.pixelAspect;
    setText(this.par, par && par !== 1 ? t(this.engine.view.parCorrection ? 'PAR {n}, corrected' : 'PAR {n}').replace('{n}', String(Number(par.toFixed(3)))) : '');
  }

  /** The tool's hint, translated segment by segment: each ' · ' part is its own key, joined again with ' · '. */
  private syncHint(): void {
    setClass(this.hint, 'is-error', !!this.errText);
    if (this.errText) { setText(this.hint, this.errText); setTitle(this.hint, this.errText); return; }
    if (this.agentText) { setText(this.hint, this.agentText); setTitle(this.hint, this.agentText); return; }
    setTitle(this.hint, '');
    const raw = getTool(this.engine.tool)?.hint(this.engine) ?? '';
    // The Shape tool's first segment is assembled from a noun and a mode: "Drag to draw a star (as a path)".
    const seg = (s: string): string => {
      const m = /^Drag to draw (an? [a-z ]+) \(([a-z ]+)\)$/.exec(s);
      return m ? t('Drag to draw {shape} ({mode})').replace('{shape}', t(m[1])).replace('{mode}', t(m[2])) : t(s);
    };
    this.hintSegs = raw.split(' · ').map(seg);
    this.fitHint();
  }

  /** Shows as many whole ' · ' parts as the slot holds, never a part cut mid-word; the full text rides in the tooltip. */
  private fitHint(): void {
    const segs = this.hintSegs;
    if (!segs.length || this.errText || this.agentText) return;
    let n = segs.length;
    setText(this.hint, segs.join(' · '));
    while (n > 1 && this.hint.scrollWidth > this.hint.clientWidth) { n--; setText(this.hint, segs.slice(0, n).join(' · ')); }
    setTitle(this.hint, n < segs.length ? segs.join(' · ') : '');
  }
}
