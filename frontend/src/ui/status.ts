import type { Engine } from '../engine';
import { getTool } from '../extensions/registry';
import { pendingClass, q, setText, type Disposer } from './dom';
import { icon } from './icons';

export class StatusBar {
  private readonly zoom: HTMLElement;
  private readonly dims: HTMLElement;
  private readonly busy: HTMLElement;
  private readonly engineState: HTMLElement;
  private readonly gpu: HTMLElement;
  private readonly hint: HTMLElement;
  private dismiss: Disposer | null = null;

  constructor(root: HTMLElement, private readonly engine: Engine) {
    root.insertAdjacentHTML('beforeend',
      '<span class="cv-st-zoom"></span><span class="cv-st-dims"></span>' +
      `<span class="cv-st-busy">${icon('loading', 12)}Working</span><span class="cv-st-engine"></span><span class="cv-st-gpu"></span><span class="cv-st-mem" title="Pixels formvis holds, of what this computer allows it"></span><span class="cv-st-hint"></span>`);
    this.mem = q(root, '.cv-st-mem');   // 1.60.2, DEV_PLAN 26.1
    for (const k of ['doc', 'history', 'projects'] as const) engine.on(k, () => this.syncMemory());
    this.zoom = q(root, '.cv-st-zoom');
    this.dims = q(root, '.cv-st-dims');
    this.busy = q(root, '.cv-st-busy');
    this.engineState = q(root, '.cv-st-engine');
    this.gpu = q(root, '.cv-st-gpu');
    this.hint = q(root, '.cv-st-hint');
    for (const k of ['viewport', 'projects'] as const) engine.on(k, () => this.syncView());
    for (const k of ['tool', 'options'] as const) engine.on(k, () => this.syncHint());
    engine.on('busy', (on) => {
      if (on) this.dismiss = pendingClass(this.busy);
      else { this.dismiss?.(); this.dismiss = null; }
    });
    this.syncView();
    this.syncHint();
  }

  setEngine(text: string): void { setText(this.engineState, text); }

  private readonly mem: HTMLElement;
  /** Memory, as the engine counts it (1.60.2): what formvis holds in pixels of what this computer allows it. */
  syncMemory(): void {
    const e = this.engine, b = e.memoryBudget;
    if (!b || !e.projects.length) { setText(this.mem, ''); return; }
    const u = e.memoryUse(), f = (n: number): string => (b >= 1073741824 ? `${(n / 1073741824).toFixed(1)}` : `${Math.round(n / 1048576)}`);
    setText(this.mem, `Memory ${f(u)} of ${f(b)} ${b >= 1073741824 ? 'GB' : 'MB'}`);
    this.mem.classList.toggle('is-high', u > b * 0.85);
  }

  /** The GPU mode in use, as Photoshop's status bar shows it; the reason is its tooltip. */
  setGpu(text: string, reason: string): void { setText(this.gpu, text); this.gpu.title = reason; }

  private syncView(): void {
    const p = this.engine.current;
    setText(this.zoom, p ? `${Math.round(p.viewport.zoom * 1000) / 10}%` : '');
    setText(this.dims, p ? `${p.doc.width} \u00d7 ${p.doc.height} px` : '');
  }

  private syncHint(): void { setText(this.hint, getTool(this.engine.tool)?.hint(this.engine) ?? ''); }
}
