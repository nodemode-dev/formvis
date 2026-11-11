import { Raster, type Engine } from '../../engine';
import { api } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { checkRow, selectRow, sliderRow } from './controls';

export type AlignBlendMode = 'align' | 'blend';
export interface AlignBlendOptions { projection?: string; method?: string; seamless?: boolean; vignette?: boolean; reference?: string; distortion?: boolean; registration?: string; halo?: number; depth?: boolean; spatial?: boolean }
/** A layer's radial gain from the engine: centre and radius in layer pixels, and the gain at 64 steps of r from 0 to 1. */
interface VignetteGain { cx: number; cy: number; radius: number; lut: number[] }

/** Edit > Auto-Align Layers and Auto-Blend Layers (DEV_PLAN 32.1), on the selected pixel layers (the
 *  bottom-most is the reference). The engine finds the transforms or the masks; both land as one undo step. */
export class AlignBlendDialog extends Dialog {
  private static readonly made = new WeakMap<Engine, Partial<Record<AlignBlendMode, AlignBlendDialog>>>();
  private projection = 'auto';
  private method = 'panorama';
  private seamless = true;
  private vignette = false;
  private reference = 'bottom';
  private distortion = false;
  private registration = 'features';
  private halo = 0;
  private depth = false;
  private spatial = true;
  private busy = false;
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
  static async execute(engine: Engine, mode: AlignBlendMode, o: AlignBlendOptions, live: () => boolean = () => true): Promise<string> {
    const ids = AlignBlendDialog.layers(engine);
    if (ids.length < 2) return 'Select two or more pixel layers.';
    const blobs: Blob[] = [];
    for (const id of ids) {
      const c = engine.renderLayerAlone(id) as unknown as HTMLCanvasElement | OffscreenCanvas;
      blobs.push('convertToBlob' in c ? await c.convertToBlob({ type: 'image/png' }) : await new Promise<Blob>((res, rej) => (c as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error('Could not read a layer.'))), 'image/png')));
    }
    if (mode === 'align') {
      const refAt = o.reference === 'top' ? ids.length - 1 : o.reference === 'middle' ? Math.floor((ids.length - 1) / 2) : 0;
      const r = await api.mergeAlign(blobs, o.projection ?? 'auto', !!o.vignette, refAt, !!o.distortion, o.registration ?? 'features');
      const edits = ids.map((id, i) => ({ id, matrix: r.matrices[i] }));
      const W = engine.current?.doc.width ?? 1, H = engine.current?.doc.height ?? 1;
      const bent: Array<ImageData | null> = [];
      for (const w of r.warped ?? []) {
        if (!w) { bent.push(null); continue; }
        const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${w}`)).blob()), c = new OffscreenCanvas(W, H), x = c.getContext('2d')!;
        x.drawImage(bmp, 0, 0);
        bent.push(x.getImageData(0, 0, W, H));
      }
      if (!live()) return 'Cancelled.';
      const lens = o.vignette && !bent.some(Boolean) ? (r as { gains?: Array<VignetteGain | null> }).gains ?? [] : [];
      const ok = bent.some(Boolean) || lens.some(Boolean)
        ? engine.edit('Auto-Align Layers', () => {
          ids.forEach((id, i) => {
            const g = lens[i];
            if (bent[i]) { engine.replaceLayerPixels(id, bent[i] as ImageData, 'Lens Correction'); return; }
            if (!g) return;
            const c = engine.renderLayerAlone(id) as unknown as HTMLCanvasElement | OffscreenCanvas;
            const img = (c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D).getImageData(0, 0, c.width, c.height);
            AlignBlendDialog.removeVignette(img, g);
            engine.replaceLayerPixels(id, img, 'Vignette Removal');
          });
          return engine.applyLayerEdits(edits, 'Auto-Align Layers');
        })
        : engine.applyLayerEdits(edits, 'Auto-Align Layers');
      const vig = o.vignette ? (lens.some(Boolean) || r.vignette === 'applied' ? ' Vignetting removed.' : ' No vignetting found.') : '';
      const lensNote = (r.lens && r.lens.k1 !== 0 ? ` Lens distortion corrected (k1 ${r.lens.k1}, matching error ${r.lens.error_before} px to ${r.lens.error_after} px).` : r.lens ? ' No lens distortion found.' : '') + (r.focal ? ` ${o.projection === 'spherical' ? 'Sphere' : 'Cylinder'} radius ${Math.round(r.focal)} px.` : '');
      const refName = o.reference === 'top' ? 'top-most' : o.reference === 'middle' ? 'middle' : 'bottom-most';
      return ok ? `Aligned ${ids.length - 1} layer${ids.length > 2 ? 's' : ''} to the ${refName}.${vig}${lensNote}` : 'Nothing was aligned.';
    }
    const r = await api.mergeBlend(blobs, o.method ?? 'panorama', !!o.seamless, o.halo ?? 0, !!o.depth, o.spatial !== false);
    if (o.method === 'multiband' && r.blended && engine.current) {
      const W = engine.current.doc.width, H = engine.current.doc.height, bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${r.blended}`)).blob()), raster = new Raster(W, H);
      if (!live()) return 'Cancelled.';
      raster.ctx.drawImage(bmp, 0, 0, W, H);
      raster.touch();
      engine.insertRasterLayer(raster, 'Multiband Blend', 0, 0, {}, 'Auto-Blend Layers');
      return `Blended ${ids.length} layers into a new Multiband Blend layer.`;
    }
    const masks: ImageBitmap[] = [];
    for (const m of r.masks) masks.push(await createImageBitmap(await (await fetch(`data:image/png;base64,${m}`)).blob()));
    if (!live()) return 'Cancelled.';
    const ok = engine.applyLayerEdits(ids.map((id, i) => ({ id, mask: masks[i], gain: o.seamless ? r.tones[i] : undefined, field: o.seamless ? r.fields?.[i] ?? undefined : undefined })), 'Auto-Blend Layers');
    if (ok && r.depth && engine.current) {
      const W = engine.current.doc.width, H = engine.current.doc.height, bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${r.depth}`)).blob()), raster = new Raster(W, H);
      if (!live()) return 'Cancelled.';
      raster.ctx.drawImage(bmp, 0, 0, W, H);
      raster.touch();
      engine.insertRasterLayer(raster, 'Depth Map', 0, 0, { visible: false }, 'Depth Map from Auto-Blend');
    }
    return ok ? `Blended ${ids.length} layers with layer masks.${r.depth ? ' Depth Map layer added (hidden).' : ''}` : 'Nothing was blended.';
  }

  constructor(private readonly engine: Engine, private readonly mode: AlignBlendMode) {
    super(mode === 'align' ? 'Auto-Align Layers' : 'Auto-Blend Layers', 420);
    if (mode === 'align') {
      const proj = selectRow('Projection', [['auto', 'Auto'], ['perspective', 'Perspective'], ['cylindrical', 'Cylindrical'], ['spherical', 'Spherical'], ['collage', 'Collage'], ['reposition', 'Reposition']], (v) => { this.projection = v; });
      const ref = selectRow('Reference Layer', [['bottom', 'Bottom-most'], ['middle', 'Middle'], ['top', 'Top-most']], (v) => { this.reference = v; });
      const reg = selectRow('Registration', [['features', 'Features (SIFT or ORB)'], ['intensity', 'Intensity (correlation)']], (v) => { this.registration = v; });
      const vig = checkRow('Vignette Removal', (v) => { this.vignette = v; });
      const geo = checkRow('Geometric Distortion Correction', (v) => { this.distortion = v; });
      this.body.append(el('<p class="cv-dialog-note">The reference layer stays put; every other selected layer is moved to line up with it. Cylindrical and Spherical find the lens focal length from the overlaps and bend every layer onto a cylinder or a sphere first. Collage only moves, turns and scales each layer. Vignette Removal brightens the corners of every layer by the falloff the overlaps show. Geometric Distortion Correction finds the barrel or pincushion bend that makes the overlaps agree and straightens the layers. Intensity registration refines Auto, Perspective and Reposition by maximizing the correlation of the gray pictures, so it also works on layers with few features.</p>'), proj.el, ref.el, reg.el, vig.el, geo.el, this.note);
      proj.set('auto'); ref.set('bottom'); reg.set('features'); vig.set(false); geo.set(false);
    } else {
      const meth = selectRow('Blend Method', [['panorama', 'Panorama'], ['stack', 'Stack Images'], ['multiband', 'Multiband (new layer)']], (v) => { this.method = v; });
      const tone = checkRow('Seamless Tones and Colors', (v) => { this.seamless = v; });
      const spatial = checkRow('Follow tone changes across the overlap', (v) => { this.spatial = v; });
      const halo = sliderRow('Halo Control', 0, 100, 1, (v) => { this.halo = v; });
      const depth = checkRow('Depth Map Layer (Stack Images)', (v) => { this.depth = v; });
      this.body.append(el('<p class="cv-dialog-note">Adds a layer mask to each selected layer. Panorama joins overlapping layers along soft seams; Stack Images keeps the sharpest layer at each point. Halo Control, for Stack Images, makes the transitions follow the sharp edges so a blurred neighbor does not bleed over them. Depth Map Layer adds a hidden gray layer showing which layer is sharpest where. Multiband mixes the layers band by band along the Panorama seams (a Laplacian pyramid blend) into a new layer and leaves the sources as they are. Seamless Tones matches each layer to the reference; with the tone-change option the gain varies smoothly across the picture where the overlap shows it varies, instead of one gain for the whole layer.</p>'), meth.el, tone.el, spatial.el, halo.el, depth.el, this.note);
      meth.set('panorama'); tone.set(true); spatial.set(true); halo.set(0); depth.set(false);
    }
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => void this.apply());
  }

  show(): void { setText(this.note, ''); this.open(); }

  private async apply(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    setText(this.note, this.mode === 'align' ? 'Aligning...' : 'Blending...');
    try {
      const msg = await AlignBlendDialog.execute(this.engine, this.mode, { projection: this.projection, method: this.method, seamless: this.seamless, vignette: this.vignette, reference: this.reference, distortion: this.distortion, registration: this.registration, halo: this.halo, depth: this.depth, spatial: this.spatial }, () => this.isOpen);
      if (!this.isOpen) return;
      this.close();
      this.engine.notice(msg);
    } catch (err) { setText(this.note, err instanceof Error ? err.message : 'The engine could not do this.'); } finally { this.busy = false; }
  }
}
