import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { checkRow, selectRow } from './controls';

export type PackageFormat = 'fvd' | 'psd' | 'psb';
export interface PackageChoice { format: PackageFormat; links: boolean }

/** File > Package: the file the zip holds (the formvis project, a PSD or a PSB) and whether linked files are copied
 *  into Links/. Where the zip goes is asked by the save panel in the desktop app, else the browser downloads it. */
export class PackageDialog extends Dialog {
  private choice: PackageChoice = { format: 'fvd', links: true };
  private readonly format = selectRow('Document', [['fvd', 'formvis project (.fvd)'], ['psd', 'PSD'], ['psb', 'PSB']], (v) => { this.choice.format = v === 'psd' ? 'psd' : v === 'psb' ? 'psb' : 'fvd'; this.sync(); });
  private readonly links = checkRow('Copy linked files into Links', (v) => { this.choice.links = v; });
  private readonly note = el('<p class="cv-note"></p>');
  private pending: ((c: PackageChoice | null) => void) | null = null;

  constructor() {
    super('Package', 420);
    this.body.append(this.format.el, this.links.el, this.note);
    this.button('Cancel', 'ghost', () => this.finish(null));
    this.button('Package', 'primary', () => this.finish({ ...this.choice }));
    this.onClose = () => this.finish(null);
  }

  private sync(): void {
    setText(this.note, this.choice.format === 'fvd' ? 'The project is relinked to the copies in Links, so it opens from the unpacked folder.' : 'A PSD or PSB holds layers but not linked smart objects; the linked files are copied beside it for reference.');
  }

  private finish(c: PackageChoice | null): void {
    const done = this.pending;
    this.pending = null;
    this.close();
    done?.(c);
  }

  /** The choice made, or null when cancelled. */
  ask(): Promise<PackageChoice | null> {
    if (this.pending) this.finish(null);
    this.format.set(this.choice.format);
    this.links.set(this.choice.links);
    this.sync();
    return new Promise((resolve) => { this.pending = resolve; this.open(); });
  }
}
