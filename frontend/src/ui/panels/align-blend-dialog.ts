import type { Engine } from '../../engine';
import { api } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { checkRow, selectRow } from './controls';

export type AlignBlendMode = 'align' | 'blend';
export interface AlignBlendOptions { projection?: string; method?: string; seamless?: boolean; vignette?: boolean }
/** A layer's radial gain from the engine: centre and radius in layer pixels, and the gain at 64 steps of r from 0 to 1. */
interface VignetteGain { cx: number; cy: number; radius: number; lut: number[] }

/** Edit > Auto-Align Layers and Auto-Blend Layers (DEV_PLAN 32.1), as Photoshop's, on the selected pixel layers (the
 *  bottom-most is the reference). The engine finds the transforms or the masks; both land as one undo step. */
export class AlignBlendDialog extends Dialog {
  private static readonly made = new WeakMap<Engine, Partial<Record<AlignBlendMode, AlignBlendDialog>>>();
  private projection = 'auto';
  private method = 'panorama';
  private seamless = true;
  private vignette = false;
  private readonly note = el('<p class="cv-dialog-note" role="status" style="min-height: 1.4em"></p>');

  static get(engine: Engine, mode: AlignBlendMode): AlignBlendDialog {
    const m = AlignBlendDialog.made.get(engine) ?? {};
    AlignBlendDialog.made.set(engine, m);
    return (m[mode] ??= new AlignBlendDialog(engine, mode));
  }

  /** The selected plain pixel layers, bottom-most first. */
  static layers(engine: Engine): string[] {
    const p = engine.current;
    return p ? p.doc.layers.filter((l) => p.selectedIds.has(l.id) && !!l.raster && !l.isGroup && !l.adjustment && !l.text && !l.shape && !l.smart).map((l) => l.id) : [];
  }

  /** Divides out a layer's vignette in place: each colour channel times the table's gain at the pixel's distance from the
   *  centre (the engine's `gains` entry, r = 1 at the radius), transparent pixels left alone. */
  private static removeVignette(img: ImageData, g: VignetteGain): void {
    const { data, width, height } = img, last = g.lut.length - 1;
    for (let y = 0; y < height; y++) {
      const dy = y + 0.5 - g.cy;
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        if (!data[o + 3]) continue;
        const t = Math.min(1, Math.hypot(x + 0.5 - g.cx, dy) / g.radius) * last, i = Math.min(last - 1, Math.floor(t));
        const k = g.lut[i] + (g.lut[i + 1] - g.lut[i]) * (t - i);
        data[o] = Math.min(255, Math.round(data[o] * k));
        data[o + 1] = Math.min(255, Math.round(data[o + 1] * k));
        data[o + 2] = Math.min(255, Math.round(data[o + 2] * k));
      }
    }
  }

  /** Runs without the dialog; resolves to a sentence about what happened. */
  static async execute(engine: Engine, mode: AlignBlendMode, o: AlignBlendOptions): Promise<string> {
    const ids = AlignBlendDialog.layers(engine);
    if (ids.length < 2) return 'Select two or more pixel layers.';
    const blobs: Blob[] = [];
    for (const id of ids) {
      const c = engine.renderLayerAlone(id) as unknown as HTMLCanvasElement | OffscreenCanvas;
      blobs.push('convertToBlob' in c ? await c.convertToBlob({ type: 'image/png' }) : await new Promise<Blob>((res, rej) => (c as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error('Could not read a layer.'))), 'image/png')));
    }
    if (mode === 'align') {
      const r = await api.mergeAlign(blobs, o.projection ?? 'auto', !!o.vignette);
      const edits = ids.map((id, i) => ({ id, matrix: r.matrices[i] }));
      const lens = o.vignette ? (r as { gains?: Array<VignetteGain | null> }).gains ?? [] : [];
      const ok = lens.some(Boolean)
        ? engine.edit('Auto-Align Layers', () => {
          ids.forEach((id, i) => {
            const g = lens[i];
            if (!g) return;
            const c = engine.renderLayerAlone(id) as unknown as HTMLCanvasElement | OffscreenCanvas;
            const img = (c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D).getImageData(0, 0, c.width, c.height);
            AlignBlendDialog.removeVignette(img, g);
            engine.replaceLayerPixels(id, img, 'Vignette Removal');
          });
          return engine.applyLayerEdits(edits, 'Auto-Align Layers');
        })
        : engine.applyLayerEdits(edits, 'Auto-Align Layers');
      const lensNote = o.vignette ? (lens.some(Boolean) ? ' Vignetting removed.' : ' No vignetting found.') : '';
      return ok ? `Aligned ${ids.length - 1} layer${ids.length > 2 ? 's' : ''} to the bottom-most.${lensNote}` : 'Nothing was aligned.';
    }
    const r = await api.mergeBlend(blobs, o.method ?? 'panorama', !!o.seamless);
    const masks: ImageBitmap[] = [];
    for (const m of r.masks) masks.push(await createImageBitmap(await (await fetch(`data:image/png;base64,${m}`)).blob()));
    const ok = engine.applyLayerEdits(ids.map((id, i) => ({ id, mask: masks[i], gain: o.seamless ? r.tones[i] : undefined })), 'Auto-Blend Layers');
    return ok ? `Blended ${ids.length} layers with layer masks.` : 'Nothing was blended.';
  }

  constructor(private readonly engine: Engine, private readonly mode: AlignBlendMode) {
    super(mode === 'align' ? 'Auto-Align Layers' : 'Auto-Blend Layers', 420);
    if (mode === 'align') {
      const proj = selectRow('Projection', [['auto', 'Auto'], ['perspective', 'Perspective'], ['cylindrical', 'Cylindrical'], ['reposition', 'Reposition']], (v) => { this.projection = v; });
      const vig = checkRow('Vignette Removal', (v) => { this.vignette = v; });
      this.body.append(el('<p class="cv-dialog-note">The bottom-most selected layer stays put; every other selected layer is moved to line up with it. Cylindrical is treated as Perspective. Vignette Removal brightens the corners of every layer by the falloff the overlaps show, before the layers are moved.</p>'), proj.el, vig.el, this.note);
      proj.set('auto'); vig.set(false);
    } else {
      const meth = selectRow('Blend Method', [['panorama', 'Panorama'], ['stack', 'Stack Images']], (v) => { this.method = v; });
      const tone = checkRow('Seamless Tones and Colors', (v) => { this.seamless = v; });
      this.body.append(el('<p class="cv-dialog-note">Adds a layer mask to each selected layer. Panorama joins overlapping layers along soft seams; Stack Images keeps the sharpest layer at each point.</p>'), meth.el, tone.el, this.note);
      meth.set('panorama'); tone.set(true);
    }
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => void this.apply());
  }

  show(): void { setText(this.note, ''); this.open(); }

  private async apply(): Promise<void> {
    setText(this.note, this.mode === 'align' ? 'Aligning...' : 'Blending...');
    try {
      const msg = await AlignBlendDialog.execute(this.engine, this.mode, { projection: this.projection, method: this.method, seamless: this.seamless, vignette: this.vignette });
      this.close();
      this.engine.notice(msg);
    } catch (err) { setText(this.note, err instanceof Error ? err.message : 'The engine could not do this.'); }
  }
}
