import { COLOR_RANGE_MODES, type ColorRangeMode, type Engine, type RGB, type SelectionMode } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { faceReady, findFaces } from '../../io/local-gen';

const BOX_W = 320, BOX_H = 200;

/** Select > Color Range: click the image to sample colours (Shift adds another, Alt takes one away), or choose
 *  Highlights, Midtones or Shadows; Fuzziness widens what counts as close. The preview shows the selection in grey,
 *  white where fully selected, at one fixed size so the dialog never shifts. */
export class ColorRangeDialog extends Dialog {
  private plus: RGB[] = [];
  private minus: RGB[] = [];
  private at: Array<{ x: number; y: number }> = [];
  private readonly local = el<HTMLInputElement>('<input type="checkbox">');
  private readonly spread = el<HTMLInputElement>('<input class="cv-input" type="number" min="0" max="100" step="1" value="50">');
  private readonly pick = el<HTMLSelectElement>(`<select class="cv-input">${COLOR_RANGE_MODES.map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select>`);
  private readonly combine = el<HTMLSelectElement>('<select class="cv-input"><option value="replace">New Selection</option><option value="add">Add to Selection</option><option value="subtract">Subtract from Selection</option><option value="intersect">Intersect with Selection</option></select>');
  private readonly tool = el<HTMLSelectElement>('<select class="cv-input"><option value="set">Sample</option><option value="add">Add to Sample</option><option value="remove">Subtract from Sample</option></select>');
  private readonly view = el<HTMLSelectElement>('<select class="cv-input"><option value="selection">Selection</option><option value="image">Image</option><option value="matte-black">Black Matte</option><option value="matte-white">White Matte</option><option value="quick">Quick Mask</option></select>');
  private readonly farLimit = el<HTMLInputElement>('<input class="cv-input" type="number" min="0" max="255" step="1" value="128" disabled>');
  private readonly nearLimit = el<HTMLInputElement>('<input class="cv-input" type="number" min="0" max="255" step="1" value="255" disabled>');
  private readonly fuzz = el<HTMLInputElement>('<input class="cv-input" type="number" min="0" max="200" step="1" value="40">');
  private readonly invert = el<HTMLInputElement>('<input type="checkbox">');
  private readonly detect = el<HTMLInputElement>('<input type="checkbox" disabled>');
  private faces: Array<[number, number, number, number]> | null = null;
  private readonly note = el<HTMLParagraphElement>('<p class="cv-hint">Click the image to sample a color; Shift-click adds one, Alt-click takes one away.</p>');
  private readonly preview = el<HTMLCanvasElement>(`<canvas class="cv-jpeg-preview" width="${BOX_W}" height="${BOX_H}" aria-label="Selection preview"></canvas>`);
  private handler: ((e: PointerEvent) => void) | null = null;
  private pending = 0;

  constructor(private readonly engine: Engine) {
    super('Color Range', 380);
    this.field('Select', this.pick);
    this.field('Fuzziness', this.fuzz);
    this.field('Depth Far Limit', this.farLimit);
    this.field('Depth Near Limit', this.nearLimit);
    this.field('Eyedropper', this.tool);
    this.field('Combine', this.combine);
    this.field('Selection Preview', this.view);
    this.view.addEventListener('input', () => this.refresh());
    const loc = el<HTMLLabelElement>('<label class="cv-check"></label>');
    loc.append(this.local, document.createTextNode(' Localized Color Clusters'));
    this.field('', loc);
    this.field('Range (%)', this.spread);
    for (const c of [this.local, this.spread]) c.addEventListener('input', () => this.refresh());
    const inv = el<HTMLLabelElement>('<label class="cv-check"></label>');
    inv.append(this.invert, document.createTextNode(' Invert'));
    this.field('', inv);
    const det = el<HTMLLabelElement>('<label class="cv-check"></label>');
    det.append(this.detect, document.createTextNode(' Detect Faces (Skin Tones)'));
    this.field('', det);
    this.detect.addEventListener('input', () => void this.findFaces());
    this.field('', this.note);
    this.field('', this.preview);
    for (const c of [this.pick, this.fuzz, this.invert, this.farLimit, this.nearLimit]) c.addEventListener('input', () => { this.farLimit.disabled = this.nearLimit.disabled = this.pick.value !== 'depth' && this.pick.value !== 'luminosity'; this.detect.disabled = this.pick.value !== 'skin'; this.refresh(); });
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => { const o = this.options(); this.close(); this.engine.selectColorRange(o); });
    this.remember([this.combine]);
  }

  private options(): Parameters<Engine['colorRangeMask']>[0] {
    const mode = COLOR_RANGE_MODES.find(([id]) => id === this.pick.value)?.[0] ?? ('sampled' as ColorRangeMode), n = (f: HTMLInputElement): number => Math.min(255, Math.max(0, Number(f.value) || 0));
    return { mode, faces: this.detect.checked && this.faces ? this.faces : undefined, plus: this.plus, minus: this.minus, localized: this.local.checked, spread: Math.min(100, Math.max(0, Number(this.spread.value) || 0)), at: this.at, fuzziness: Math.min(200, Math.max(0, Number(this.fuzz.value) || 0)), invert: this.invert.checked, combine: this.combine.value as SelectionMode, lo: n(this.farLimit), hi: n(this.nearLimit) };
  }

  /** Test hook as much as a user path: sample a colour as a click would. */
  sample(rgb: RGB, how: 'set' | 'add' | 'remove', at: { x: number; y: number } = { x: 0, y: 0 }): void {
    if (how === 'set') { this.plus = [rgb]; this.at = [at]; this.minus = []; }
    else if (how === 'add') { this.plus.push(rgb); this.at.push(at); }
    else this.minus.push(rgb);
    if (this.pick.value !== 'sampled') this.pick.value = 'sampled';
    this.refresh();
  }

  /** Detect Faces: the engine's face finder over the flattened picture, once per dialog; skin counts only on a face. */
  private async findFaces(): Promise<void> {
    if (!this.detect.checked) { this.refresh(); return; }
    if (!this.faces) {
      const flat = this.engine.flattened();
      if (!flat) { this.detect.checked = false; return; }
      setText(this.note, 'Finding faces...');
      try {
        if (!(await faceReady())) throw new Error('Detect Faces needs the face finder (YuNet, 232 KB, MIT): download it in Preferences > Plugins > Local models.');
        const c = document.createElement('canvas');
        c.width = flat.width; c.height = flat.height;
        (c.getContext('2d') as CanvasRenderingContext2D).drawImage(flat as CanvasImageSource, 0, 0);
        const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('no pixels'))), 'image/png'));
        this.faces = (await findFaces(blob)).map((f) => [...f.box] as [number, number, number, number]);
      } catch (err) {
        this.detect.checked = false;
        setText(this.note, err instanceof Error ? err.message : 'The faces could not be found.');
        return;
      }
    }
    setText(this.note, this.faces.length ? `${this.faces.length} face${this.faces.length > 1 ? 's' : ''} found; skin counts only on a face.` : 'No face found; Skin Tones selects as before.');
    if (!this.faces.length) this.detect.checked = false;
    this.refresh();
  }

  private refresh(): void {
    cancelAnimationFrame(this.pending);
    this.pending = requestAnimationFrame(() => {
      const p = this.engine.current, c = this.preview.getContext('2d');
      if (!p || !c) return;
      const scale = Math.min(1, BOX_W / p.doc.width, BOX_H / p.doc.height), r = this.engine.colorRangeMask(this.options(), scale);
      c.fillStyle = '#000000';
      c.fillRect(0, 0, BOX_W, BOX_H);
      if (!r) return;
      const img = new ImageData(r.w, r.h), view = this.view.value, flat = view === 'selection' ? null : this.engine.flattened();
      let base: Uint8ClampedArray | null = null;
      if (flat) {
        const tmp = document.createElement('canvas');
        tmp.width = r.w; tmp.height = r.h;
        const tc = tmp.getContext('2d');
        if (tc) { tc.drawImage(flat as CanvasImageSource, 0, 0, r.w, r.h); base = tc.getImageData(0, 0, r.w, r.h).data; }
      }
      for (let i = 0; i < r.mask.length; i++) {
        const v = r.mask[i], o = i * 4;
        if (!base) { img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; img.data[o + 3] = 255; continue; }
        const a = v / 255, tint = view === 'matte-black' ? [0, 0, 0] : view === 'matte-white' ? [255, 255, 255] : view === 'quick' ? [255, 0, 0] : null, k = view === 'image' ? 1 : view === 'quick' ? 1 - a * 0.5 : a;
        for (let c = 0; c < 3; c++) img.data[o + c] = tint ? base[o + c] * k + tint[c] * (1 - k) : base[o + c];
        img.data[o + 3] = 255;
      }
      c.putImageData(img, Math.floor((BOX_W - r.w) / 2), Math.floor((BOX_H - r.h) / 2));
    });
  }

  show(mode?: string): void {
    if (!this.engine.current || this.isOpen) return;
    this.combine.value = this.engine.selectionMode;
    this.faces = null;
    this.detect.checked = false;
    this.open();
    if (mode === 'depth') {
      this.pick.value = 'depth';
      this.farLimit.disabled = this.nearLimit.disabled = false;
      this.detect.disabled = true;
    }
    this.refresh();
    this.scrim.classList.add('cv-scrim-through');
    const handler = (e: PointerEvent): void => {
      const stage = document.querySelector('.cv-overlay-canvas'), p = this.engine.current;
      if (e.button !== 0 || !stage || e.target !== stage || !p || !this.isOpen) return;
      e.preventDefault();
      e.stopPropagation();
      const b = stage.getBoundingClientRect(), v = p.viewport, at = { x: (e.clientX - b.left - v.panX) / v.zoom, y: (e.clientY - b.top - v.panY) / v.zoom }, rgb = this.engine.sampleOriginal(at, true);
      // sampleOriginal gives channels from 0 to 1.
      if (rgb) this.sample({ r: Math.round(rgb[0] * 255), g: Math.round(rgb[1] * 255), b: Math.round(rgb[2] * 255) }, e.shiftKey ? 'add' : e.altKey ? 'remove' : (this.tool.value as 'set' | 'add' | 'remove'), at);
    };
    window.addEventListener('pointerdown', handler, true);
    this.handler = handler;
  }

  close(): void {
    if (this.handler) window.removeEventListener('pointerdown', this.handler, true);
    this.handler = null;
    this.scrim.classList.remove('cv-scrim-through');
    super.close();
  }
}
