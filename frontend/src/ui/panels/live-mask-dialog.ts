import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

export type LiveMaskChoice = 'bake' | 'unlink' | null;

/** The alert shown before deleting a layer that other layers are clipped to. Bake and Delete keeps the dependent
 *  layers' masked look by writing it into their own pixels; Remove Links and Delete lets their full pixels show.
 *  Either can be undone. */
export class LiveMaskDialog extends Dialog {
  private resolve: ((choice: LiveMaskChoice) => void) | null = null;
  private readonly text = el<HTMLElement>('<p class="cv-note"></p>');

  constructor() {
    super('This layer supplies a live mask', 440);
    this.body.append(this.text);
    this.button('Remove Links and Delete', 'ghost', () => this.finish('unlink'));
    this.button('Cancel', 'ghost', () => this.finish(null));
    this.button('Bake and Delete', 'primary', () => this.finish('bake'));
  }

  /** Ask the person what to do; resolves with their choice, or null when they back out. */
  choose(many: boolean): Promise<LiveMaskChoice> {
    this.setTitle(many ? 'These layers supply live masks' : 'This layer supplies a live mask');
    setText(this.text, "Bake keeps the current masked appearance in the dependent layers' pixels. Remove Links reveals their pixels. You can undo either choice.");
    this.open();
    return new Promise<LiveMaskChoice>((resolve) => { this.resolve = resolve; });
  }

  close(): void {
    const resolve = this.resolve;
    this.resolve = null;
    super.close();
    if (resolve) resolve(null);
  }

  private finish(choice: LiveMaskChoice): void {
    const resolve = this.resolve;
    this.resolve = null;
    super.close();
    if (resolve) resolve(choice);
  }
}
