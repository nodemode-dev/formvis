import { el, setHidden, setText } from '../dom';
import { api } from '../../io/api';
import { CANVAS_BORDERS, DISPLAY_SERVERS, type Prefs } from '../prefs';
import { loadExportPrefs, saveExportPrefs } from '../../io/export-prefs';
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
  private readonly tipHardness = checkRow('Right-Drag Up and Down Sets Brush Hardness', (v) => this.change({ tipHardness: v }));
  private readonly snapPx = checkRow('Snap Vector Tools and Transforms to Pixel Grid', (v) => this.change({ snapVectorPx: v }));
  private readonly readout = checkRow('Show Transformation Values', (v) => this.change({ transformReadout: v }));
  private readonly rollover = checkRow('Rollover Highlight', (v) => this.change({ rolloverHighlight: v }));
  private readonly flick = checkRow('Enable Flick Panning', (v) => this.change({ flickPan: v }));
  private readonly channelsColour = checkRow('Show Channels in Color', (v) => this.change({ channelsColour: v }));
  private readonly exportClip = checkRow('Export Clipboard to the System', (v) => this.change({ exportClipboard: v }));
  private readonly dynamicSliders =checkRow('Dynamic Color Sliders', (v) => this.change({ dynamicSliders: v }));
  private readonly border = selectRow('Canvas Border', CANVAS_BORDERS, (v) => this.change({ canvasBorder: v === 'none' || v === 'shadow' ? v : 'line' }));
  private readonly maximize = checkRow('Maximize PSD and PSB File Compatibility', (v) => saveExportPrefs({ ...loadExportPrefs(), maximizePsd: v }));
  private readonly exifTag = checkRow('Write EXIF Color Space Tag', (v) => this.change({ exifColourTag: v }));
  private readonly askTiff = checkRow('Ask Before Saving Layered TIFF Files', (v) => this.change({ askLayeredTiff: v }));
  private readonly typeUnits = selectRow('Type Size Units', [['px', 'Pixels'], ['pt', 'Points']], (v) => this.change({ typeUnits: v === 'pt' ? 'pt' : 'px' }));
  private readonly legacyTransform = checkRow('Use Legacy Free Transform', (v) => this.change({ legacyTransform: v }));
  private readonly lowRes = checkRow('Low-Resolution Previews', (v) => this.change({ lowResPreviews: v }));
  private readonly displayServer = selectRow('Linux Display Server (desktop app, next launch)', DISPLAY_SERVERS, (v) => this.change({ displayServer: v === 'x11' || v === 'wayland' ? v : 'auto' }));
  private readonly glyphProtection = checkRow('Enable Missing Glyph Protection', (v) => this.change({ glyphProtection: v }));
  private readonly fontNamesEnglish = checkRow('Show Font Names in English (next launch)', (v) => this.change({ fontNamesEnglish: v }));
  private readonly memoryLine = el('<p class="cv-note" role="status" style="min-height: 2.8em"></p>');
  private readonly custom: HTMLElement[];

  constructor(private readonly change: (patch: Patch) => void) {
    this.scratch = new ScratchSection((folder) => this.change({ scratchFolder: folder }));
    this.custom = [this.checkerA.el, this.checkerB.el];
    setHidden(this.displayServer.el, !/Linux/.test(navigator.platform));
  }

  get cursors(): HTMLElement[] {
    return [this.onlyCross.el, this.otherCursor.el, this.previewColour.el, note('Show Only Crosshair While Painting draws just the crosshair while a stroke is down. Other Cursors sets the pointer over the tools that do not paint. Brush Preview Color tints the tip while it is resized or its hardness changes (Alt+Ctrl drag, or the bracket keys).')];
  }
  get toolRows(): HTMLElement[] {
    return [this.tipHardness.el, this.snapPx.el, this.readout.el, this.rollover.el, this.flick.el, note('Right-drag with a brush: across sets the size, up and down the hardness. Pixel grid snapping rounds the anchors of the Shape, Pen and Curvature Pen tools to whole pixels. Transformation values show the position, size or angle beside a transform as you drag. Rollover Highlight outlines the layer under the Move tool\'s pointer. Flick panning lets a quick Hand drag coast on.')];
  }
  get interfaceRows(): HTMLElement[] {
    return [this.channelsColour.el, this.dynamicSliders.el, this.border.el, note('Dynamic Color Sliders draw the hue, saturation and brightness sliders of the Color panel as the colors they would give. Show Channels in Color shows a single channel in the Channels panel and on the canvas in its own color instead of grey. Canvas Border draws a line or a drop shadow round the picture.')];
  }
  get generalRows(): HTMLElement[] {
    return [this.exportClip.el, this.legacyTransform.el, note('Export Clipboard to the System puts what you copy on the system clipboard too, so other programs can paste it; off keeps it inside formvis. Use Legacy Free Transform makes a handle scale freely and Shift hold the proportions; off, Free Transform keeps the proportions (as Keep proportions says) and Shift gives them up.')];
  }
  get performance(): HTMLElement[] {
    return [this.memoryLine, this.lowRes.el, this.displayServer.el, note('Memory in use is read when this page opens: the window\'s share where the browser reports it, and the engine\'s own as the system counts it. Low-Resolution Previews run a filter\'s live preview on a copy of about half a megapixel instead of two, so large pictures preview faster; Full Resolution Previews wins when both are on. The Linux display server is read by the desktop app as it starts: Automatic leaves the choice to the system, X11 also turns off the web view\'s DMA-BUF renderer, and a GDK_BACKEND set in the environment is never replaced.')];
  }
  get fileRows(): HTMLElement[] {
    return [this.maximize.el, this.askTiff.el, this.exifTag.el, note('Maximize PSD and PSB File Compatibility writes the flattened picture and a preview beside the layers, so readers that ignore layers still show it; off makes smaller files. With Ask Before Saving Layered TIFF Files off, Export > TIFF keeps the layers without asking. Write EXIF Color Space Tag adds the ColorSpace tag to exported JPEG, PNG, WebP and TIFF files: sRGB, or uncalibrated when the file is in another space (the profile itself is embedded as before). Metadata set to None writes no tag.')];
  }
  get transparency(): HTMLElement[] {
    return [...this.custom, note('Choose Custom in Grid Colors to use these two colors for the checkerboard.')];
  }
  get units(): HTMLElement[] {
    return [this.printRes.el, this.screenRes.el, this.colWidth.el, this.gutter.el, note('Print and screen resolution are what New Document gives a print preset (300 ppi in the Photo and Print sets) and a screen preset. Column width and gutter size the Columns ruler unit and the Columns unit in New Document: n columns are n widths and n minus 1 gutters.')];
  }
  get type(): HTMLElement[] {
    return [this.typeUnits.el, this.smartQuotes.el, this.escCommit.el, this.placeholder.el, this.glyphProtection.el, this.fontNamesEnglish.el, note('Smart quotes turn straight quotes into curly ones as you type. With Escape commits, Esc keeps a text edit; off, Esc discards it. A new type layer starts with placeholder text, selected so typing replaces it. Missing Glyph Protection draws a character the font lacks in a face that has it, chosen for the text\'s script, instead of leaving it to the system\'s default; Show Font Names in English lists each installed font under its English family name in the desktop app, the next time the font list is read.')];
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
    this.tipHardness.set(p.tipHardness); this.snapPx.set(p.snapVectorPx); this.readout.set(p.transformReadout); this.rollover.set(p.rolloverHighlight); this.flick.set(p.flickPan);
    this.channelsColour.set(p.channelsColour); this.dynamicSliders.set(p.dynamicSliders); this.exportClip.set(p.exportClipboard); this.border.set(p.canvasBorder); this.askTiff.set(p.askLayeredTiff); this.exifTag.set(p.exifColourTag); this.typeUnits.set(p.typeUnits);
    this.maximize.set(loadExportPrefs().maximizePsd);
    this.legacyTransform.set(p.legacyTransform); this.lowRes.set(p.lowResPreviews); this.displayServer.set(p.displayServer);
    this.glyphProtection.set(p.glyphProtection); this.fontNamesEnglish.set(p.fontNamesEnglish);
    void this.scratch.refresh();
    void this.refreshMemory();
  }

  /** The memory line: this window's heap where the browser says (Chromium's performance.memory, or the whole-page measure on a cross-origin isolated page), and the engine process's resident size. */
  private async refreshMemory(): Promise<void> {
    const mb = (n: number): string => `${Math.round(n / 1048576).toLocaleString()} MB`;
    const perf = performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number }; measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }> };
    const parts: string[] = [];
    try {
      if (perf.memory) parts.push(`window ${mb(perf.memory.usedJSHeapSize)} of ${mb(perf.memory.jsHeapSizeLimit)}`);
      else if (typeof perf.measureUserAgentSpecificMemory === 'function' && self.crossOriginIsolated) parts.push(`window ${mb((await perf.measureUserAgentSpecificMemory()).bytes)}`);
    } catch { /* the engine's figure may still be there */ }
    const m = await api.metrics();
    if (m?.rss) parts.push(`engine ${mb(m.rss)}`);
    setText(this.memoryLine, parts.length ? `Memory in use: ${parts.join(' · ')}.` : 'Memory in use: neither this window nor the engine reports it here.');
  }

  /** Shows the custom grid colours only while Custom is chosen. */
  showCustom(on: boolean): void { for (const n of this.custom) setHidden(n, !on); }
}
