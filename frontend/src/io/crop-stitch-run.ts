import { CROP_PRESETS, cleanCropStitch, cropRect, featherWeights, maskBounds, targetDims, type CropStitch, type Rect } from '../engine/crop-stitch';

/** Crop and stitch settings (kept on this device) and the generator that applies them: a fill or inpaint run is made on
 *  the crop around the mask, scaled to the target size, then scaled back and stitched in with a feathered edge. */

const KEY = 'formvis.cropStitch', USER_KEY = 'formvis.cropStitchPresets';

export interface CropRun { crop: Rect; sent: { width: number; height: number }; stitched: number; feather: number }
/** What the last run did, for the status line and for checking. */
export let lastCropRun: CropRun | null = null;

export function loadCropStitch(): CropStitch {
  try { return cleanCropStitch(JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { return cleanCropStitch({}); }
}

export function saveCropStitch(s: CropStitch): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* this session only */ }
}

export interface CropPreset { name: string; shipped: boolean; settings: Omit<CropStitch, 'enabled'> }

export function userCropPresets(): CropPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(USER_KEY) ?? '[]') as Array<{ name?: unknown; settings?: unknown }>;
    return raw.filter((p) => typeof p.name === 'string' && p.name).map((p) => { const { enabled: _e, ...rest } = cleanCropStitch(p.settings); return { name: String(p.name), shipped: false, settings: rest }; });
  } catch { return []; }
}

/** The shipped presets, then the person's own. */
export const cropPresets = (): CropPreset[] => [...CROP_PRESETS.map((p) => ({ name: p.name, shipped: true, settings: p.settings })), ...userCropPresets()];

/** Keeps the settings under a name of the person's; a shipped name cannot be replaced. Returns false then. */
export function saveCropPreset(name: string, s: CropStitch): boolean {
  const n = name.trim().slice(0, 40);
  if (!n || CROP_PRESETS.some((p) => p.name.toLowerCase() === n.toLowerCase())) return false;
  const { enabled: _e, ...settings } = s;
  const rest = userCropPresets().filter((p) => p.name !== n).map((p) => ({ name: p.name, settings: p.settings }));
  try { localStorage.setItem(USER_KEY, JSON.stringify([...rest, { name: n, settings }])); } catch { return false; }
  return true;
}

export function removeCropPreset(name: string): void {
  try { localStorage.setItem(USER_KEY, JSON.stringify(userCropPresets().filter((p) => p.name !== name).map((p) => ({ name: p.name, settings: p.settings })))); } catch { /* kept */ }
}

type Surface2D = { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D };
function surface(w: number, h: number): Surface2D {
  const canvas = new OffscreenCanvas(w, h), ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}
const png = (s: Surface2D): Promise<Blob> => s.canvas.convertToBlob({ type: 'image/png' });

/** `generate` run on the crop around the mask, as the settings say; the same generator back when they are off or the mask is empty.
 *  The picture it returns is as large as the one it was given, the result stitched into it. */
export function withCropStitch(generate: (image: Blob, mask: Blob) => Promise<Blob>, settings: () => CropStitch = loadCropStitch): (image: Blob, mask: Blob) => Promise<Blob> {
  return async (image, mask) => {
    const cfg = settings();
    if (!cfg.enabled) return generate(image, mask);
    const img = await createImageBitmap(image), msk = await createImageBitmap(mask);
    const W = img.width, H = img.height;
    const m = surface(W, H);
    m.ctx.drawImage(msk, 0, 0, W, H);
    const md = m.ctx.getImageData(0, 0, W, H).data;
    const b = maskBounds(md, W, H, 4, 0);
    if (!b) { img.close(); msk.close(); return generate(image, mask); }
    const crop = cropRect(b, W, H, cfg.padding), size = targetDims(crop.w, crop.h, cfg.target, cfg.multiple);
    const sendImg = surface(size.width, size.height), sendMask = surface(size.width, size.height);
    sendImg.ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, size.width, size.height);
    sendMask.ctx.drawImage(m.canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, size.width, size.height);
    const made = await generate(await png(sendImg), await png(sendMask));
    const res = await createImageBitmap(made);
    const piece = surface(crop.w, crop.h);
    piece.ctx.drawImage(res, 0, 0, crop.w, crop.h);
    res.close();
    const pd = piece.ctx.getImageData(0, 0, crop.w, crop.h), cm = new Uint8Array(crop.w * crop.h);
    for (let y = 0; y < crop.h; y++) for (let x = 0; x < crop.w; x++) cm[y * crop.w + x] = md[((crop.y + y) * W + crop.x + x) * 4];
    const weight = featherWeights(cm, crop.w, crop.h, cfg.feather);
    let stitched = 0;
    for (let i = 0; i < weight.length; i++) {
      const a = Math.round(pd.data[i * 4 + 3] * weight[i]);
      pd.data[i * 4 + 3] = a;
      if (a > 0) stitched++;
    }
    piece.ctx.putImageData(pd, 0, 0);
    const out = surface(W, H);
    out.ctx.drawImage(img, 0, 0);
    out.ctx.drawImage(piece.canvas, crop.x, crop.y);
    img.close();
    msk.close();
    lastCropRun = { crop, sent: size, stitched, feather: cfg.feather };
    return png(out);
  };
}
