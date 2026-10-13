import { STROKE_TOOLS, type Engine, type StrokeTool } from '../../engine';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { checkRow, selectRow, sliderRow } from './controls';

/** Paths > Stroke Path, as Photoshop's dialog has it: the Tool to stroke with, at that tool's current settings, and
 *  Simulate Pressure, which tapers the stroke thin, thick, thin. Both are kept for next time. */
export class StrokePathDialog extends Dialog {
  private tool: StrokeTool = 'brush';
  private pressure = false;
  private readonly toolRow = selectRow('Tool', STROKE_TOOLS, (v) => { this.tool = v as StrokeTool; });
  private readonly pressureRow = checkRow('Simulate Pressure', (v) => { this.pressure = v; });
  /* Width and colour for this stroke (1.49.3, the owner's walkthrough: no way to set a path's stroke); the brush's own
     size and the foreground colour are what they start at, and are left as they were. */
  private width = 10;
  private readonly widthRow = sliderRow('Width (px)', 1, 500, 1, (v) => { this.width = v; });
  private readonly color = el<HTMLInputElement>('<input class="cv-input" type="color" aria-label="Stroke colour">');

  constructor(private readonly engine: Engine) {
    super('Stroke Path', 340);
    const colorRow = el('<label class="cv-field"><span>Colour</span></label>'), fg = el<HTMLButtonElement>('<button class="cv-btn" type="button">Foreground</button>');
    fg.addEventListener('click', () => { this.color.value = hexOf(this.engine.fg); });
    colorRow.append(this.color, fg);
    this.body.append(this.toolRow.el, this.widthRow.el, colorRow, this.pressureRow.el, el('<p class="cv-note">The stroke uses the tool\'s hardness and opacity at this width and colour; Clone Stamp and the retouch tools paint what they sample. Your brush size and foreground colour are left as they were.</p>'));
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.remember([this.color, ...Array.from(this.widthRow.el.querySelectorAll('input'))]);   // the width and colour start at the brush's size and the foreground
  }

  show(): void {
    if (this.isOpen) return;
    if (!this.engine.workPath) { this.engine.notice('Draw a path with the Pen tool first.'); return; }
    this.toolRow.set(this.tool);
    this.width = Math.max(1, Math.round(this.engine.brush.diameter));
    this.widthRow.set(this.width);
    this.color.value = hexOf(this.engine.fg);
    this.pressureRow.set(this.pressure);
    this.open();
  }

  private apply(): void {
    this.close();
    const e = this.engine, size = e.brush.diameter, fg = e.fg, c = this.color.value;
    e.setBrush({ diameter: this.width });
    e.fg = { r: parseInt(c.slice(1, 3), 16), g: parseInt(c.slice(3, 5), 16), b: parseInt(c.slice(5, 7), 16) };
    try { e.strokePathWith(this.tool, this.pressure); } finally { e.setBrush({ diameter: size }); e.fg = fg; e.emit('options', null); }
  }
}

const hexOf = (c: { r: number; g: number; b: number }): string => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
