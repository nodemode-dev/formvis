import type { Engine } from '../../engine';
import { api } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { checkRow, selectRow } from './controls';

/** File > Automate > Photomerge and Merge to HDR (1.58.2, the parity plan's L6): choose the photos,
 *  and the engine stitches a panorama (Auto or Reposition, transparent edges or cropped) or merges exposures into a
 *  32-bit picture; either opens as a new document. Rows are built once. */
export class MergeDialog extends Dialog {
  private files: File[] = [];
  private layout: 'auto' | 'reposition' = 'auto';
  private crop = false;
  private readonly input = el('<input type="file" accept="image/*" multiple style="display: none">') as HTMLInputElement;
  private readonly picked = el('<p class="cv-dialog-note" role="status" style="min-height: 1.4em"></p>');
  private readonly note = el('<p class="cv-dialog-note" role="status" style="min-height: 2.8em"></p>');
  private readonly panoRows: HTMLElement;

  constructor(private readonly engine: Engine, private readonly mode: 'panorama' | 'hdr') {
    super(mode === 'panorama' ? 'Photomerge' : 'Merge to HDR', 440);
    const choose = el('<button class="cv-btn" type="button">Choose photos...</button>') as HTMLButtonElement;
    choose.addEventListener('click', () => this.input.click());
    this.input.addEventListener('change', () => { this.files = Array.from(this.input.files ?? []); this.describe(); });
    const layout = selectRow('Layout', [['auto', 'Auto'], ['reposition', 'Reposition']], (v) => { this.layout = v as 'auto' | 'reposition'; });
    const crop = checkRow('Crop to the picture', (v) => { this.crop = v; });
    this.panoRows = el('<div></div>');
    this.panoRows.append(layout.el, crop.el, el('<p class="cv-dialog-note">Auto finds where the photos meet and projects them onto a sphere; Reposition only moves and turns them. Perspective, Cylindrical and Collage layouts are not offered here.</p>'));
    this.panoRows.hidden = mode !== 'panorama';
    const intro = mode === 'panorama' ? 'Choose two or more overlapping photos.' : 'Choose two or more exposures of the same scene; their exposure times come from the photos\' EXIF, or are worked out from the photos.';
    this.body.append(el(`<p class="cv-dialog-note">${intro}</p>`), choose, this.input, this.picked, this.panoRows, this.note);
    layout.set('auto'); crop.set(false);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => void this.apply());
    this.remember([this.input]);   // the layout and the crop; the photos themselves are chosen each time
  }

  show(): void { this.files = []; this.input.value = ''; this.describe(); setText(this.note, ''); this.open(); }

  private describe(): void { setText(this.picked, this.files.length ? `${this.files.length} photo${this.files.length > 1 ? 's' : ''}: ${this.files.map((f) => f.name).join(', ')}` : 'No photos chosen yet.'); }

  private async apply(): Promise<void> {
    if (this.files.length < 2) { setText(this.note, 'Choose at least two photos.'); return; }
    const files = this.files;
    setText(this.note, this.mode === 'panorama' ? 'Stitching...' : 'Merging...');
    try {
      if (this.mode === 'panorama') {
        const r = await api.mergePanorama(files, this.layout, this.crop), bmp = await createImageBitmap(r.png);
        this.close();
        this.engine.openImage({ source: bmp, width: bmp.width, height: bmp.height, name: 'Panorama' });
        const [kept, given] = r.stitched.split('/');
        if (kept && given && kept !== given) this.engine.notice(`${kept} of the ${given} photos could be joined; the others did not overlap enough.`);
      } else {
        const r = await api.mergeHdr(files), n = r.width * r.height, data = new Float32Array(n * 4);
        for (let j = 0; j < n; j++) { data[j * 4] = r.rgb[j * 3]; data[j * 4 + 1] = r.rgb[j * 3 + 1]; data[j * 4 + 2] = r.rgb[j * 3 + 2]; data[j * 4 + 3] = 1; }
        this.close();
        this.engine.openDeep('HDR', { mode: 'rgb', n: 3, width: r.width, height: r.height, data }, 32);
        this.engine.notice(`Merged at exposure times ${r.times.map((t) => (t >= 1 ? t.toFixed(2) : `1/${Math.round(1 / t)}`)).join(', ')} (${r.source}).`);
      }
    } catch (err) { setText(this.note, err instanceof Error ? err.message : 'The engine could not merge these photos.'); }
  }
}
