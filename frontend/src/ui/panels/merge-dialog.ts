import type { Engine } from '../../engine';
import { toBlob, type Surface } from '../../engine/surface';
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
  private distortion = false;
  private vignette = false;
  private readonly input = el('<input type="file" accept="image/*" multiple style="display: none">') as HTMLInputElement;
  private readonly picked = el('<p class="cv-dialog-note" role="status" style="min-height: 1.4em"></p>');
  private readonly note = el('<p class="cv-dialog-note" role="status" style="min-height: 2.8em"></p>');
  private readonly panoRows: HTMLElement;
  private readonly hdrRows: HTMLElement;
  private align = true;
  private depth: 32 | 16 | 8 = 32;
  private ghost = 0;
  private ghostBase = -1;
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
    const vig = checkRow('Vignette Removal', (v) => { this.vignette = v; });
    const geo = checkRow('Geometric Distortion Correction', (v) => { this.distortion = v; });
    this.panoRows = el('<div></div>');
    this.panoRows.append(layout.el, crop.el, vig.el, geo.el, el('<p class="cv-dialog-note">Auto finds where the photos meet and projects them onto a sphere; Perspective keeps straight lines straight for a narrow view; Cylindrical bends the photos onto a cylinder for a wide one; Collage only moves, turns and scales them; Reposition moves and turns. Vignette Removal needs photos of one size. Distortion correction straightens the lens bend the overlaps show.</p>'));
    this.panoRows.hidden = mode !== 'panorama';
    const align = checkRow('Attempt to Automatically Align Source Images', (v) => { this.align = v; });
    this.hdrRows = el('<div></div>');
    const ghost = sliderRow('Remove ghosts', 0, 100, 1, (v) => { this.ghost = v; }, { def: 0 });
    this.hdrRows.append(align.el, ghost.el, this.times);
    this.hdrRows.hidden = mode !== 'hdr';
    align.set(true); ghost.set(0);
    const intro = mode === 'panorama' ? 'Choose two or more overlapping photos, or add the open documents.' : 'Choose two or more exposures of the same scene; their exposure times come from the photos\' EXIF, or are worked out from the photos.';
    this.body.append(el(`<p class="cv-dialog-note">${intro}</p>`), choose, open, this.input, this.picked, this.panoRows, this.hdrRows, this.note);
    layout.set('auto'); crop.set(false); vig.set(false); geo.set(false);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => void this.apply());
    this.remember([this.input]);   // the layout and the crop; the photos themselves are chosen each time
  }

  show(): void { this.files = []; this.depth = 32; this.input.value = ''; this.describe(); setText(this.note, ''); this.open(); }

  private describe(): void { setText(this.picked, this.files.length ? `${this.files.length} photo${this.files.length > 1 ? 's' : ''}: ${this.files.map((f) => f.name).join(', ')}` : 'No photos chosen yet.'); }

  /** The command's way in: the photos given and the choices from `o` (layout, crop, vignette, distortion; align, times); throws what the dialog would say. */
  async drive(files: File[], o: Record<string, unknown>): Promise<void> {
    this.files = files;
    const shown = this.ghost;
    this.layout = (['auto', 'perspective', 'cylindrical', 'collage', 'reposition'] as const).find((l) => l === o.layout) ?? 'auto';
    this.crop = o.crop === true; this.vignette = o.vignette === true; this.distortion = o.distortion === true;
    this.align = o.align !== false;
    this.times.value = typeof o.times === 'string' ? o.times.split(',').map((t) => { const [top, bottom] = t.split('/'); return bottom ? String(Number(top) / Number(bottom)) : t.trim(); }).join(',') : '';
    this.depth = o.depth === 16 || o.depth === 8 ? o.depth : 32;
    this.ghost = typeof o.ghost === 'number' ? Math.max(0, Math.min(100, o.ghost)) : 0;
    this.ghostBase = typeof o.base === 'number' && o.base >= 1 ? Math.round(o.base) - 1 : -1;
    this.failed = '';
    await this.apply();
    this.ghost = shown; this.ghostBase = -1;
    if (this.failed) throw new Error(this.failed);
  }

  private failed = '';

  private async apply(): Promise<void> {
    if (this.files.length < 2) { this.failed = 'Choose at least two photos.'; setText(this.note, this.failed); return; }
    const files = this.files;
    setText(this.note, this.mode === 'panorama' ? 'Stitching...' : 'Merging...');
    try {
      if (this.mode === 'panorama') {
        const r = await api.mergePanorama(files.map((f) => ({ name: f.name, blob: f })), this.layout, this.crop, { distortion: this.distortion, vignette: this.vignette }), bmp = await createImageBitmap(r.png);
        this.close();
        this.engine.openImage({ source: bmp, width: bmp.width, height: bmp.height, name: 'Panorama' });
        const [kept, given] = r.stitched.split('/');
        if (kept && given && kept !== given) this.engine.notice(`${kept} of the ${given} photos could be joined; the others did not overlap enough.`);
        else if (this.distortion || this.vignette) this.engine.notice([this.distortion ? (r.notes.k1 ? `Lens distortion corrected (k1 ${r.notes.k1}).` : 'No lens distortion found.') : '', this.vignette && r.notes.vignette ? `Vignette: ${r.notes.vignette}.` : ''].filter(Boolean).join(' '));
      } else {
        const raw = this.times.value.trim(), r = await api.mergeHdr(files, { align: this.align, times: raw ? raw.split(',').map((t) => Number(t.trim())) : [], ghost: this.ghost, base: this.ghostBase }), n =r.width * r.height, data = new Float32Array(n * 4);
        for (let j = 0; j < n; j++) { data[j * 4] = r.rgb[j * 3]; data[j * 4 + 1] = r.rgb[j * 3 + 1]; data[j * 4 + 2] = r.rgb[j * 3 + 2]; data[j * 4 + 3] = 1; }
        this.close();
        this.engine.openDeep('HDR', { mode: 'rgb', n: 3, width: r.width, height: r.height, data }, 32);
        if (this.depth !== 32 && !this.engine.setDepth(this.depth)) this.engine.notice('The merge stayed 32 bit: it could not be toned down.', 'error');
        this.engine.notice(`Merged at exposure times ${r.times.map((t) => (t >= 1 ? t.toFixed(2) : `1/${Math.round(1 / t)}`)).join(', ')} (${r.source})${r.ghosts > 0 ? `; ghosts covered ${(r.ghosts * 100).toFixed(1)} percent of the picture` : ''}.`);
      }
    } catch (err) { this.failed = err instanceof Error ? err.message : 'The engine could not merge these photos.'; setText(this.note, this.failed); }
  }
}
