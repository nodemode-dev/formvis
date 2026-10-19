import type { Engine } from '../../engine';
import { BADGE_ANCHORS, BADGE_DEFAULTS, BADGE_STYLES, addAiLabel, type BadgeOptions } from '../../automation/pack-tools';
import { Dialog } from '../dialogs';
import { el } from '../dom';

/** Layer > EU AI Label > Add (the bundled EU AI label): the digital source type every export carries, and a visible badge layer. */
export class AiLabelDialog extends Dialog {
  private readonly kind = el<HTMLSelectElement>('<select class="cv-input" aria-label="Kind"><option value="generated">Made with AI</option><option value="edited">Edited with AI</option></select>');
  private readonly badge = el<HTMLInputElement>('<input type="checkbox" checked aria-label="Add a visible badge layer">');
  private readonly anchor = el<HTMLSelectElement>(`<select class="cv-input" aria-label="Anchor">${BADGE_ANCHORS.map((a) => `<option value="${a}"${a === BADGE_DEFAULTS.anchor ? ' selected' : ''}>${a.replace('-', ' ').replace(/^./, (c) => c.toUpperCase())}</option>`).join('')}</select>`);
  private readonly style = el<HTMLSelectElement>(`<select class="cv-input" aria-label="Style">${BADGE_STYLES.map((s) => `<option value="${s}">${s.charAt(0).toUpperCase()}${s.slice(1)}</option>`).join('')}</select>`);
  private readonly size = el<HTMLInputElement>('<input class="cv-input" type="number" min="2" max="30" step="0.5" value="6" aria-label="Size">');
  private readonly opacity = el<HTMLInputElement>('<input class="cv-input" type="number" min="5" max="100" step="5" value="100" aria-label="Opacity">');

  constructor(private readonly engine: Engine) {
    super('Add EU AI Label', 360);
    const row = (label: string, c: HTMLElement): HTMLElement => { const r = el(`<label class="cv-dialog-row"><span>${label}</span></label>`); r.append(c); return r; };
    this.body.append(row('Label', this.kind), row('Badge layer', this.badge), row('Anchor', this.anchor), row('Style', this.style), row('Size (%)', this.size), row('Opacity (%)', this.opacity));
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.make());
    this.remember();
  }

  show(): void {
    if (this.engine.current) this.open();
  }

  private make(): void {
    const o: BadgeOptions = { kind: this.kind.value as BadgeOptions['kind'], anchor: this.anchor.value as BadgeOptions['anchor'], style: this.style.value as BadgeOptions['style'], size: Math.min(30, Math.max(2, Number(this.size.value) || 6)), opacity: Math.min(1, Math.max(0.05, (Number(this.opacity.value) || 100) / 100)) };
    if (addAiLabel(this.engine, o, this.badge.checked) !== null) this.close();
  }
}
