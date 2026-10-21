import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { colorRow } from './controls';

/** A note's text (the Note tool, 1.49.6): Save keeps it; Delete removes the note; a new note closed still empty (Cancel,
 *  Escape) is removed, so no blank notes are left behind. */
export class NoteDialog extends Dialog {
  private readonly text = el<HTMLTextAreaElement>('<textarea class="cv-input cv-note-text" rows="7" aria-label="Note" placeholder="Write the note"></textarea>');
  private readonly author = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="80" aria-label="Author" placeholder="Author">');
  private color = '#f5c542';
  private readonly colorField = colorRow('Color', (hex) => { this.color = hex; });
  private id: string | null = null;
  private fresh = false;
  private saved = false;

  constructor(private readonly engine: Engine) {
    super('Note', 380);
    this.body.append(this.text, this.author, this.colorField.el);
    this.button('Delete', 'ghost', () => { const id = this.id; this.saved = true; this.close(); if (id) this.engine.removeNote(id); });
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Save', 'primary', () => this.save());
  }

  show(): void {
    const n = this.engine.current?.doc.notes?.find((x) => x.id === this.engine.activeNote);
    if (!n) return;
    this.id = n.id; this.fresh = n.text === ''; this.saved = false;
    this.text.value = n.text;
    this.author.value = n.author ?? '';
    this.color = n.color ?? '#f5c542';
    this.colorField.set(this.color);
    this.open();
    requestAnimationFrame(() => this.text.focus());
  }

  private save(): void {
    const id = this.id;
    this.saved = true;
    this.close();
    if (id) this.engine.setNote(id, { text: this.text.value.slice(0, 10000), author: this.author.value.trim(), color: this.color });
  }

  close(): void {
    const id = this.id;
    super.close();
    if (!this.saved && this.fresh && id) this.engine.removeNote(id);   // a new note left empty goes
    this.id = null;
    this.engine.emit('overlay', null);
  }
}
