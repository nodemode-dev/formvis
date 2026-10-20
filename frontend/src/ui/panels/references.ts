import { Raster, createSurface, ctxOf, placement, setMat, type Engine, type Layer } from '../../engine';
import { CONTROL_ROLES, layerRoleOf, type ControlRole } from '../../engine/types';
import { el, setText } from '../dom';
import { toPng } from './send-to';

export type ReferenceFit = 'placed' | 'stretch' | 'pad' | 'crop';

/** The layers marked Reference, top of the stack first: the order of @img1, @img2 and on. */
export function referenceLayers(engine: Engine): Layer[] {
  return (engine.current?.doc.layers ?? []).filter((l) => l.raster && !l.isGroup && !l.adjustment && layerRoleOf(l) === 'reference').reverse();
}

/** The control pictures for a workflow: for each control role (scribble, depth, edges, pose) the topmost pixel layer holding it, at the document's size, for the Load Image node titled "formvis control <role>". */
export async function controlPictures(engine: Engine, fit: ReferenceFit = 'placed'): Promise<Array<{ role: ControlRole; name: string; blob: Blob }>> {
  const layers = (engine.current?.doc.layers ?? []).filter((l) => l.raster && !l.isGroup && !l.adjustment).reverse(), out: Array<{ role: ControlRole; name: string; blob: Blob }> = [];
  for (const role of CONTROL_ROLES) {
    const l = layers.find((x) => layerRoleOf(x) === role);
    const blob = l ? await referencePicture(engine, l, fit) : null;
    if (l && blob) out.push({ role, name: l.name, blob });
  }
  return out;
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
  private readonly fileList = el('<div class="cv-refs-list cv-refs-files"></div>');
  private readonly input = el<HTMLInputElement>('<input type="file" accept="image/*" multiple hidden aria-label="Add reference pictures from files">');
  private readonly files = new Map<string, Blob>();
  private readonly fit = el<HTMLSelectElement>('<select class="cv-input" aria-label="Reference fit"><option value="placed">Fit: where the layer lies</option><option value="pad">Fit: pad to the picture</option><option value="crop">Fit: crop to the picture</option><option value="stretch">Fit: stretch to the picture</option></select>');
  private seq = 0;

  constructor(private readonly engine: Engine) {
    const add = el<HTMLButtonElement>('<button class="cv-btn" type="button" title="Add a picture from a file as a reference without making it a layer">Add from file</button>');
    this.el.append(el('<span class="cv-refs-title">References</span>'), this.fit, this.list, this.fileList, add, this.input, this.note);
    this.list.addEventListener('change', () => this.limit());   // once, not on every refresh
    this.fileList.addEventListener('change', () => this.limit());
    add.addEventListener('click', () => this.input.click());
    this.input.addEventListener('change', () => { const picked = Array.from(this.input.files ?? []); this.input.value = ''; void this.addFiles(picked); });
    this.fileList.addEventListener('click', (e) => {
      const mk = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-layer]') : null;
      if (mk) { e.preventDefault(); void this.toLayer(mk.closest<HTMLElement>('.cv-refs-row')); return; }
      const rm = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-remove]') : null, row = rm?.closest<HTMLElement>('.cv-refs-row');
      if (!row) return;
      this.files.delete(row.querySelector('input')?.value ?? '');
      row.remove();
      this.limit();
    });
  }

  /** A reference from a file becomes a pixel layer of the open picture (centred, still chosen as a reference) and leaves the file list. */
  private async toLayer(row: HTMLElement | null): Promise<void> {
    const id = row?.querySelector('input')?.value ?? '', blob = this.files.get(id), p = this.engine.current;
    if (!row || !blob || !p) return;
    const bmp = await createImageBitmap(blob), r = new Raster(bmp.width, bmp.height);
    r.ctx.drawImage(bmp, 0, 0);
    bmp.close();
    r.touch();
    this.engine.insertRasterLayer(r, row.querySelector('span')?.textContent ?? 'Reference', Math.round((p.doc.width - r.width) / 2), Math.round((p.doc.height - r.height) / 2), {}, 'Reference to Layer');
    this.files.delete(id);
    row.remove();
    const keep = this.boxes().filter((b) => b.checked).map((b) => b.value);
    this.refresh();
    for (const b of this.boxes()) if (keep.includes(b.value)) b.checked = true;
    const top = this.list.querySelector<HTMLInputElement>('input[type=checkbox]');
    if (top) top.checked = true;
    this.limit();
    this.fileList.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** Pictures from files join the list as references without becoming layers; each is kept as a PNG for this session. */
  private async addFiles(picked: File[]): Promise<void> {
    for (const f of picked) {
      if (!f.type.startsWith('image/') || this.files.size >= 4) continue;
      try {
        const bmp = await createImageBitmap(f), s = createSurface(bmp.width, bmp.height);
        ctxOf(s).drawImage(bmp, 0, 0);
        bmp.close();
        const id = `file${++this.seq}`, row = el('<label class="cv-refs-row"><input type="checkbox" checked><span></span><button class="cv-btn cv-btn-ghost" type="button" data-layer title="Turn this reference into a layer of the picture">To layer</button><button class="cv-btn cv-btn-ghost" type="button" data-remove title="Remove this reference" aria-label="Remove this reference">Remove</button></label>');
        const box = row.querySelector('input') as HTMLInputElement;
        box.value = id;
        setText(row.querySelector('span') as HTMLElement, f.name);
        this.files.set(id, await toPng(s));
        this.fileList.append(row);
      } catch { /* a file that is not a picture is skipped */ }
    }
    this.limit();
    this.fileList.dispatchEvent(new Event('change', { bubbles: true }));
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

  fitValue(): ReferenceFit { return this.fit.value as ReferenceFit; }

  forFal(on: boolean): void {
    setText(this.note, on ? 'fal models take no references: choose a ComfyUI workflow to send them.' : 'Chosen references go to Load Image nodes titled "formvis reference" (then 1, 2...), at most four. Layers with a Control role (scribble, depth, edges, pose) go to Load Image nodes titled "formvis control <role>".');
    if (this.fit.disabled !== on) this.fit.disabled = on;
    if (on) for (const i of this.boxes()) i.disabled = true;
    else this.limit();
  }

  private boxes(): HTMLInputElement[] { return [...this.list.querySelectorAll<HTMLInputElement>('input[type=checkbox]'), ...this.fileList.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]; }

  private limit(): void {
    const on = this.boxes().filter((i) => i.checked);
    for (const i of this.boxes()) if (!i.checked) i.disabled = on.length >= 4;
  }

  /** The chosen layers as PNGs at the document's size, with their names. */
  async chosen(): Promise<Array<{ name: string; blob: Blob }>> {
    const p = this.engine.current;
    const out: Array<{ name: string; blob: Blob }> = [];
    for (const box of this.boxes().filter((i) => i.checked && !i.disabled)) {
      const kept = this.files.get(box.value);
      if (kept) { out.push({ name: box.closest('label')?.querySelector('span')?.textContent ?? box.value, blob: kept }); continue; }
      const l = p?.layer(box.value);
      if (!p || !l?.raster) continue;
      const blob = await referencePicture(this.engine, l, this.fit.value as ReferenceFit);
      if (blob) out.push({ name: l.name, blob });
    }
    return out;
  }
}
