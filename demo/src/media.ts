import { decodeUrl, greyToAlpha, type DemoMedia } from '../../frontend/src/demos/media';

export interface Pack { img: string; mask?: string; w?: number; h?: number }

declare global {
  interface Window { FV_MEDIA?: Record<string, Pack> }
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

export const packImage = (pack: Pack): Promise<HTMLCanvasElement> => decodeUrl(pack.img);

export async function packMask(pack: Pack): Promise<HTMLCanvasElement | null> {
  return pack.mask ? greyToAlpha(await decodeUrl(pack.mask)) : null;
}

/** The demo pages' photographs: the data packs in ./assets/media, which open from file://. */
export const packMedia: DemoMedia = {
  image: async (name) => packImage(await loadPack(name)),
  mask: async (name) => packMask(await loadPack(name)),
};
