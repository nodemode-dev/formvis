import type { Engine } from '../engine';
import { BOX_KINDS, boxWarnings, boxesText, cropFor } from '../engine/boxes';
import type { BoxKind, DocBox } from '../engine/types';
import { boxEditHost } from '../extensions/tools/boxes';
import { el, patchList, q, setHidden, setText, setTitle, setValue } from './dom';
import { icon } from './icons';
import { t } from './i18n';

/** The Boxes section of the Generate panel: the document's layout boxes as rows (kind, words, rectangle), the buttons that
 *  make and clear them, the warnings and the crop a box would be shown. Built once; rows are patched in place. It also
 *  owns the one description editor that floats over the canvas for the Boxes tool. */
export class BoxesSection {
  readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly warn: HTMLElement;
  private readonly crop: HTMLElement;
  private readonly fromSel: HTMLButtonElement;
  private readonly clear: HTMLButtonElement;
  private readonly copy: HTMLButtonElement;
  private readonly add: HTMLButtonElement;
  private readonly editor: HTMLInputElement;
  private editing: string | null = null;
  private frame = 0;

  constructor(host: HTMLElement, private readonly engine: Engine, private readonly say: (text: string) => void) {
    this.root = el(`<div class="cv-boxes">
      <div class="cv-boxes-bar">
        <button class="cv-btn cv-boxes-add" type="button">${icon('tBoxes', 14)}<span data-t="Boxes tool"></span></button>
        <button class="cv-btn cv-boxes-sel" type="button"><span data-t="From selection"></span></button>
        <button class="cv-btn cv-boxes-copy" type="button"><span data-t="Copy rows"></span></button>
        <button class="cv-btn cv-boxes-clear" type="button"><span data-t="Clear boxes"></span></button>
      </div>
      <div class="cv-boxes-list" role="listbox" data-t-aria="Boxes"></div>
      <p class="cv-note cv-boxes-crop" role="status"></p>
      <p class="cv-note cv-boxes-warn" role="status"></p>
    </div>`);
    host.appendChild(this.root);
    const r = this.root;
    this.list = q(r, '.cv-boxes-list');
    this.warn = q(r, '.cv-boxes-warn');
    this.crop = q(r, '.cv-boxes-crop');
    this.add = q<HTMLButtonElement>(r, '.cv-boxes-add');
    this.fromSel = q<HTMLButtonElement>(r, '.cv-boxes-sel');
    this.copy = q<HTMLButtonElement>(r, '.cv-boxes-copy');
    this.clear = q<HTMLButtonElement>(r, '.cv-boxes-clear');
    for (const n of r.querySelectorAll<HTMLElement>('[data-t]')) setText(n, t(n.dataset.t as string));
    q(r, '.cv-boxes-list').setAttribute('aria-label', t('Boxes'));

    this.editor = el<HTMLInputElement>('<input class="cv-input cv-box-editor" type="text" hidden spellcheck="true" autocomplete="off">');
    this.editor.setAttribute('aria-label', t('Box description'));
    document.body.appendChild(this.editor);
    this.editor.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.closeEditor(true); } else if (e.key === 'Escape') { e.preventDefault(); this.closeEditor(false); }
      e.stopPropagation();
    });
    this.editor.addEventListener('blur', () => this.closeEditor(true));
    boxEditHost.open = (id, at) => {
      const b = this.engine.current?.doc.boxes?.find((x) => x.id === id);
      if (!b) return;
      this.editing = id;
      this.editor.style.left = `${Math.round(at.left)}px`;
      this.editor.style.top = `${Math.round(at.top)}px`;
      this.editor.style.width = `${Math.round(at.width)}px`;
      this.editor.value = b.text;
      setHidden(this.editor, false);
      this.editor.focus();
      this.editor.select();
    };

    this.add.addEventListener('click', () => { this.engine.setTool('boxes'); this.say(t('Boxes tool: drag on the picture to draw a box.')); });
    this.fromSel.addEventListener('click', () => { if (!this.engine.boxFromSelection()) this.say(t('Make a selection first.')); });
    this.clear.addEventListener('click', () => this.engine.clearBoxes());
    this.copy.addEventListener('click', () => this.copyRows());
    this.list.addEventListener('click', (e) => {
      const target = e.target instanceof Element ? e.target : null, row = target?.closest<HTMLElement>('.cv-box-row');
      if (!row) return;
      const id = row.dataset.key as string, act = target?.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'dup') this.engine.duplicateBox(id);
      else if (act === 'del') this.engine.removeBox(id);
      else this.engine.selectBox(id);
    });
    this.list.addEventListener('change', (e) => {
      const n = e.target instanceof HTMLElement ? e.target : null, row = n?.closest<HTMLElement>('.cv-box-row');
      if (!n || !row) return;
      const id = row.dataset.key as string;
      if (n.classList.contains('cv-box-kind')) this.engine.setBox(id, { kind: (n as HTMLSelectElement).value as BoxKind }, 'Box Kind');
      else if (n.classList.contains('cv-box-text')) this.engine.setBox(id, { text: (n as HTMLInputElement).value }, 'Describe Box');
    });
    this.list.addEventListener('focusin', (e) => { const id = (e.target as Element).closest<HTMLElement>('.cv-box-row')?.dataset.key; if (id) this.engine.selectBox(id); });

    for (const ev of ['projects', 'doc', 'active', 'history', 'overlay', 'selection'] as const) this.engine.on(ev, () => this.queue());
    this.sync();
  }

  /** The boxes as rows of plain text, to paste into another tool. */
  private copyRows(): void {
    const p = this.engine.current, text = boxesText(p?.doc.boxes, p ? { width: p.doc.width, height: p.doc.height } : undefined);
    if (!text) { this.say(t('There are no boxes to copy.')); return; }
    const done = (): void => this.say(t('Copied the box rows.'));
    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(text).then(done, () => this.say(t('The clipboard is not available.')));
    else this.say(t('The clipboard is not available.'));
  }

  private closeEditor(commit: boolean): void {
    const id = this.editing;
    if (!id) return;
    this.editing = null;
    if (commit) this.engine.setBox(id, { text: this.editor.value }, 'Describe Box');
    setHidden(this.editor, true);
  }

  private queue(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.sync(); });
  }

  private fillRow(row: HTMLElement, b: DocBox): void {
    row.dataset.kind = b.kind;
    row.classList.toggle('is-active', b.id === this.engine.activeBox);
    row.setAttribute('aria-selected', String(b.id === this.engine.activeBox));
    setText(q(row, '.cv-box-label'), b.name);
    setText(q(row, '.cv-box-rect'), `${b.x}, ${b.y}  ${b.w} x ${b.h}`);
    setValue(q<HTMLSelectElement>(row, '.cv-box-kind'), b.kind);
    const text = q<HTMLInputElement>(row, '.cv-box-text');
    setValue(text, b.text);
    const ph = t('Describe what goes here');
    if (text.placeholder !== ph) text.placeholder = ph;
  }

  sync(): void {
    const p = this.engine.current, boxes = p?.doc.boxes ?? [];
    patchList(this.list, [...boxes], {
      key: (b) => b.id,
      create: (b) => {
        const row = el(`<div class="cv-box-row" role="option">
          <span class="cv-box-name"><span class="cv-box-swatch"></span><span class="cv-box-label"></span><span class="cv-box-rect"></span></span>
          <button class="cv-btn cv-box-icon" type="button" data-act="dup" aria-label="${t('Duplicate box')}">${icon('duplicate', 13)}</button>
          <button class="cv-btn cv-box-icon" type="button" data-act="del" aria-label="${t('Delete box')}">${icon('close', 12)}</button>
          <select class="cv-input cv-box-kind" aria-label="${t('Box kind')}">${BOX_KINDS.map((k) => `<option value="${k.id}">${t(k.label)}</option>`).join('')}</select>
          <input class="cv-input cv-box-text" type="text" spellcheck="true" autocomplete="off" aria-label="${t('Box description')}">
        </div>`);
        this.fillRow(row, b);
        return row;
      },
      update: (row, b) => this.fillRow(row, b),
    });
    const active = boxes.find((b) => b.id === this.engine.activeBox);
    if (p && active) {
      const k = cropFor(active, p.doc.width, p.doc.height);
      setText(this.crop, t(`Crop preview for ${active.name}: ${k.w} x ${k.h} at ${k.x}, ${k.y} (dashed on the picture).`));
    } else setText(this.crop, boxes.length ? t('Select a box to see the crop a model would be shown.') : t('No boxes yet: pick the Boxes tool and drag on the picture.'));
    setText(this.warn, p ? boxWarnings(boxes, p.doc.width, p.doc.height).map((w) => t(w)).join(' ') : '');
    const off = !p;
    for (const [b, why] of [[this.add, ''], [this.fromSel, !p?.selection ? t('Make a selection first.') : ''], [this.copy, boxes.length ? '' : t('There are no boxes to copy.')], [this.clear, boxes.length ? '' : t('There are no boxes to clear.')]] as const) {
      const dis = off || !!why;
      if (b.getAttribute('aria-disabled') !== String(dis)) b.setAttribute('aria-disabled', String(dis));
      setTitle(b, why);
    }
  }
}
