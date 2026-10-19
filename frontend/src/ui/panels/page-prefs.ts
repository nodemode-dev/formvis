import { el, setHidden } from '../dom';
import type { Prefs } from '../prefs';
import { checkRow, selectRow, sliderRow, numberRow } from './controls';
import { ScratchSection } from './scratch-section';

type Patch = Partial<Prefs>;

/** A colour field in the preferences: the picked colour is kept as it is chosen. */
function colourRow(label: string, onInput: (hex: string) => void): { el: HTMLElement; set(v: string): void } {
  const input = el<HTMLInputElement>('<input class="cv-input cv-color" type="color">');
  const root = el('<label class="cv-field"><span></span></label>');
  root.querySelector('span')!.textContent = label;
  input.setAttribute('aria-label', label);
  root.append(input);
  input.addEventListener('input', () => onInput(input.value));
  return { el: root, set(v) { if (input.value !== v) input.value = v; } };
}

const note = (text: string): HTMLElement => { const p = el('<p class="cv-note"></p>'); p.textContent = text; return p; };

/** The rows of the preference pages Scratch Disks (in Performance), Cursors, Transparency & Gamut, Units & Rulers, Type,
 *  Enhanced Controls and Plug-ins; built once, filled by `set` when the dialog opens. `change` keeps a choice. */
export class PagePrefsRows {
  readonly scratch: ScratchSection;
  private readonly onlyCross = checkRow('Show Only Crosshair While Painting', (v) => this.change({ cursorOnlyCross: v }));
  private readonly otherCursor = selectRow('Other Cursors', [['standard', 'Standard'], ['precise', 'Precise']], (v) => this.change({ cursorOther: v === 'precise' ? 'precise' : 'standard' }));
  private readonly previewColour = colourRow('Brush Preview Color', (v) => this.change({ brushPreviewColor: v }));
  private readonly checkerA = colourRow('Custom Grid Color 1', (v) => this.change({ checkerA: v }));
  private readonly checkerB = colourRow('Custom Grid Color 2', (v) => this.change({ checkerB: v }));
  private readonly printRes = sliderRow('Print Resolution (ppi)', 1, 1200, 1, (v) => this.change({ printRes: v }));
  private readonly screenRes = sliderRow('Screen Resolution (ppi)', 1, 600, 1, (v) => this.change({ screenRes: v }));
  private readonly colWidth = numberRow('Column Width (mm)', 1, 1000, 0.1, (v) => this.change({ colWidth: v }));
  private readonly gutter = numberRow('Gutter (mm)', 0, 500, 0.1, (v) => this.change({ gutter: v }));
  private readonly smartQuotes = checkRow('Use Smart Quotes', (v) => this.change({ smartQuotes: v }));
  private readonly escCommit = checkRow('Escape Commits Text Edits', (v) => this.change({ escCommit: v }));
  private readonly placeholder = checkRow('Fill New Type Layers with Placeholder Text', (v) => this.change({ placeholderText: v }));
  private readonly pinch = checkRow('Trackpad Pinch Zoom', (v) => this.change({ pinchZoom: v }));
  private readonly rotate = checkRow('Trackpad Rotate Gesture', (v) => this.change({ trackpadRotate: v }));
  private readonly accel = sliderRow('Scrubby Slider Acceleration (%)', 0, 100, 5, (v) => this.change({ scrubAccel: v }));
  private readonly touch = checkRow('Touch Gestures', (v) => this.change({ touchGestures: v }));
  private readonly extPanels = checkRow('Show Extension Panels (plug-in commands in the Plugins menu)', (v) => this.change({ showExtPanels: v }));
  private readonly custom: HTMLElement[];

  constructor(private readonly change: (patch: Patch) => void) {
    this.scratch = new ScratchSection((folder) => this.change({ scratchFolder: folder }));
    this.custom = [this.checkerA.el, this.checkerB.el];
  }

  get cursors(): HTMLElement[] {
    return [this.onlyCross.el, this.otherCursor.el, this.previewColour.el, note('Show Only Crosshair While Painting draws just the crosshair while a stroke is down. Other Cursors sets the pointer over the tools that do not paint. Brush Preview Color tints the tip while it is resized or its hardness changes (Alt+Ctrl drag, or the bracket keys).')];
  }
  get transparency(): HTMLElement[] {
    return [...this.custom, note('Choose Custom in Grid Colors to use these two colors for the checkerboard.')];
  }
  get units(): HTMLElement[] {
    return [this.printRes.el, this.screenRes.el, this.colWidth.el, this.gutter.el, note('Print and screen resolution are what New Document gives a print preset (300 ppi in the Photo and Print sets) and a screen preset. Column width and gutter size the Columns ruler unit and the Columns unit in New Document: n columns are n widths and n minus 1 gutters.')];
  }
  get type(): HTMLElement[] {
    return [this.smartQuotes.el, this.escCommit.el, this.placeholder.el, note('Smart quotes turn straight quotes into curly ones as you type. With Escape commits, Esc keeps a text edit; off, Esc discards it. A new type layer starts with placeholder text, selected so typing replaces it.')];
  }
  get enhanced(): HTMLElement[] {
    return [this.pinch.el, this.rotate.el, this.accel.el, this.touch.el, note('Pinch zoom and rotation are a trackpad\'s two-finger gestures; touch gestures are the two-finger pan, zoom and turn on a touch screen. Scrubby slider acceleration makes a drag on the Opacity and Fill labels cover more the faster it moves; 0 keeps it steady.')];
  }
  get plugins(): HTMLElement[] { return [this.extPanels.el]; }

  set(p: Prefs): void {
    this.onlyCross.set(p.cursorOnlyCross); this.otherCursor.set(p.cursorOther); this.previewColour.set(p.brushPreviewColor);
    this.checkerA.set(p.checkerA); this.checkerB.set(p.checkerB);
    for (const n of this.custom) setHidden(n, p.checkerColors !== 'custom');
    this.printRes.set(p.printRes); this.screenRes.set(p.screenRes); this.colWidth.set(p.colWidth); this.gutter.set(p.gutter);
    this.smartQuotes.set(p.smartQuotes); this.escCommit.set(p.escCommit); this.placeholder.set(p.placeholderText);
    this.pinch.set(p.pinchZoom); this.rotate.set(p.trackpadRotate); this.accel.set(p.scrubAccel); this.touch.set(p.touchGestures);
    this.extPanels.set(p.showExtPanels);
    void this.scratch.refresh();
  }

  /** Shows the custom grid colours only while Custom is chosen. */
  showCustom(on: boolean): void { for (const n of this.custom) setHidden(n, !on); }
}
