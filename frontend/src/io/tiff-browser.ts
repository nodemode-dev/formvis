// TIFF opened in the browser (DEV_PLAN 36.19): when the engine service is not running, utif2 (MIT, a small JavaScript
// decoder, loaded on first use) reads the first page of a TIFF, as 8 bits per channel RGBA, and hands it back as a PNG,
// the way the engine's /io/decode route does. Pages beyond the first, 16-bit depth and the ICC profile need the service.

type Utif = typeof import('utif2');

/** The first page of a TIFF as a PNG; throws when the file is not a TIFF utif2 can read. */
export async function decodeTiffInBrowser(file: Blob): Promise<Blob> {
  const mod = (await import('utif2')) as Utif & { default?: Utif };
  const utif = mod.default ?? mod;
  const bytes = await file.arrayBuffer();
  const pages = utif.decode(bytes);
  const page = pages[0];
  if (!page) throw new Error('This TIFF has no picture in it.');
  utif.decodeImage(bytes, page);
  const rgba = utif.toRGBA8(page);
  const { width, height } = page;
  if (!width || !height || rgba.length < width * height * 4) throw new Error('This TIFF could not be read here. Start the engine service (./formvis boot) to open it.');
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw a picture.');
  const pixels = new ImageData(width, height);
  pixels.data.set(rgba.subarray(0, width * height * 4));
  ctx.putImageData(pixels, 0, 0);
  return await new Promise<Blob>((done, fail) => canvas.toBlob((b) => (b ? done(b) : fail(new Error('This TIFF could not be turned into a picture.'))), 'image/png'));
}
