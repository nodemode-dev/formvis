import type { Engine } from '../../engine';
import type { Tool } from '../../extensions/registry';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { icon } from '../icons';
import { t as tr } from '../i18n';
import { updatePrefs, loadPrefs } from '../prefs';
import { TOOLBAR_EVENT, resolveLayout, type ToolLayout } from '../tool-groups';

/** Edit > Toolbar (36.22), Photoshop's Customize Toolbar: the rail's groups in order on the left, Extra Tools on the right.
 *  A row is dragged (pointer events) within a group, to another group, to the drop zone for a new group at the end, or across
 *  to Extra Tools to hide it. The rows are the model: the layout is read back from them on Done, and a drag moves the
 *  existing row node in place. */
class ToolbarDialog extends Dialog {
  private readonly groups = el('<div class="cv-tb-groups"></div>');
  private readonly extra = el('<div class="cv-tb-extra"></div>');
  private readonly fresh = el('<div class="cv-tb-new"></div>');

  constructor(private readonly engine: Engine) {
    super('Toolbar', 640);
    setText(this.fresh, tr('Drop here for a new group'));
    const headLeft = el('<div class="cv-tb-head"></div>'), headRight = el('<div class="cv-tb-head"></div>');
    setText(headLeft, tr('Toolbar'));
    setText(headRight, tr('Extra Tools'));
    const left = el('<div class="cv-tb-col"></div>'), right = el('<div class="cv-tb-col"></div>');
    left.append(headLeft, this.groups, this.fresh);
    right.append(headRight, this.extra);
    const cols = el('<div class="cv-tb-cols"></div>');
    cols.append(left, right);
    const note = el('<p class="cv-note"></p>');
    setText(note, tr('Drag tools to reorder them, to start a new group, or to Extra Tools to hide them. Tools in Extra Tools stay in the ••• list.'));
    this.body.append(note, cols);
    this.button('Restore Defaults', 'ghost', () => this.fill(resolveLayout(null)));
    this.button('Clear Tools', 'ghost', () => this.fill({ groups: [], hidden: resolveLayout(null).groups.flatMap((g) => g.tools) }));
    this.button('Cancel', '', () => this.close());
    this.button('Done', 'primary', () => this.commit());
  }

  show(): void {
    this.fill(resolveLayout(loadPrefs().toolbar));
    this.open();
  }

  /** Lays the rows out for a layout; used when the dialog opens and by Restore Defaults and Clear Tools. */
  private fill(layout: ToolLayout): void {
    this.groups.textContent = '';
    for (const g of layout.groups) {
      const box = this.newGroup();
      for (const t of g.tools) box.appendChild(this.row(t));
    }
    this.extra.textContent = '';
    for (const t of layout.hidden) this.extra.appendChild(this.row(t));
  }

  private newGroup(): HTMLElement {
    const g = el('<div class="cv-tb-group"></div>');
    this.groups.appendChild(g);
    return g;
  }

  private row(t: Tool): HTMLElement {
    const r = el('<div class="cv-tb-row"></div>'), ico = el('<span class="cv-tb-ico"></span>'), name = el('<span class="cv-tb-name"></span>');
    r.dataset.id = t.id;
    ico.innerHTML = icon(t.icon(this.engine), 18);
    setText(name, tr(t.label));
    r.append(ico, name);
    r.addEventListener('pointerdown', (e) => this.drag(e, r));
    return r;
  }

  private drag(e: PointerEvent, row: HTMLElement): void {
    if (e.button !== 0) return;
    e.preventDefault();
    // The listeners sit on the document, not the row: moving the row in the tree releases a pointer captured on it, and
    // the rest of the drag would be lost.
    row.classList.add('is-dragging');
    const move = (ev: PointerEvent): void => {
      const over = document.elementFromPoint(ev.clientX, ev.clientY);
      const target = over?.closest<HTMLElement>('.cv-tb-row, .cv-tb-group, .cv-tb-new, .cv-tb-extra');
      if (!target || target === row) return;
      if (target.classList.contains('cv-tb-row')) {
        const r = target.getBoundingClientRect();
        target.parentElement?.insertBefore(row, ev.clientY > r.top + r.height / 2 ? target.nextSibling : target);
      } else if (target === this.fresh) {
        this.newGroup().appendChild(row);
      } else {
        target.appendChild(row);
      }
    };
    const end = (): void => {
      row.classList.remove('is-dragging');
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      for (const g of Array.from(this.groups.children)) if (!g.querySelector('.cv-tb-row')) g.remove();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  }

  private ids(box: Element): string[] {
    return Array.from(box.querySelectorAll<HTMLElement>('.cv-tb-row')).map((r) => r.dataset.id ?? '').filter((id) => id !== '');
  }

  /** Keeps the layout (null when it is the built-in one) and tells the rail to re-apply it in place. */
  private commit(): void {
    const groups = Array.from(this.groups.children).map((g) => this.ids(g)).filter((g) => g.length > 0);
    const hidden = this.ids(this.extra);
    const base = resolveLayout(null);
    const same = hidden.length === 0 && JSON.stringify(groups) === JSON.stringify(base.groups.map((g) => g.tools.map((t) => t.id)));
    updatePrefs({ toolbar: same ? null : { groups, hidden } });
    document.dispatchEvent(new CustomEvent(TOOLBAR_EVENT));
    this.close();
  }
}

let dialog: ToolbarDialog | null = null;

/** Opens Edit > Toolbar; one dialog is kept and refilled each time. */
export function openToolbarDialog(engine: Engine): void {
  dialog ??= new ToolbarDialog(engine);
  dialog.show();
}
