import type { Engine } from '../engine';
import { getTool } from '../extensions/registry';
import { pendingClass, q, setText, type Disposer } from './dom';
import { icon } from './icons';

export class StatusBar {
  private readonly zoom: HTMLElement;
  private readonly dims: HTMLElement;
  private readonly busy: HTMLElement;
  private readonly engineState: HTMLElement;
  private readonly hint: HTMLElement;
  private dismiss: Disposer | null = null;

  constructor(root: HTMLElement, private readonly engine: Engine) {
    root.insertAdjacentHTML('beforeend',
      '<span class="cv-st-zoom"></span><span class="cv-st-dims"></span>' +
      `<span class="cv-st-busy">${icon('loading', 12)}Working</span><span class="cv-st-engine"></span><span class="cv-st-hint"></span>`);
    this.zoom = q(root, '.cv-st-zoom');
    this.dims = q(root, '.cv-st-dims');
    this.busy = q(root, '.cv-st-busy');
    this.engineState = q(root, '.cv-st-engine');
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

  private syncView(): void {
    const p = this.engine.current;
    setText(this.zoom, p ? `${Math.round(p.viewport.zoom * 1000) / 10}%` : '');
    setText(this.dims, p ? `${p.doc.width} \u00d7 ${p.doc.height} px` : '');
  }

  private syncHint(): void { setText(this.hint, getTool(this.engine.tool)?.hint(this.engine) ?? ''); }
}
