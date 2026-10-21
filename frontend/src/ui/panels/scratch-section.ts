import { api } from '../../io/api';
import { el, setText, setValue } from '../dom';
import { loadPrefs } from '../prefs';

const gb = (bytes: number): string => `${(bytes / 1073741824).toFixed(1)} GB`;

/** Preferences > Performance > Scratch Disks: the folder the engine keeps older undo and giant layers' tiles in. The choice is
 *  kept in the preferences and sent to the engine whenever it starts (applyPrefs); the line shows the folder in use and its free space. */
export class ScratchSection {
  readonly el = el('<div class="cv-panel-section cv-scratch"><span class="cv-refs-title">Scratch Disks</span></div>');
  private readonly path = el<HTMLInputElement>('<input class="cv-input" type="text" aria-label="Scratch folder path" placeholder="Full folder path, or empty for the data folder" spellcheck="false" maxlength="500">');
  private readonly note = el('<p class="cv-note" role="status" style="min-height: 2.8em"></p>');

  constructor(private readonly choose: (folder: string) => void) {
    const use = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Use this folder</button>'), reset = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Use the data folder</button>');
    const buttons = el('<div class="cv-improve"></div>');
    buttons.append(use, reset);
    const row = el('<label class="cv-field"><span>Folder</span></label>');
    row.append(this.path);
    this.el.append(row, buttons, this.note);
    use.addEventListener('click', () => void this.save(this.path.value.trim()));
    reset.addEventListener('click', () => void this.save(''));
    this.path.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    window.addEventListener('formvis:scratch', () => void this.refresh());
  }

  async refresh(): Promise<void> {
    const s = await api.scratch();
    if (document.activeElement !== this.path) setValue(this.path, loadPrefs().scratchFolder);
    setText(this.note, s ? `In use: ${s.folder}, ${gb(s.free)} free. Older undo steps and giant layers' tiles are kept here; tiles already kept stay where they are.` : 'The formvis engine is offline: the scratch folder is sent to it when it starts.');
  }

  private async save(folder: string): Promise<void> {
    try {
      const s = await api.setScratch(folder);
      this.choose(folder);
      this.path.value = folder;
      setText(this.note, `In use: ${s.folder}, ${gb(s.free)} free.`);
    } catch (err) { setText(this.note, err instanceof Error ? err.message : 'Could not use that folder.'); }
  }
}
