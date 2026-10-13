import { COPYRIGHT_STATUSES, META_TEXT, type CameraData, type CopyrightStatus, type Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el, q, setText, setValue } from '../dom';
import { selectRow } from './controls';

/** File > File Info (DEV_PLAN 29.2), Photoshop's metadata dialog: the document's title, author, description, rating,
 *  keywords and copyright, the camera's record of a photo, read only, and the created and modified dates. OK sets what
 *  changed as one History step called File Info. Every row exists from the first frame, so the dialog keeps one size
 *  whatever the document holds; the values are filled in before it opens. */

const input = (label: string, max: number): HTMLElement => {
  const row = el(`<label class="cv-field"><span></span><input class="cv-input" type="text" maxlength="${max}" spellcheck="false" aria-label="${label}"></label>`);
  setText(q(row, 'span'), label);
  return row;
};
const readout = (label: string): HTMLElement => {
  const row = el('<div class="cv-field"><span></span><span class="cv-meta-value"></span></div>');
  setText(q(row, 'span'), label);
  return row;
};

const formatDate = (iso: string | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};
const cameraText = (c: CameraData | undefined): Record<keyof CameraData, string> => ({
  make: c?.make ?? '', model: c?.model ?? '', lens: c?.lens ?? '', exposure: c?.exposure ? `${c.exposure} s` : '', aperture: c?.aperture ? `f/${c.aperture}` : '',
  iso: c?.iso ?? '', focalLength: c?.focalLength ? `${c.focalLength} mm` : '', dateTaken: formatDate(c?.dateTaken),
});

const CAMERA_ROWS: ReadonlyArray<readonly [keyof CameraData, string]> = [['make', 'Make'], ['model', 'Model'], ['lens', 'Lens'], ['exposure', 'Exposure'], ['aperture', 'Aperture'], ['iso', 'ISO'], ['focalLength', 'Focal Length'], ['dateTaken', 'Date Taken']];

type FieldKey = 'title' | 'author' | 'authorTitle' | 'descriptionWriter' | 'keywords' | 'notice' | 'url';

export class FileInfoDialog extends Dialog {
  private readonly fields: Record<FieldKey, HTMLElement> = {
    title: input('Document Title', META_TEXT.title), author: input('Author', META_TEXT.author), authorTitle: input('Author Title', META_TEXT.authorTitle),
    descriptionWriter: input('Description Writer', META_TEXT.descriptionWriter), keywords: input('Keywords', 2000), notice: input('Copyright Notice', META_TEXT.notice), url: input('Copyright Info URL', META_TEXT.url),
  };
  private readonly description = el<HTMLElement>(`<label class="cv-field cv-meta-top"><span>Description</span><textarea class="cv-input cv-meta-desc" maxlength="${META_TEXT.description}" aria-label="Description"></textarea></label>`);
  private readonly rating = selectRow('Rating', [['0', 'None'], ['1', '1 Star'], ['2', '2 Stars'], ['3', '3 Stars'], ['4', '4 Stars'], ['5', '5 Stars']], () => undefined);
  private readonly status = selectRow('Copyright Status', COPYRIGHT_STATUSES.map(([v, t]) => [v, t] as const), () => undefined);
  private readonly camera = new Map<keyof CameraData, HTMLElement>();
  private readonly cameraNote = el('<span class="cv-note"></span>');
  private readonly created = readout('Created');
  private readonly modified = readout('Modified');

  constructor(private readonly engine: Engine) {
    super('File Info', 580);
    for (const node of Object.values(this.fields)) q<HTMLInputElement>(node, 'input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.apply(); } });
    const head = (text: string): HTMLElement => el(`<div class="cv-note-head">${text}</div>`);
    const cameraHead = el('<div class="cv-note-head cv-meta-head"><span>Camera Data</span></div>');
    cameraHead.appendChild(this.cameraNote);
    const pairs = el('<div class="cv-meta-pairs"></div>');
    for (const [key, label] of CAMERA_ROWS) {
      const row = readout(label);
      this.camera.set(key, q(row, '.cv-meta-value'));
      pairs.appendChild(row);
    }
    const dates = el('<div class="cv-meta-pairs"></div>');
    dates.append(this.created, this.modified);
    this.body.append(
      this.fields.title, this.fields.author, this.fields.authorTitle, this.description, this.rating.el, this.fields.descriptionWriter, this.fields.keywords,
      head('Copyright'), this.status.el, this.fields.notice, this.fields.url, cameraHead, pairs, dates);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
  }

  show(): void {
    const p = this.engine.current;
    if (this.isOpen || !p) return;
    const m = p.doc.meta;
    const set = (key: FieldKey, v: string): void => setValue(q<HTMLInputElement>(this.fields[key], 'input'), v);
    set('title', m?.title ?? ''); set('author', m?.author ?? ''); set('authorTitle', m?.authorTitle ?? ''); set('descriptionWriter', m?.descriptionWriter ?? '');
    set('keywords', (m?.keywords ?? []).join(', ')); set('notice', m?.notice ?? ''); set('url', m?.url ?? '');
    q<HTMLTextAreaElement>(this.description, 'textarea').value = m?.description ?? '';
    this.rating.set(String(m?.rating ?? 0));
    this.status.set(m?.copyright ?? 'unknown');
    const text = cameraText(m?.camera);
    for (const [key, node] of this.camera) setText(node, text[key]);
    setText(this.cameraNote, m?.camera ? '' : 'This document has no camera data.');
    setText(q(this.created, '.cv-meta-value'), formatDate(m?.created) || 'Not recorded yet');
    setText(q(this.modified, '.cv-meta-value'), formatDate(m?.modified ?? m?.created) || 'Not recorded yet');
    this.setTitle(`File Info: ${p.name}`);
    this.open(q<HTMLInputElement>(this.fields.title, 'input'));
  }

  private apply(): void {
    const value = (key: FieldKey): string => q<HTMLInputElement>(this.fields[key], 'input').value;
    const select = (row: HTMLElement): string => q<HTMLSelectElement>(row, 'select').value;
    const patch = {
      title: value('title'), author: value('author'), authorTitle: value('authorTitle'), descriptionWriter: value('descriptionWriter'), notice: value('notice'), url: value('url'),
      description: q<HTMLTextAreaElement>(this.description, 'textarea').value, keywords: value('keywords'), rating: Number(select(this.rating.el)), copyright: select(this.status.el) as CopyrightStatus,
    };
    this.close();
    this.engine.setMeta(patch);
  }
}
