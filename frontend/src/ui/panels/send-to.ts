import { placement, setMat, createSurface, ctxOf, type Engine, type Surface } from '../../engine';
import { api, ApiError } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { loadPrefs } from '../prefs';

export type What = 'flattened' | 'layer' | 'selection' | 'layers';

/** File > Send to NodeMode (1.50.8, the owner's priority) and Send to ComfyUI (1.50.9): the flattened image, the
 *  active layer, the selection with its mask, or every layer, sent to the app at its address in Preferences > Plugins.
 *  A selection goes to NodeMode cut to its bounds; to ComfyUI whole, with a whole-picture mask, as inpainting needs
 *  the picture around it. The status line says whether the app answers. */
export class SendDialog extends Dialog {
  private readonly what = el<HTMLSelectElement>('<select class="cv-input" aria-label="Send"><option value="flattened">Flattened image</option><option value="layer">Active layer</option><option value="selection">Selection (image and mask)</option><option value="layers">Every layer</option></select>');
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" aria-label="Name" maxlength="120">');
  private readonly status = el('<p class="cv-note cv-send-status" role="status"></p>');
  private sending = false;

  constructor(private readonly engine: Engine, private readonly toast: (text: string) => void, private readonly to: 'nodemode' | 'comfyui' = 'nodemode') {
    super(to === 'comfyui' ? 'Send to ComfyUI' : 'Send to NodeMode', 380);
    const row = (label: string, c: HTMLElement): HTMLElement => { const r = el(`<label class="cv-dialog-row"><span>${label}</span></label>`); r.append(c); return r; };
    this.body.append(row('Send', this.what), row('Name', this.name), this.status);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Send', 'primary', () => void this.send());
  }

  show(): void {
    const p = this.engine.current;
    if (!p) return;
    this.name.value = p.name;
    this.what.value = p.selection ? 'selection' : 'flattened';
    (this.what.querySelector('option[value="selection"]') as HTMLOptionElement).disabled = !p.selection;
    this.open();
    void this.check();
  }

  private get target(): string { const p = loadPrefs(); return this.to === 'comfyui' ? p.comfyuiUrl : p.nodemodeUrl; }

  private async check(): Promise<void> {
    const target = this.target;
    if (this.to === 'comfyui') {
      setText(this.status, `Checking ComfyUI at ${target}...`);
      setText(this.status, comfyuiStatusText(await api.comfyuiStatus(target), target));
      return;
    }
    setText(this.status, `Checking NodeMode at ${target}...`);
    setText(this.status, nodemodeStatusText(await api.nodemodeStatus(target), target));
  }

  private images(what: What): Array<{ surface: Surface; item: Record<string, unknown> }> { return imagesFor(this.engine, what, this.to, this.name.value); }

  private async send(): Promise<void> {
    if (this.sending) return;
    const imgs = this.images(this.what.value as What);
    if (!imgs.length) { setText(this.status, 'There is nothing to send: choose another option.'); return; }
    this.sending = true;
    setText(this.status, `Sending ${imgs.length === 1 ? 'the image' : `${imgs.length} images`} to ${this.to === 'comfyui' ? 'ComfyUI' : 'NodeMode'}...`);
    try {
      const parts = await Promise.all(imgs.map(async (x, i) => ({ name: `${i}.png`, blob: await toPng(x.surface) })));
      if (this.to === 'comfyui') {
        const c = await api.sendToComfyUI(this.target, imgs.map((x) => x.item), parts);
        this.close();
        this.toast(`Sent to ComfyUI: ${c.files.map((f) => f.name).join(', ')}. Pick ${c.files.length === 1 ? 'it' : 'them'} in Load Image${c.files.some((f) => f.kind === 'mask') ? ' (the mask in Load Image (as Mask))' : ''}.`);
        return;
      }
      const r = await api.sendToNodeMode(this.target, this.name.value.trim() || 'formvis', imgs.map((x) => x.item), parts);
      this.close();
      this.toast(r.placed ? `Sent to NodeMode: ${imgs.length === 1 ? 'one image' : `${imgs.length} images`} on its canvas.` : r.detail ?? 'Uploaded to NodeMode.');
    } catch (err) {
      setText(this.status, err instanceof ApiError ? err.message : `Sending to ${this.to === 'comfyui' ? 'ComfyUI' : 'NodeMode'} failed: the formvis engine is offline (./formvis boot).`);
    } finally { this.sending = false; }
  }
}

/** What the engine's ComfyUI check says, in words (null: the engine itself did not answer). Send to ComfyUI and the Generate panel's Test say it the same way. */
export function comfyuiStatusText(c: { running: boolean; version?: string } | null, target: string): string {
  return !c ? 'The formvis engine is offline: sending to ComfyUI needs it (./formvis boot).' : c.running ? `ComfyUI${c.version ? ` ${c.version}` : ''} is running at ${target}. Images go to its input folder, under formvis.` : `ComfyUI is not answering at ${target}. Start it, or set its address in Preferences > Plugins.`;
}

/** The same for NodeMode and its receiver. */
export function nodemodeStatusText(s: { running: boolean; receiver: boolean } | null, target: string): string {
  return !s ? 'The formvis engine is offline: sending to NodeMode needs it (./formvis boot).'
    : !s.running ? `NodeMode is not answering at ${target}. Start it, or set its address in Preferences > Plugins.`
    : s.receiver ? `NodeMode is running at ${target}.`
    : `NodeMode is running at ${target}, but cannot place images on its canvas yet: they will go to its uploads.`;
}

export async function toPng(s: Surface): Promise<Blob> {
  if ('convertToBlob' in s) return (s as OffscreenCanvas).convertToBlob({ type: 'image/png' });
  return new Promise((ok, no) => (s as HTMLCanvasElement).toBlob((b) => (b ? ok(b) : no(new Error('png'))), 'image/png'));
}

/** The chosen images, document-sized, each with what the app is told about it: a selection goes to NodeMode cut to its
 *  bounds with its mask, to ComfyUI whole with a whole-picture mask (Send and Run ComfyUI Workflow alike). */
export function imagesFor(e: Engine, what: What, to: 'nodemode' | 'comfyui', named: string): Array<{ surface: Surface; item: Record<string, unknown> }> {
    const p = e.current;
    if (!p) return [];
    const W = p.doc.width, H = p.doc.height, name = named.trim() || p.name;
    const layerImage = (l: NonNullable<typeof p.activeLayer>): Surface => {
      const s = createSurface(W, H);
      if (l.raster) { const c = ctxOf(s); setMat(c, placement(l.transform, l.raster.width, l.raster.height)); c.drawImage(l.raster.canvas as CanvasImageSource, 0, 0); }
      return s;
    };
    if (what === 'layer' && p.activeLayer) return [{ surface: layerImage(p.activeLayer), item: { name: `${name} - ${p.activeLayer.name}`, kind: 'layer', width: W, height: H } }];
    if (what === 'layers') return p.doc.layers.filter((l) => l.raster && !l.isGroup && !l.adjustment).map((l) => ({ surface: layerImage(l), item: { name: `${name} - ${l.name}`, kind: 'layer', width: W, height: H } }));
    const flat = e.flattened();
    if (!flat) return [];
    const sel = p.selection;
    if (what !== 'selection' || !sel) return [{ surface: flat, item: { name, kind: 'image', width: W, height: H } }];
    if (to === 'comfyui') {
      // ComfyUI: the whole picture and a whole-picture mask (white where selected), for Load Image and Load Image (as Mask).
      const mask = createSurface(W, H), mc = ctxOf(mask), m = mc.createImageData(W, H);
      for (let i = 0; i < W * H; i++) m.data[i * 4 + 3] = 255;
      for (let y = 0; y < sel.h; y++) for (let x = 0; x < sel.w; x++) { const X = x + sel.x, Y = y + sel.y; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const v = sel.data[y * sel.w + x], k = (Y * W + X) * 4; m.data[k] = m.data[k + 1] = m.data[k + 2] = v; }
      mc.putImageData(m, 0, 0);
      return [{ surface: flat, item: { name, kind: 'image', width: W, height: H } }, { surface: mask, item: { name: `${name} mask`, kind: 'mask', width: W, height: H, maskOf: 0 } }];
    }
    // The selection: the image within its bounds, cut to it, and its mask (white where selected).
    const img = createSurface(sel.w, sel.h), mask = createSurface(sel.w, sel.h), ic = ctxOf(img), mc = ctxOf(mask);
    ic.drawImage(flat as CanvasImageSource, -sel.x, -sel.y);
    const px = ic.getImageData(0, 0, sel.w, sel.h), m = mc.createImageData(sel.w, sel.h);
    for (let i = 0; i < sel.data.length; i++) { const v = sel.data[i]; px.data[i * 4 + 3] = Math.round((px.data[i * 4 + 3] * v) / 255); m.data[i * 4] = m.data[i * 4 + 1] = m.data[i * 4 + 2] = v; m.data[i * 4 + 3] = 255; }
    ic.putImageData(px, 0, 0); mc.putImageData(m, 0, 0);
    return [{ surface: img, item: { name: `${name} - selection`, kind: 'image', width: sel.w, height: sel.h } },
      { surface: mask, item: { name: `${name} - selection mask`, kind: 'mask', width: sel.w, height: sel.h, maskOf: 0 } }];
}
