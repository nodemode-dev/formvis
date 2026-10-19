import type { Engine } from '../engine';
import { getTool } from '../extensions/registry';
import { pendingClass, q, setClass, setStyleVar, setText, setTitle, type Disposer } from './dom';
import { onLanguage, t } from './i18n';
import { icon } from './icons';

/** The one note when the engine service is not running (DEV_PLAN 36.19): the status bar's title and the boot toast. */
export const SERVICE_NOTE = 'The engine service is not running, so editing works but these wait for it: saving to the library, HEIC, RAW, DPX and other camera and film formats, colour conversion, AI tools, video, the terminal and agents. Start it with ./formvis boot.';

export class StatusBar {
  private readonly zoom: HTMLInputElement;
  private readonly dims: HTMLElement;
  private readonly busy: HTMLElement;
  private readonly par: HTMLElement;
  private readonly engineState: HTMLElement;
  private readonly gpu: HTMLElement;
  private readonly hint: HTMLElement;
  private dismiss: Disposer | null = null;

  constructor(root: HTMLElement, private readonly engine: Engine) {
    root.insertAdjacentHTML('beforeend',
      '<input class="cv-st-zoom" type="text" inputmode="decimal" spellcheck="false" autocomplete="off" aria-label="Zoom percent" title="Zoom: type a percent and press Enter">' +
      '<span class="cv-st-dims"></span>' +
      `<span class="cv-st-busy">${icon('loading', 12)}</span><span class="cv-st-engine"></span><span class="cv-st-gpu"></span><span class="cv-st-mem" title="Pixels formvis holds, of what this computer allows it"></span><span class="cv-st-proof"></span><span class="cv-st-hint"></span>`);
    this.proof = q(root, '.cv-st-proof');
    this.mem = q(root, '.cv-st-mem');   // 1.60.2, DEV_PLAN 26.1
    for (const k of ['doc', 'history', 'projects'] as const) engine.on(k, () => this.syncMemory());
    this.zoom = q(root, '.cv-st-zoom');
    // The zoom is a field: Enter applies the percent typed (1 to 6400), Escape gives the current one back.
    this.zoom.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const n = parseFloat(this.zoom.value.replace(',', '.'));
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
    this.stop = document.createElement('button');
    this.stop.type = 'button';
    this.stop.className = 'cv-st-stop';
    this.stop.hidden = true;
    this.stop.appendChild(document.createTextNode(t('Cancel')));
    this.stop.addEventListener('click', () => { this.engine.cancelJob(); });
    this.busy.append(this.bar, this.steps, this.stop);
    engine.on('progress', () => this.syncProgress());
    engine.on('notice', (n) => { if (n.kind === 'error') this.flashError(n.text); });
    this.engineState = q(root, '.cv-st-engine');
    this.gpu = q(root, '.cv-st-gpu');
    this.hint = q(root, '.cv-st-hint');
    for (const k of ['viewport', 'projects'] as const) engine.on(k, () => this.syncView());
    for (const k of ['tool', 'options'] as const) engine.on(k, () => this.syncHint());
    engine.on('busy', (on: boolean) => {
      if (on) { if (!this.dismiss) this.dismiss = pendingClass(this.busy); }
      else { this.dismiss?.(); this.dismiss = null; }
    });
    this.syncView();
    this.syncHint();
    // A language change re-sets every word in place (no rebuild, no flash).
    onLanguage(() => {
      this.busyText.data = t('Working');
      this.showEngine();
      this.showGpu();
      this.syncMemory();
      this.syncView();
      this.syncHint();
    });
  }

  private readonly busyText: Text;
  private readonly bar: HTMLElement;
  private readonly steps: HTMLElement;
  private readonly stepsText = document.createTextNode('');
  private readonly stop: HTMLButtonElement;
  private errText = '';
  private errTimer = 0;

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
    const jobs = this.engine.jobs, live = jobs.some((j) => !j.cancelled);
    if (this.stop.hidden === live) this.stop.hidden = !live;
    const names = jobs.map((j) => (j.cancelled ? `${j.name} (stopping)` : j.name)).join(', ');
    if (this.stop.title !== names) this.stop.title = names ? `${t('Cancel')}: ${names}` : '';
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
    setTitle(this.hint, '');
    const raw = getTool(this.engine.tool)?.hint(this.engine) ?? '';
    // The Shape tool's first segment is assembled from a noun and a mode: "Drag to draw a star (as a path)".
    const seg = (s: string): string => {
      const m = /^Drag to draw (an? [a-z ]+) \(([a-z ]+)\)$/.exec(s);
      return m ? t('Drag to draw {shape} ({mode})').replace('{shape}', t(m[1])).replace('{mode}', t(m[2])) : t(s);
    };
    setText(this.hint, raw.split(' · ').map(seg).join(' · '));
  }
}
