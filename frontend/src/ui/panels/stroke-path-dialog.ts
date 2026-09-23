import { STROKE_TOOLS, type Engine, type StrokeTool } from '../../engine';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { checkRow, selectRow } from './controls';

/** Paths > Stroke Path, as Photoshop's dialog has it: the Tool to stroke with, at that tool's current settings, and
 *  Simulate Pressure, which tapers the stroke thin, thick, thin. Both are kept for next time. */
export class StrokePathDialog extends Dialog {
  private tool: StrokeTool = 'brush';
  private pressure = false;
  private readonly toolRow = selectRow('Tool', STROKE_TOOLS, (v) => { this.tool = v as StrokeTool; });
  private readonly pressureRow = checkRow('Simulate Pressure', (v) => { this.pressure = v; });

  constructor(private readonly engine: Engine) {
    super('Stroke Path', 340);
    this.body.append(this.toolRow.el, this.pressureRow.el, el('<p class="cv-note">The stroke uses the tool\'s current size, hardness and opacity; Clone Stamp needs its source set first.</p>'));
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
  }

  show(): void {
    if (this.isOpen) return;
    if (!this.engine.workPath) { this.engine.notice('Draw a path with the Pen tool first.'); return; }
    this.toolRow.set(this.tool);
    this.pressureRow.set(this.pressure);
    this.open();
  }

  private apply(): void {
    this.close();
    this.engine.strokePathWith(this.tool, this.pressure);
  }
}
