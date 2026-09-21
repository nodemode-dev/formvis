import { defaultEffects, effectsActive, type Engine, type LayerEffects, type RGB } from '../../engine';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { checkRow, sliderRow } from './controls';

const hex = (c: RGB): string => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const fromHex = (h: string): RGB => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });

/** Layer > Layer Style: Drop Shadow, Outer Glow and an outside Stroke for the active pixel layer, shown live while the
 *  dialog is open. OK applies them as one undo step; Cancel leaves the layer as it was. */
export class LayerStyleDialog extends Dialog {
  private fx: LayerEffects = defaultEffects();
  private layerId: string | null = null;
  private applied = false;
  private readonly syncs: Array<() => void> = [];

  constructor(private readonly engine: Engine) {
    super('Layer Style', 420);
    const fx = (): LayerEffects => this.fx;
    const check = (label: string, get: () => boolean, set: (v: boolean) => void): void => {
      const row = checkRow(label, (v) => { set(v); this.changed(); });
      this.body.appendChild(row.el);
      this.syncs.push(() => row.set(get()));
    };
    const slider = (label: string, min: number, max: number, get: () => number, set: (v: number) => void): void => {
      const row = sliderRow(label, min, max, 1, (v) => { set(v); this.changed(); });
      this.body.appendChild(row.el);
      this.syncs.push(() => row.set(get()));
    };
    const colour = (label: string, get: () => RGB, set: (c: RGB) => void): void => {
      const input = el<HTMLInputElement>('<input class="cv-input" type="color">');
      input.addEventListener('input', () => { set(fromHex(input.value)); this.changed(); });
      this.field(label, input);
      this.syncs.push(() => { input.value = hex(get()); });
    };
    check('Drop Shadow', () => fx().dropShadow.enabled, (v) => { fx().dropShadow.enabled = v; });
    colour('Colour', () => fx().dropShadow.color, (c) => { fx().dropShadow.color = c; });
    slider('Opacity (%)', 0, 100, () => Math.round(fx().dropShadow.opacity * 100), (v) => { fx().dropShadow.opacity = v / 100; });
    slider('Angle (\u00b0)', -180, 180, () => fx().dropShadow.angle, (v) => { fx().dropShadow.angle = v; });
    slider('Distance (px)', 0, 200, () => fx().dropShadow.distance, (v) => { fx().dropShadow.distance = v; });
    slider('Size (px)', 0, 100, () => fx().dropShadow.size, (v) => { fx().dropShadow.size = v; });
    check('Outer Glow', () => fx().outerGlow.enabled, (v) => { fx().outerGlow.enabled = v; });
    colour('Colour', () => fx().outerGlow.color, (c) => { fx().outerGlow.color = c; });
    slider('Opacity (%)', 0, 100, () => Math.round(fx().outerGlow.opacity * 100), (v) => { fx().outerGlow.opacity = v / 100; });
    slider('Size (px)', 0, 100, () => fx().outerGlow.size, (v) => { fx().outerGlow.size = v; });
    check('Stroke (outside)', () => fx().stroke.enabled, (v) => { fx().stroke.enabled = v; });
    colour('Colour', () => fx().stroke.color, (c) => { fx().stroke.color = c; });
    slider('Size (px)', 1, 50, () => fx().stroke.size, (v) => { fx().stroke.size = v; });
    slider('Opacity (%)', 0, 100, () => Math.round(fx().stroke.opacity * 100), (v) => { fx().stroke.opacity = v / 100; });
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.onClose = () => { if (!this.applied) this.engine.previewLayerEffects(null); };
  }

  show(): void {
    const layer = this.engine.current?.activeLayer;
    if (!layer || layer.isGroup || layer.adjustment) { this.engine.notice('Select a pixel layer to give it a layer style.'); return; }
    this.layerId = layer.id;
    this.applied = false;
    this.fx = structuredClone(layer.effects ?? defaultEffects());
    for (const sync of this.syncs) sync();
    this.open();
    this.engine.previewLayerEffects(layer.id, this.fx);
  }

  private changed(): void {
    if (this.layerId) this.engine.previewLayerEffects(this.layerId, this.fx);
  }

  private apply(): void {
    this.applied = true;
    const id = this.layerId;
    this.close();
    if (id) this.engine.setLayerEffects(id, effectsActive(this.fx) ? this.fx : null);
  }
}
