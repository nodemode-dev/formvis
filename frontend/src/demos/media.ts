/** Where a demo's photographs come from: the browser demos read their JavaScript data packs (file://), the app reads the
 *  same bytes as plain files under /demos/<id>/ (scripts/demo-media.py writes them, with media.json). */
export interface DemoMedia {
  image(name: string): Promise<HTMLCanvasElement>;
  mask(name: string): Promise<HTMLCanvasElement | null>;
}

export function canvasOf(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, img.naturalWidth);
  c.height = Math.max(1, img.naturalHeight);
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c;
}

export async function decodeUrl(url: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return canvasOf(img);
}

/** A grey mask picture as a layer mask: its grey becomes the alpha. */
export function greyToAlpha(c: HTMLCanvasElement): HTMLCanvasElement {
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const data = g.getImageData(0, 0, c.width, c.height), d = data.data;
  for (let i = 0; i < d.length; i += 4) { d[i + 3] = d[i]; d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; }
  g.putImageData(data, 0, 0);
  return c;
}

type Table = Record<string, { img: string; mask?: string }>;

/** The app's copy of a demo's photographs, served beside the interface. */
export function shippedMedia(id: string): DemoMedia {
  const base = `${import.meta.env.BASE_URL}demos/${id}/`;
  let table: Promise<Table> | null = null;
  const entry = async (name: string): Promise<{ img: string; mask?: string }> => {
    table ??= fetch(`${base}media.json`).then((r) => { if (!r.ok) throw new Error('This build has no demo photographs.'); return r.json() as Promise<Table>; });
    const e = (await table)[name];
    if (!e) throw new Error(`This build has no ${name} for the demo.`);
    return e;
  };
  return {
    image: async (name) => decodeUrl(base + (await entry(name)).img),
    mask: async (name) => { const m = (await entry(name)).mask; return m ? greyToAlpha(await decodeUrl(base + m)) : null; },
  };
}
