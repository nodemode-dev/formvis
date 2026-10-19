import type { Engine } from '../../engine';
import { noDynamics, type BrushPreset, type BrushShape } from '../../engine/brush-dynamics';
import { addMadeBrushPreset, presetFromBrush } from '../../io/brush-library';
import { Dialog } from '../dialogs';
import { el, q } from '../dom';
import { toast } from '../toast';
import { checkRow } from './controls';

/** Brush Settings > New Brush Preset: a name, a preview of the tip as a short stroke, and a choice of what the preset
 *  captures (the brush size, the Brush Settings sections, the pen dynamics, the flow). The preset is kept with the brush
 *  library and selected. Built once; the preview and the name are refreshed in place at each opening. */
export class NewBrushPresetDialog extends Dialog {
  private readonly name: HTMLInputElement;
  private readonly preview: HTMLCanvasElement;
  private readonly take = { size: true, shape: true, dynamics: true, flow: true };

  constructor(private readonly engine: Engine) {
    super('New Brush Preset', 380);
    this.body.append(el('<div class="cv-field"><span>Name</span><input class="cv-input" type="text" maxlength="60" aria-label="Name"></div>'));
    this.name = q(this.body, 'input') as HTMLInputElement;
    this.body.append(el('<canvas class="cv-brush-preview" width="320" height="70" aria-label="Brush preview" style="display:block;width:100%;max-width:320px;height:70px;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-primary)"></canvas>'));
    this.preview = q(this.body, 'canvas') as HTMLCanvasElement;
    const row = (label: string, key: keyof NewBrushPresetDialog['take']): void => { const r = checkRow(label, (v) => { this.take[key] = v; }); r.set(true); this.body.append(r.el); };
    row('Capture Brush Size and Hardness', 'size');
    row('Capture Brush Settings (tip shape, dynamics, scattering, texture, dual brush, colour dynamics, transfer)', 'shape');
    row('Capture Pen Dynamics (pressure on size, flow and opacity)', 'dynamics');
    row('Capture Flow', 'flow');
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Create', 'primary', () => void this.create());
  }

  show(): void {
    if (this.isOpen) return;
    const b = this.engine.brush;
    this.name.value = `Brush ${Math.round(b.diameter)} px`;
    this.open();
    this.draw();
    this.name.select();
  }

  /** The tip as a short S-shaped stroke, in the current size (scaled to fit), hardness, angle and roundness. */
  private draw(): void {
    const c = this.preview.getContext('2d');
    if (!c) return;
    const b = this.engine.brush, sh = this.engine.brushShape, W = this.preview.width, H = this.preview.height;
    c.clearRect(0, 0, W, H);
    const d = Math.max(2, Math.min(H - 8, b.diameter)), r = d / 2, round = Math.max(0.05, sh.roundness / 100), turn = (-sh.angle * Math.PI) / 180;
    let tipCanvas: HTMLCanvasElement | null = null;
    if (b.tip) {
      tipCanvas = document.createElement('canvas');
      tipCanvas.width = b.tip.w; tipCanvas.height = b.tip.h;
      const t = tipCanvas.getContext('2d');
      if (t) { const img = t.createImageData(b.tip.w, b.tip.h); for (let i = 0; i < b.tip.data.length; i++) img.data[i * 4 + 3] = b.tip.data[i]; t.putImageData(img, 0, 0); }
    }
    const grad = c.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, 'rgba(120,120,120,1)'); grad.addColorStop(Math.min(0.99, Math.max(0, b.hardness)), 'rgba(120,120,120,1)'); grad.addColorStop(1, 'rgba(120,120,120,0)');
    const step = Math.max(1.5, d * 0.2);
    for (let x = r + 4; x <= W - r - 4; x += step) {
      const y = H / 2 + Math.sin((x / W) * Math.PI * 2) * Math.max(0, H / 2 - r - 4);
      c.save(); c.translate(x, y); c.rotate(turn); c.scale(1, round); c.globalAlpha = Math.max(0.15, b.opacity * 0.6);
      if (tipCanvas) { const s = d / Math.max(tipCanvas.width, tipCanvas.height); c.drawImage(tipCanvas, (-tipCanvas.width * s) / 2, (-tipCanvas.height * s) / 2, tipCanvas.width * s, tipCanvas.height * s); }
      else { c.fillStyle = grad; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); }
      c.restore();
    }
  }

  private async create(): Promise<void> {
    const e = this.engine, name = this.name.value.trim().slice(0, 60);
    if (!name) { this.name.focus(); return; }
    const { locks: _locks, protectTexture: _protect, pose: _pose, ...rest } = structuredClone(e.brushShape) as BrushShape;
    const made = presetFromBrush(e, `user-${Date.now().toString(36)}`, name, 'My Brushes');
    const preset: BrushPreset = { ...made, description: `Made from the current brush${this.take.shape ? ' and its Brush Settings' : ''}.`, dynamics: this.take.dynamics ? made.dynamics : noDynamics() };
    if (!this.take.size) { preset.diameter = 28; preset.hardness = 0.95; }
    if (!this.take.flow) delete preset.flow;
    if (this.take.shape) preset.shape = rest;
    else delete preset.shape;
    const r = await addMadeBrushPreset(e, preset);
    this.close();
    toast(r.kept ? `Made the brush preset "${name}". It is selected in the Brush tool's presets.` : `Made "${name}" for this session; the brush library could not be saved, so it will not be kept.`, r.kept ? undefined : 'error');
  }
}
