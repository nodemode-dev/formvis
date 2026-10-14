import type { Engine } from '../engine';
import { getTool } from '../extensions/registry';
import { pendingClass, q, setText, type Disposer } from './dom';
import { onLanguage, t } from './i18n';
import { icon } from './icons';

export class StatusBar {
  private readonly zoom: HTMLElement;
  private readonly dims: HTMLElement;
  private readonly busy: HTMLElement;
  private readonly par: HTMLElement;
  private readonly engineState: HTMLElement;
  private readonly gpu: HTMLElement;
  private readonly hint: HTMLElement;
  private dismiss: Disposer | null = null;

  constructor(root: HTMLElement, private readonly engine: Engine) {
    root.insertAdjacentHTML('beforeend',
      '<span class="cv-st-zoom"></span><span class="cv-st-dims"></span>' +
      `<span class="cv-st-busy">${icon('loading', 12)}</span><span class="cv-st-engine"></span><span class="cv-st-gpu"></span><span class="cv-st-mem" title="Pixels formvis holds, of what this computer allows it"></span><span class="cv-st-hint"></span>`);
    this.mem = q(root, '.cv-st-mem');   // 1.60.2, DEV_PLAN 26.1
    for (const k of ['doc', 'history', 'projects'] as const) engine.on(k, () => this.syncMemory());
    this.zoom = q(root, '.cv-st-zoom');
    this.dims = q(root, '.cv-st-dims');
    // Pixel Aspect Ratio note (35.4 part b): built once, updated with textContent through setText.
    this.par = document.createElement('span');
    this.par.className = 'cv-st-par';
    this.dims.after(this.par);
    for (const k of ['doc', 'overlay', 'projects'] as const) engine.on(k, () => this.syncView());
    this.busy = q(root, '.cv-st-busy');
    this.busyText = document.createTextNode(t('Working'));
    this.busy.appendChild(this.busyText);
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
  private engineRaw = '';
  private gpuRaw = '';
  private gpuWhy = '';

  setEngine(text: string): void { this.engineRaw = text; this.showEngine(); }

  /** The engine's state in the current language: fixed phrases whole, the version line word by word. */
  private showEngine(): void {
    const raw = this.engineRaw, m = /^Engine (\d\S*)( · desktop)?$/.exec(raw);
    setText(this.engineState, m ? `${t('Engine')} ${m[1]}${m[2] ? ` · ${t('desktop')}` : ''}` : t(raw));
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

  /** The GPU mode in use, as Photoshop's status bar shows it; the reason is its tooltip. */
  setGpu(text: string, reason: string): void { this.gpuRaw = text; this.gpuWhy = reason; this.showGpu(); }

  /** "GPU: WebGPU" as the word GPU translated, a colon, then the mode (CPU is translated, an API name is not). */
  private showGpu(): void {
    const raw = this.gpuRaw, mode = raw.startsWith('GPU: ') ? raw.slice(5) : raw;
    setText(this.gpu, raw ? `${t('GPU')}: ${mode === 'CPU' ? t('CPU') : mode}` : '');
    this.gpu.title = this.gpuWhy;
  }

  private syncView(): void {
    const p = this.engine.current;
    setText(this.zoom, p ? `${Number((p.viewport.zoom * 100).toFixed(1))}%` : '');
    setText(this.dims, p ? `${p.doc.width} \u00d7 ${p.doc.height} px` : '');
    const par = p?.doc.pixelAspect;
    setText(this.par, par && par !== 1 ? t(this.engine.view.parCorrection ? 'PAR {n}, corrected' : 'PAR {n}').replace('{n}', String(Number(par.toFixed(3)))) : '');
  }

  /** The tool's hint, translated segment by segment: each ' · ' part is its own key, joined again with ' · '. */
  private syncHint(): void {
    const raw = getTool(this.engine.tool)?.hint(this.engine) ?? '';
    // The Shape tool's first segment is assembled from a noun and a mode: "Drag to draw a star (as a path)".
    const seg = (s: string): string => {
      const m = /^Drag to draw (an? [a-z ]+) \(([a-z ]+)\)$/.exec(s);
      return m ? t('Drag to draw {shape} ({mode})').replace('{shape}', t(m[1])).replace('{mode}', t(m[2])) : t(s);
    };
    setText(this.hint, raw.split(' · ').map(seg).join(' · '));
  }
}
