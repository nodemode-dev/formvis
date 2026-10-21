import type { Engine, RGB, TextKerning, TextSpec } from '../../engine';
import { fontFamilies } from '../fonts';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { checkRow } from './controls';

const hex = (c: RGB): string => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const fromHex = (h: string): RGB => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });

/** The Type dialog: the text and how it is set, for a new type layer at a point or for an existing one. New text
 *  starts from the last settings used. */
export class TextDialog extends Dialog {
  private target: { layerId: string } | { x: number; y: number } | null = null;
  private readonly content = el<HTMLTextAreaElement>('<textarea class="cv-input" rows="4" spellcheck="true" placeholder="Type your text"></textarea>');
  // This machine's fonts, as the options bar offers them; built as options, not HTML, since names come from the system.
  private readonly family = ((): HTMLSelectElement => {
    const s = el<HTMLSelectElement>('<select class="cv-input"></select>');
    for (const f of fontFamilies()) s.append(new Option(f, f));
    return s;
  })();
  private readonly size = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="2000" step="1">');
  private readonly lineHeight = el<HTMLInputElement>('<input class="cv-input" type="number" min="0.5" max="4" step="0.05">');
  /** Carried through from the text (the options bar sets them), so editing here keeps them. */
  private tracking = 0;
  private kerning: TextKerning = 'metrics';
  private readonly align = el<HTMLSelectElement>('<select class="cv-input"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select>');
  private readonly colour = el<HTMLInputElement>('<input class="cv-input" type="color">');
  private readonly note = el('<p class="cv-note"></p>');
  private bold = false;
  private italic = false;
  private readonly boldRow = checkRow('Bold', (v) => { this.bold = v; });
  private readonly italicRow = checkRow('Italic', (v) => { this.italic = v; });

  constructor(private readonly engine: Engine) {
    super('Type', 440);
    this.body.appendChild(this.content);
    this.field('Font', this.family);
    this.field('Size (px)', this.size);
    this.field('Line height', this.lineHeight);
    this.field('Align', this.align);
    this.body.append(this.boldRow.el, this.italicRow.el);
    this.field('Colour', this.colour);
    this.body.appendChild(this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => void this.apply());
    this.content.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void this.apply(); }
    });
  }

  /** New text whose first baseline starts at (x, y), in document pixels. */
  showCreate(x: number, y: number): void {
    this.target = { x, y };
    this.fill({ ...this.engine.textSettings, content: '', color: this.engine.fg });
    this.setTitle('New Type');
    setText(this.note, 'Enter starts a new line; Ctrl or Cmd with Enter applies.');
    this.open();
    this.content.focus();
  }

  /** Edits the text of type layer `layerId`. */
  showEdit(layerId: string): void {
    const l = this.engine.current?.layer(layerId);
    if (!l?.text || !this.engine.liveText(l)) { this.engine.notice('That layer is no longer editable type.'); return; }
    this.target = { layerId };
    this.fill(l.text);
    this.setTitle('Edit Type');
    setText(this.note, 'Enter starts a new line; Ctrl or Cmd with Enter applies.');
    this.open();
    this.content.focus();
  }

  private fill(t: TextSpec): void {
    this.content.value = t.content;
    // A font outside the list (a system font, or one from a PSD file) is added, not replaced with Inter.
    if (![...this.family.options].some((o) => o.value === t.family)) this.family.append(new Option(t.family, t.family));
    this.family.value = t.family;
    this.tracking = t.tracking;
    this.kerning = t.kerning;
    this.size.value = String(t.size);
    this.lineHeight.value = String(t.lineHeight);
    this.align.value = t.align;
    this.colour.value = hex(t.color);
    this.bold = t.bold;
    this.italic = t.italic;
    this.boldRow.set(t.bold);
    this.italicRow.set(t.italic);
  }

  private spec(): TextSpec {
    const size = Number(this.size.value), lineHeight = Number(this.lineHeight.value);
    return {
      content: this.content.value.replace(/\r\n?/g, '\n'), family: this.family.value,
      size: Number.isFinite(size) ? Math.min(2000, Math.max(1, size)) : 48,
      lineHeight: Number.isFinite(lineHeight) ? Math.min(4, Math.max(0.5, lineHeight)) : 1.2,
      align: this.align.value === 'center' || this.align.value === 'right' ? this.align.value : 'left',
      bold: this.bold, italic: this.italic, color: fromHex(this.colour.value), tracking: this.tracking, kerning: this.kerning,
    };
  }

  private async apply(): Promise<void> {
    const spec = this.spec(), target = this.target;
    if (!spec.content.trim()) { setText(this.note, 'Type some text first.'); this.content.focus(); return; }
    this.close();
    if (!target) return;
    if ('layerId' in target) await this.engine.updateTextLayer(target.layerId, spec);
    else await this.engine.createTextLayer({ x: target.x, y: target.y }, spec);
  }
}
