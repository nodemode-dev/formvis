import type { Engine } from '../../engine';
import { cspText, cubeText, hasVisibleAdjustment, sampleLut, threeDlText } from '../../engine/lut-export';
import { zipFiles } from '../../io/zip';
import { Dialog } from '../dialogs';
import { el, q, setText, setValue } from '../dom';
import { toast } from '../toast';
import { checkRow, selectRow } from './controls';

/** File > Export > Color Lookup Tables (DEV_PLAN 29.6 part a): records the visible adjustment layers as .cube, .3dl
 *  and .csp tables at Small (17), Medium (33) or Large (65) points per side. Rows are built once. */
export class LutExportDialog extends Dialog {
  private size = 33;
  private readonly want = { cube: true, '3dl': true, csp: true };
  private readonly desc = el('<label class="cv-field"><span></span><input class="cv-input" type="text" maxlength="120"></label>');
  private readonly descInput: HTMLInputElement;
  private readonly note = el('<p class="cv-dialog-note" role="status" style="min-height: 1.4em"></p>');
  private readonly rows: Array<{ set(v: boolean): void }>;

  constructor(private readonly engine: Engine, private readonly deliver: (blob: Blob, name: string) => Promise<void> | void) {
    super('Color Lookup Tables', 420);
    setText(q(this.desc, 'span'), 'Description');
    this.descInput = q(this.desc, 'input') as HTMLInputElement;
    const quality = selectRow('Quality', [['17', 'Small (17)'], ['33', 'Medium (33)'], ['65', 'Large (65)']], (v) => { this.size = Number(v); });
    const cube = checkRow('CUBE', (v) => { this.want.cube = v; });
    const threeDl = checkRow('3DL', (v) => { this.want['3dl'] = v; });
    const csp = checkRow('CSP', (v) => { this.want.csp = v; });
    this.rows = [cube, threeDl, csp];
    quality.set('33'); cube.set(true); threeDl.set(true); csp.set(true);
    this.body.append(el('<p class="cv-dialog-note">Records the visible adjustment layers as a lookup table. Layer masks are not recorded.</p>'), this.desc, quality.el, cube.el, threeDl.el, csp.el, this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => void this.apply());
  }

  show(): void {
    setValue(this.descInput, this.engine.current?.name ?? 'Untitled');
    setText(this.note, '');
    this.open();
  }

  private async apply(): Promise<void> {
    const p = this.engine.current;
    if (!p) return;
    if (!hasVisibleAdjustment(p.doc)) { toast('Add an adjustment layer first: the table records the adjustments.', 'info'); return; }
    const desc = this.descInput.value.trim() || p.name, size = this.size;
    const picks = (['cube', '3dl', 'csp'] as const).filter((k) => this.want[k]);
    if (!picks.length) { setText(this.note, 'Choose at least one format.'); return; }
    const lut = sampleLut(p.doc, size);
    const files = picks.map((k) => ({
      name: `${desc}.${k}`,
      blob: new Blob([k === 'cube' ? cubeText(lut, size, desc) : k === '3dl' ? threeDlText(lut, size) : cspText(lut, size)], { type: 'text/plain' }),
    }));
    this.close();
    if (files.length === 1) await this.deliver(files[0].blob, files[0].name);
    else await this.deliver(await zipFiles(files), `${desc} LUTs.zip`);
    toast(`Exported ${files.length} lookup table${files.length === 1 ? '' : 's'}.`, 'info');
  }
}
