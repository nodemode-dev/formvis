import { createSurface, ctxOf, placement, setMat, type Engine, type Layer } from '../../engine';
import { layerRoleOf } from '../../engine/types';
import { el, setText } from '../dom';
import { toPng } from './send-to';

export type ReferenceFit = 'placed' | 'stretch' | 'pad' | 'crop';

/** The layers marked Reference, top of the stack first: the order of @img1, @img2 and on. */
export function referenceLayers(engine: Engine): Layer[] {
  return (engine.current?.doc.layers ?? []).filter((l) => l.raster && !l.isGroup && !l.adjustment && layerRoleOf(l) === 'reference').reverse();
}

/** A layer as a picture the size of the document: where it lies on the canvas, or its own pixels stretched, padded or cropped to the document's shape. */
export async function referencePicture(engine: Engine, l: Layer, fit: ReferenceFit = 'placed'): Promise<Blob | null> {
  const p = engine.current;
  if (!p || !l.raster) return null;
  const W = p.doc.width, H = p.doc.height, rw = l.raster.width, rh = l.raster.height, s = createSurface(W, H), c = ctxOf(s);
  if (fit === 'placed') {
    setMat(c, placement(l.transform, rw, rh));
    c.drawImage(l.raster.canvas as CanvasImageSource, 0, 0);
  } else {
    const k = fit === 'stretch' ? 0 : fit === 'pad' ? Math.min(W / rw, H / rh) : Math.max(W / rw, H / rh), w = fit === 'stretch' ? W : rw * k, h = fit === 'stretch' ? H : rh * k;
    c.drawImage(l.raster.canvas as CanvasImageSource, (W - w) / 2, (H - h) / 2, w, h);
  }
  return toPng(s);
}

/** Reference layers for a ComfyUI workflow (1.51.4): up to four pixel layers, each sent at the document's size to the
 *  Load Image nodes titled "formvis reference" (then "1", "2" and on, in order). fal's models take no references. */
export class ReferencePicker {
  readonly el = el('<div class="cv-refs" role="group" aria-label="References"></div>');
  private readonly list = el('<div class="cv-refs-list"></div>');
  private readonly note = el('<p class="cv-note"></p>');

  constructor(private readonly engine: Engine) {
    this.el.append(el('<span class="cv-refs-title">References</span>'), this.list, this.note);
    this.list.addEventListener('change', () => this.limit());   // once, not on every refresh
  }

  /** Lists the document's pixel layers; those flagged as references (up to four) start chosen. */
  refresh(forFal = false): void {
    const layers = this.engine.current?.doc.layers.filter((l) => l.raster && !l.isGroup && !l.adjustment) ?? [];
    let flagged = 0;
    this.list.replaceChildren(...layers.slice().reverse().map((l) => {
      const row = el('<label class="cv-refs-row"><input type="checkbox"><span></span></label>');
      const box = row.querySelector('input') as HTMLInputElement;
      box.value = l.id;
      if (layerRoleOf(l) === 'reference' && flagged < 4) { box.checked = true; flagged++; }
      setText(row.querySelector('span') as HTMLElement, l.name);
      return row;
    }));
    this.limit();
    this.forFal(forFal);
  }

  forFal(on: boolean): void {
    setText(this.note, on ? 'fal models take no references: choose a ComfyUI workflow to send them.' : 'Chosen layers go to Load Image nodes titled "formvis reference" (then 1, 2...), at most four.');
    for (const i of this.boxes()) i.disabled = on;
  }

  private boxes(): HTMLInputElement[] { return [...this.list.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]; }

  private limit(): void {
    const on = this.boxes().filter((i) => i.checked);
    for (const i of this.boxes()) if (!i.checked) i.disabled = on.length >= 4;
  }

  /** The chosen layers as PNGs at the document's size, with their names. */
  async chosen(): Promise<Array<{ name: string; blob: Blob }>> {
    const p = this.engine.current;
    if (!p) return [];
    const out: Array<{ name: string; blob: Blob }> = [];
    for (const box of this.boxes().filter((i) => i.checked && !i.disabled)) {
      const l = p.layer(box.value);
      if (!l?.raster) continue;
      const s = createSurface(p.doc.width, p.doc.height), c = ctxOf(s);
      setMat(c, placement(l.transform, l.raster.width, l.raster.height));
      c.drawImage(l.raster.canvas as CanvasImageSource, 0, 0);
      out.push({ name: l.name, blob: await toPng(s) });
    }
    return out;
  }
}
