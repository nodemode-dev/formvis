export interface Pack { img: string; mask?: string; w?: number; h?: number }

declare global {
  interface Window { FV_MEDIA?: Record<string, Pack> }
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

const pending = new Map<string, Promise<Pack>>();

export function loadPack(name: string): Promise<Pack> {
  const have = window.FV_MEDIA?.[name];
  if (have) return Promise.resolve(have);
  const wait = pending.get(name);
  if (wait) return wait;
  const p = new Promise<Pack>((done, fail) => {
    const s = document.createElement('script');
    s.src = `./assets/media/${name}.js`;
    s.onload = () => {
      s.remove();
      const got = window.FV_MEDIA?.[name];
      if (got) done(got); else { pending.delete(name); fail(new Error(`The media pack ${name} is empty.`)); }
    };
    s.onerror = () => { s.remove(); pending.delete(name); fail(new Error(`The media pack ${name} did not load.`)); };
    document.head.appendChild(s);
  });
  pending.set(name, p);
  return p;
}

async function decode(uri: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = uri;
  await img.decode();
  const c = makeCanvas(img.naturalWidth, img.naturalHeight);
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c;
}

export const packImage = (pack: Pack): Promise<HTMLCanvasElement> => decode(pack.img);

export async function packMask(pack: Pack): Promise<HTMLCanvasElement | null> {
  if (!pack.mask) return null;
  const c = await decode(pack.mask);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const data = g.getImageData(0, 0, c.width, c.height), d = data.data;
  for (let i = 0; i < d.length; i += 4) { d[i + 3] = d[i]; d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; }
  g.putImageData(data, 0, 0);
  return c;
}
