import type { Engine, TextWarp, WarpStyle } from '../../engine';
import { WARP_STYLES } from '../../engine/text';
import { Dialog } from '../dialogs';
import { selectRow, sliderRow } from './controls';

/** Type > Warp Text: a Style (None removes the warp), Horizontal or Vertical, and Bend, Horizontal
 *  and Vertical Distortion. OK re-renders the type layer with the warp as one undo step; the text stays editable. */
export class WarpTextDialog extends Dialog {
  private id: string | null = null;
  private warp: TextWarp = { style: 'arc', orientation: 'horizontal', bend: 50, horizontal: 0, vertical: 0 };
  private none = true;
  private readonly sync: () => void;

  constructor(private readonly engine: Engine) {
    super('Warp Text', 400);
    const style = selectRow('Style', [['none', 'None'], ...WARP_STYLES], (v) => { this.none = v === 'none'; if (!this.none) this.warp = { ...this.warp, style: v as WarpStyle }; });
    const orient = selectRow('Orientation', [['horizontal', 'Horizontal'], ['vertical', 'Vertical']], (v) => { this.warp = { ...this.warp, orientation: v === 'vertical' ? 'vertical' : 'horizontal' }; });
    const bend = sliderRow('Bend (%)', -100, 100, 1, (v) => { this.warp = { ...this.warp, bend: v }; });
    const hd = sliderRow('Horizontal Distortion (%)', -100, 100, 1, (v) => { this.warp = { ...this.warp, horizontal: v }; });
    const vd = sliderRow('Vertical Distortion (%)', -100, 100, 1, (v) => { this.warp = { ...this.warp, vertical: v }; });
    this.body.append(style.el, orient.el, bend.el, hd.el, vd.el);
    this.sync = () => { style.set(this.none ? 'none' : this.warp.style); orient.set(this.warp.orientation); bend.set(this.warp.bend); hd.set(this.warp.horizontal); vd.set(this.warp.vertical); };
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
  }

  show(): void {
    const p = this.engine.current, l = p?.activeLayer;
    if (this.isOpen || !p || !l || !this.engine.liveText(l) || !l.text) return;
    this.id = l.id;
    this.none = !l.text.warp;
    if (l.text.warp) this.warp = { ...l.text.warp };
    this.sync();
    this.open();
  }

  private apply(): void {
    const l = this.id ? this.engine.current?.layer(this.id) : null, id = this.id;
    this.close();
    if (!l?.text || !id) return;
    void this.engine.updateTextLayer(id, { ...l.text, warp: this.none ? null : { ...this.warp } });
  }
}
