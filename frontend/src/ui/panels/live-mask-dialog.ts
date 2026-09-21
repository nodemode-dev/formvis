import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

export type LiveMaskChoice = 'bake' | 'unlink' | null;

/** the alert for deleting a layer that other layers are clipped to (their live mask): Bake and Delete keeps
 *  their masked look in their own pixels, Remove Links and Delete reveals their pixels; either can be undone. */
export class LiveMaskDialog extends Dialog {
  private resolve: ((choice: LiveMaskChoice) => void) | null = null;
  private readonly text = el('<p class="cv-note"></p>');

  constructor() {
    super('This layer supplies a live mask', 440);
    this.body.append(this.text);
    this.button('Remove Links and Delete', 'ghost', () => this.finish('unlink'));
    this.button('Cancel', 'ghost', () => this.finish(null));
    this.button('Bake and Delete', 'primary', () => this.finish('bake'));
  }

  /** Asks for the choice; `many` when more than one layer is being deleted. Resolves null on Cancel or Escape. */
  choose(many: boolean): Promise<LiveMaskChoice> {
    this.setTitle(many ? 'These layers supply live masks' : 'This layer supplies a live mask');
    setText(this.text, "Bake keeps the current masked appearance in the dependent layers' pixels. Remove Links reveals their pixels. You can undo either choice.");
    this.open();
    return new Promise((r) => { this.resolve = r; });
  }

  close(): void {
    const r = this.resolve;
    this.resolve = null;
    super.close();
    r?.(null);
  }

  private finish(choice: LiveMaskChoice): void {
    const r = this.resolve;
    this.resolve = null;
    super.close();
    r?.(choice);
  }
}
