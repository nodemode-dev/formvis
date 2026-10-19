import type { Engine } from '../../engine';
import type { CompPart } from '../../engine/layer-comps';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { checkRow, selectRow } from './controls';

/** New Layer Comp and Layer Comp Options (DEV_PLAN 33.3): name, comment and the three switches of what a comp keeps;
 *  Options can also re-record one part (or all) from the layers as they are now. Rows are built once and patched on show. */
export class LayerCompDialog extends Dialog {
  private id: string | null = null;
  private vis = true;
  private pos = true;
  private app = true;
  private again = 'none';
  private readonly name = el('<input class="cv-input" type="text" maxlength="80" aria-label="Name">') as HTMLInputElement;
  private readonly comment = el('<textarea class="cv-input" rows="3" maxlength="400" aria-label="Comment"></textarea>') as HTMLTextAreaElement;
  private readonly rows: { vis: ReturnType<typeof checkRow>; pos: ReturnType<typeof checkRow>; app: ReturnType<typeof checkRow>; again: ReturnType<typeof selectRow> };

  constructor(private readonly engine: Engine) {
    super('New Layer Comp', 400);
    const nameRow = el('<label class="cv-field"><span>Name</span></label>');
    nameRow.append(this.name);
    const commentRow = el('<label class="cv-field"><span>Comment</span></label>');
    commentRow.append(this.comment);
    this.rows = {
      vis: checkRow('Visibility', (v) => { this.vis = v; }),
      pos: checkRow('Position', (v) => { this.pos = v; }),
      app: checkRow('Appearance (Layer Style)', (v) => { this.app = v; }),
      again: selectRow('Re-record now', [['none', 'Nothing'], ['visibility', 'Visibility only'], ['position', 'Position only'], ['appearance', 'Appearance only'], ['all', 'All three']], (v) => { this.again = v; }),
    };
    this.body.append(nameRow, commentRow, this.rows.vis.el, this.rows.pos.el, this.rows.app.el, this.rows.again.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
  }

  /** Open for a new comp (no id) or for the options of the comp `id`. */
  show(id: string | null = null): void {
    this.id = id;
    const c = id ? this.engine.current?.doc.comps?.find((x) => x.id === id) : null;
    if (id && !c) return;
    this.setTitle(c ? 'Layer Comp Options' : 'New Layer Comp');
    this.name.value = c?.name ?? '';
    this.comment.value = c?.comment ?? '';
    this.vis = c?.useVisibility ?? true; this.pos = c?.usePosition ?? true; this.app = c?.useAppearance ?? true; this.again = 'none';
    this.rows.vis.set(this.vis); this.rows.pos.set(this.pos); this.rows.app.set(this.app); this.rows.again.set('none');
    this.rows.again.el.hidden = !c;
    this.open();
    this.name.focus();
  }

  private apply(): void {
    const opts = { name: this.name.value, comment: this.comment.value, useVisibility: this.vis, usePosition: this.pos, useAppearance: this.app };
    this.close();
    if (!this.id) { this.engine.newLayerComp(opts); return; }
    this.engine.editLayerComp(this.id, opts);
    const parts: CompPart[] = this.again === 'all' ? ['visibility', 'position', 'appearance'] : this.again === 'none' ? [] : [this.again as CompPart];
    if (parts.length) this.engine.updateLayerComp(this.id, parts);
  }
}
