import type { Engine } from '../../engine';
import { Raster, toBlob, type Surface } from '../../engine/surface';
import type { ToneMethod } from '../../engine/deep';
import { api } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { checkRow, selectRow, sliderRow } from './controls';

/** File > Automate > Photomerge and Merge to HDR (1.58.2, the parity plan's L6): choose the photos,
 *  and the engine stitches a panorama (Auto or Reposition, transparent edges or cropped) or merges exposures into a
 *  32-bit picture; either opens as a new document. Rows are built once. */
export class MergeDialog extends Dialog {
  private files: File[] = [];
  private layout: 'auto' | 'reposition' | 'perspective' | 'cylindrical' | 'collage' = 'auto';
  private crop = false;
  private fill = false;
  private distortion = false;
  private vignette = false;
  private asLayers = false;
  private readonly input = el('<input type="file" accept="image/*" multiple style="display: none">') as HTMLInputElement;
  private readonly picked = el('<p class="cv-dialog-note" role="status" style="min-height: 1.4em"></p>');
  private readonly note = el('<p class="cv-dialog-note" role="status" style="min-height: 2.8em"></p>');
  private readonly panoRows: HTMLElement;
  private readonly hdrRows: HTMLElement;
  private align = true;
  private depth: 32 | 16 | 8 = 32;
  private ghost = 0;
  private ghostBase = -1;
  private method: ToneMethod = 'exposure';
  private exposure = 0;
  private gamma = 1;
  private toneRows: HTMLElement[] = [];
  private readonly times = el('<input class="cv-input" type="text" placeholder="Exposure times in seconds, one per photo, comma separated (blank: from the photos)" aria-label="Exposure times">') as HTMLInputElement;

  constructor(private readonly engine: Engine, private readonly mode: 'panorama' | 'hdr') {
    super(mode === 'panorama' ? 'Photomerge' : 'Merge to HDR', 440);
    const choose = el('<button class="cv-btn" type="button">Choose photos...</button>') as HTMLButtonElement;
    choose.addEventListener('click', () => this.input.click());
    this.input.addEventListener('change', () => { this.files = Array.from(this.input.files ?? []); this.describe(); });
    const open = el('<button class="cv-btn" type="button" title="Add every open document, as it shows now">Open documents</button>') as HTMLButtonElement;
    open.addEventListener('click', () => {
      const docs = this.engine.projects.map((p) => ({ p, s: this.engine.flattenedOf(p) })).filter((d) => d.s);
      void Promise.all(docs.map(async (d, i) => new File([await toBlob(d.s as Surface)], `${d.p.name || `Document ${i + 1}`}.png`, { type: 'image/png' }))).then((made) => { this.files = [...this.files, ...made]; this.describe(); });
    });
    const layout = selectRow('Layout', [['auto', 'Auto'], ['perspective', 'Perspective'], ['cylindrical', 'Cylindrical'], ['collage', 'Collage'], ['reposition', 'Reposition']], (v) => { this.layout = v as MergeDialog['layout']; });
    const crop = checkRow('Crop to the picture', (v) => { this.crop = v; });
    const fill = checkRow('Fill transparent edges (Content-Aware Fill)', (v) => { this.fill = v; });
    const vig = checkRow('Vignette Removal', (v) => { this.vignette = v; });
    const geo = checkRow('Geometric Distortion Correction', (v) => { this.distortion = v; });
    this.panoRows = el('<div></div>');
    const layers = checkRow('Photos as masked layers', (v) => { this.asLayers = v; });
    this.panoRows.append(layout.el, crop.el, fill.el, layers.el, vig.el, geo.el, el('<p class="cv-dialog-note">Photos as masked layers opens one layer per photo, each with a seam mask, instead of one joined picture (Crop and Fill are not used then). Fill transparent edges paints the empty corners and gaps of the joined picture from the photo around them. Auto finds where the photos meet and projects them onto a sphere; Perspective keeps straight lines straight for a narrow view; Cylindrical bends the photos onto a cylinder for a wide one; Collage only moves, turns and scales them; Reposition moves and turns. Vignette Removal needs photos of one size. Distortion correction straightens the lens bend the overlaps show.</p>'));
    this.panoRows.hidden = mode !== 'panorama';
    const align = checkRow('Attempt to Automatically Align Source Images', (v) => { this.align = v; });
    this.hdrRows = el('<div></div>');
    const ghost = sliderRow('Remove ghosts', 0, 100, 1, (v) => { this.ghost = v; }, { def: 0 });
    const syncTone = (): void => { const down = this.depth !== 32; method.el.hidden = !down; for (const r of this.toneRows) r.hidden = !down || this.method !== 'exposure'; };
    const bits = selectRow('Mode', [['32', '32 Bit'], ['16', '16 Bit'], ['8', '8 Bit']], (v) => { this.depth = Number(v) as 32 | 16 | 8; syncTone(); });
    const method = selectRow('Toning method', [['exposure', 'Exposure and Gamma'], ['highlights', 'Highlight Compression'], ['equalize', 'Equalize Histogram']], (v) => { this.method = v as ToneMethod; syncTone(); });
    const exposure = sliderRow('Exposure', -5, 5, 0.1, (v) => { this.exposure = v; }, { def: 0 });
    const gamma = sliderRow('Gamma', 0.1, 4, 0.05, (v) => { this.gamma = v; }, { def: 1 });
    this.toneRows = [exposure.el, gamma.el];
    this.hdrRows.append(align.el, ghost.el, bits.el, method.el, exposure.el, gamma.el, this.times);
    this.hdrRows.hidden = mode !== 'hdr';
    align.set(true); ghost.set(0); bits.set('32'); method.set('exposure'); exposure.set(0); gamma.set(1); syncTone();
    const intro = mode === 'panorama' ? 'Choose two or more overlapping photos, or add the open documents.' : 'Choose two or more exposures of the same scene; their exposure times come from the photos\' EXIF, or are worked out from the photos.';
    this.body.append(el(`<p class="cv-dialog-note">${intro}</p>`), choose, open, this.input, this.picked, this.panoRows, this.hdrRows, this.note);
    layout.set('auto'); crop.set(false); fill.set(false); layers.set(false); vig.set(false); geo.set(false);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => void this.apply());
    this.remember([this.input]);   // the layout and the crop; the photos themselves are chosen each time
  }

  show(): void { this.files = []; this.input.value = ''; this.describe(); setText(this.note, ''); this.open(); }

  private describe(): void { setText(this.picked, this.files.length ? `${this.files.length} photo${this.files.length > 1 ? 's' : ''}: ${this.files.map((f) => f.name).join(', ')}` : 'No photos chosen yet.'); }

  /** The command's way in: the photos given and the choices from `o` (layout, crop, vignette, distortion; align, times); throws what the dialog would say. */
  async drive(files: File[], o: Record<string, unknown>): Promise<void> {
    this.files = files;
    const shown = { ghost: this.ghost, depth: this.depth, method: this.method, exposure: this.exposure, gamma: this.gamma };
    this.layout = (['auto', 'perspective', 'cylindrical', 'collage', 'reposition'] as const).find((l) => l === o.layout) ?? 'auto';
    this.crop = o.crop === true; this.fill = o.fill === true; this.asLayers = o.layers === true; this.vignette = o.vignette === true; this.distortion = o.distortion === true;
    this.align = o.align !== false;
    this.times.value = typeof o.times === 'string' ? o.times.split(',').map((t) => { const [top, bottom] = t.split('/'); return bottom ? String(Number(top) / Number(bottom)) : t.trim(); }).join(',') : '';
    this.depth = o.depth === 16 || o.depth === 8 ? o.depth : 32;
    this.method = o.method === 'highlights' || o.method === 'equalize' ? o.method : 'exposure';
    this.exposure = typeof o.exposure === 'number' ? Math.max(-20, Math.min(20, o.exposure)) : 0;
    this.gamma = typeof o.gamma === 'number' ? Math.max(0.1, Math.min(9.99, o.gamma)) : 1;
    this.ghost = typeof o.ghost === 'number' ? Math.max(0, Math.min(100, o.ghost)) : 0;
    this.ghostBase = typeof o.base === 'number' && o.base >= 1 ? Math.round(o.base) - 1 : -1;
    this.failed = '';
    await this.apply();
    this.ghost = shown.ghost; this.depth = shown.depth; this.method = shown.method; this.exposure = shown.exposure; this.gamma = shown.gamma; this.ghostBase = -1;
    if (this.failed) throw new Error(this.failed);
  }

  private failed = '';

  private async apply(): Promise<void> {
    if (this.files.length < 2) { this.failed = 'Choose at least two photos.'; setText(this.note, this.failed); return; }
    const files = this.files;
    setText(this.note, this.mode === 'panorama' ? 'Stitching...' : 'Merging...');
    try {
      if (this.mode === 'panorama' && this.asLayers) {
        const r = await api.mergePanoramaLayers(files.map((f) => ({ name: f.name, blob: f })), this.layout, { distortion: this.distortion, vignette: this.vignette });
        const pairs = await Promise.all(r.layers.map(async (l) => ({ img: await createImageBitmap(l.png), mask: await createImageBitmap(l.mask) })));
        this.close();
        this.engine.openImage({ source: pairs[0].img, width: r.width, height: r.height, name: 'Photomerge' });
        pairs.forEach((p, i) => {
          if (i > 0) this.engine.insertRasterLayer(Raster.from(p.img, r.width, r.height), `Photo ${i + 1}`, 0, 0, {}, 'Photomerge layer');
          const id = this.engine.current?.activeId;
          if (!id) return;
          if (i === 0) this.engine.renameLayer(id, 'Photo 1');
          this.engine.setMaskFromImage(id, p.mask, r.width, r.height, 'Photomerge mask');
        });
        this.engine.notice(`${pairs.length} photos placed as layers with seam masks.`);
      } else if (this.mode === 'panorama') {
        const r = await api.mergePanorama(files.map((f) => ({ name: f.name, blob: f })), this.layout, this.crop, { distortion: this.distortion, vignette: this.vignette }), bmp = await createImageBitmap(r.png);
        this.close();
        this.engine.openImage({ source: bmp, width: bmp.width, height: bmp.height, name: 'Panorama' });
        if (this.fill && !this.crop) {
          await new Promise((res) => requestAnimationFrame(() => window.setTimeout(res, 0)));
          if (!(await this.engine.task(async () => this.engine.fillTransparentWithContent()))) this.engine.notice('No transparent edges were left to fill.');
        }
        const [kept, given] = r.stitched.split('/');
        if (kept && given && kept !== given) this.engine.notice(`${kept} of the ${given} photos could be joined; the others did not overlap enough.`);
        else if (this.distortion || this.vignette) this.engine.notice([this.distortion ? (r.notes.k1 ? `Lens distortion corrected (k1 ${r.notes.k1}).` : 'No lens distortion found.') : '', this.vignette && r.notes.vignette ? `Vignette: ${r.notes.vignette}.` : ''].filter(Boolean).join(' '));
      } else {
        const raw = this.times.value.trim(), r = await api.mergeHdr(files, { align: this.align, times: raw ? raw.split(',').map((t) => Number(t.trim())) : [], ghost: this.ghost, base: this.ghostBase }), n =r.width * r.height, data = new Float32Array(n * 4);
        for (let j = 0; j < n; j++) { data[j * 4] = r.rgb[j * 3]; data[j * 4 + 1] = r.rgb[j * 3 + 1]; data[j * 4 + 2] = r.rgb[j * 3 + 2]; data[j * 4 + 3] = 1; }
        this.close();
        this.engine.openDeep('HDR', { mode: 'rgb', n: 3, width: r.width, height: r.height, data }, 32);
        if (this.depth !== 32 && !this.engine.setDepth(this.depth, { exposure: this.exposure, gamma: this.gamma, method: this.method })) this.engine.notice('The merge stayed 32 bit: it could not be toned down.', 'error');
        this.engine.notice(`Merged at exposure times ${r.times.map((t) => (t >= 1 ? t.toFixed(2) : `1/${Math.round(1 / t)}`)).join(', ')} (${r.source})${r.ghosts > 0 ? `; ghosts covered ${(r.ghosts * 100).toFixed(1)} percent of the picture` : ''}.`);
      }
    } catch (err) { this.failed = err instanceof Error ? err.message : 'The engine could not merge these photos.'; setText(this.note, this.failed); }
  }
}
