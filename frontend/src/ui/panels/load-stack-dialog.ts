import type { Engine } from '../../engine';
import { STACK_MODES, type StackMode } from '../../engine/stack-modes';
import { toBlob, type Surface } from '../../engine/surface';
import { decodeImage, IMAGE_ACCEPT, isImageFile } from '../../io/images';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { checkRow, selectRow } from './controls';

/** File > Scripts > Load Files into Stack and Statistics (30.4): choose the files, and the engine opens one document with a
 *  layer per file (the first at the bottom); Load Files can make them a smart object, Statistics always does and applies
 *  a stack mode (median by default). All rows are built once; later only text, values and the hidden flag change. */
export class LoadStackDialog extends Dialog {
  private files: File[] = [];
  private smart = false;
  private mode: StackMode = 'median';
  private readonly input = el(`<input type="file" accept="${IMAGE_ACCEPT}" multiple style="display: none">`) as HTMLInputElement;
  private align = false;
  private readonly dir = el('<input type="file" webkitdirectory multiple style="display: none">') as HTMLInputElement;
  private readonly alignRow: ReturnType<typeof checkRow>;
  private readonly picked = el('<p class="cv-dialog-note" role="status" style="min-height: 1.4em"></p>');
  private readonly note = el('<p class="cv-dialog-note" role="status" style="min-height: 1.4em"></p>');
  private readonly smartRow: ReturnType<typeof checkRow>;
  private readonly modeRow: ReturnType<typeof selectRow>;

  constructor(private readonly engine: Engine, private readonly statistics: boolean) {
    super(statistics ? 'Statistics' : 'Load Files into Stack', 440);
    const browse = el('<button class="cv-btn" type="button">Browse...</button>') as HTMLButtonElement;
    browse.addEventListener('click', () => this.input.click());
    this.input.addEventListener('change', () => { this.files = Array.from(this.input.files ?? []); this.describe(); });
    const folder = el('<button class="cv-btn" type="button" title="Every picture in a folder, in name order">Folder...</button>') as HTMLButtonElement;
    folder.addEventListener('click', () => this.dir.click());
    this.dir.addEventListener('change', () => {
      this.files = Array.from(this.dir.files ?? []).filter(isImageFile).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      this.dir.value = '';
      this.describe();
    });
    const open = el('<button class="cv-btn" type="button" title="Add every open document, as it shows now">Open documents</button>') as HTMLButtonElement;
    open.addEventListener('click', () => {
      const docs = this.engine.projects.map((p) => ({ p, s: this.engine.flattenedOf(p) })).filter((d) => d.s);
      void Promise.all(docs.map(async (d, i) => new File([await toBlob(d.s as Surface)], `${d.p.name || `Document ${i + 1}`}.png`, { type: 'image/png' }))).then((made) => { this.files = [...this.files, ...made]; this.describe(); });
    });
    this.alignRow = checkRow('Attempt to Automatically Align Source Images', (v) => { this.align = v; });
    this.smartRow = checkRow('Create Smart Object after Loading Layers', (v) => { this.smart = v; });
    this.modeRow = selectRow('Stack Mode', STACK_MODES.filter((m) => m.id !== 'none').map((m) => [m.id, m.label] as const), (v) => { this.mode = v as StackMode; });
    this.smartRow.el.hidden = statistics;
    this.modeRow.el.hidden = !statistics;
    const intro = statistics ? 'Choose two or more images; they load as a smart object stack and the stack mode combines them.' : 'Choose two or more images; each becomes a layer of one new document.';
    this.body.append(el(`<p class="cv-dialog-note">${intro}</p>`), browse, folder, open, this.input, this.dir, this.picked, this.smartRow.el, this.modeRow.el, this.alignRow.el, this.note);
    this.smartRow.set(false);
    this.alignRow.set(false);
    this.modeRow.set('median');
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => void this.apply());
    this.onClose = () => { this.ticket++; this.busy = false; };
  }

  show(): void { this.files = []; this.input.value = ''; this.describe(); setText(this.note, ''); this.open(); }

  private describe(): void { setText(this.picked, this.files.length ? `${this.files.length} file${this.files.length > 1 ? 's' : ''}: ${this.files.map((f) => f.name).join(', ')}` : 'No files chosen yet.'); }

  /** The command's way in: the pictures given and the stack mode, smart object and align choices from `o`; throws what the dialog would say. */
  async drive(files: File[], o: Record<string, unknown>): Promise<void> {
    this.files = files;
    this.mode = STACK_MODES.find((m) => m.id === o.mode && m.id !== 'none')?.id ?? 'median';
    this.modeRow.set(this.mode);
    this.smart = o.smart === true; this.smartRow.set(this.smart);
    this.align = o.align === true; this.alignRow.set(this.align);
    this.failed = '';
    await this.apply();
    if (this.failed) throw new Error(this.failed);
  }

  private failed = '';
  private busy = false;
  private ticket = 0;

  private async apply(): Promise<void> {
    if (this.files.length < 2) { this.failed = 'Choose at least two files.'; setText(this.note, this.failed); return; }
    if (this.busy) { this.failed = 'Files are already loading.'; return; }
    this.busy = true;
    const files = this.files, t = this.ticket;
    setText(this.note, 'Loading...');
    try {
      const imgs = [];
      for (const f of files) imgs.push(await decodeImage(f, f.name));
      if (this.ticket !== t) return;
      this.close();
      const align = this.align, made = this.engine.loadStack(imgs, align ? { smart: false, mode: 'none' } : this.statistics ? { smart: true, mode: this.mode } : { smart: this.smart, mode: 'none' });
      if (align && made) {
        this.engine.selectAllLayers();
        const { AlignBlendDialog } = await import('./align-blend-dialog');
        this.engine.notice(await AlignBlendDialog.execute(this.engine, 'align', {}));
        if (this.statistics || this.smart) {
          this.engine.selectAllLayers();
          this.engine.convertToSmartObject();
          if (this.statistics) this.engine.setStackMode(this.mode);
        }
      }
    } catch (err) { this.failed = err instanceof Error ? err.message : 'These files could not be loaded.'; setText(this.note, this.failed); }
    finally { if (this.ticket === t) this.busy = false; }
  }
}
