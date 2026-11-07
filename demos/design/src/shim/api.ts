import { VERSION } from '../../../../frontend/src/version';
import { encodeBmp, encodeIco, encodePam, encodePdf, encodeQoi, encodeTga, encodeTiff, type PdfPage, type Pixels } from './encode';

const NEEDS = 'This needs the desktop engine. The demo runs the picture engine in the page; saving to the library, camera raw, colour conversion, local models, video and agents belong to the desktop app.';

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const file = (bytes: Uint8Array, type: string): Response => new Response(new Blob([bytes as BlobPart], { type }), { status: 200, headers: { 'Content-Type': type } });

const capabilities = {
  name: 'formvis',
  version: VERSION,
  desktop: false,
  decode: { heic: false, tiff: true, engine: 'page' },
  removeBackground: { ml: false, lite: false, default: null, model: '' },
  dataDir: '',
};

const empty: Record<string, unknown> = {
  '/library': [],
  '/plugins': [],
  '/outputs': [],
  '/jobs': [],
  '/mcp/bridge/changed': {},
  '/mcp/bridge/stop': {},
};

async function read(blob: Blob): Promise<{ px: Pixels; canvas: HTMLCanvasElement }> {
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  bmp.close();
  return { px: { width: canvas.width, height: canvas.height, data: g.getImageData(0, 0, canvas.width, canvas.height).data }, canvas };
}

const toBlob = (c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> => new Promise((done, fail) => c.toBlob((b) => (b ? done(b) : fail(new Error('The page could not encode this picture.'))), type, quality));
const bytesOf = async (b: Blob): Promise<Uint8Array> => new Uint8Array(await b.arrayBuffer());

async function flatJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  const c = document.createElement('canvas');
  c.width = canvas.width;
  c.height = canvas.height;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(canvas, 0, 0);
  return bytesOf(await toBlob(c, 'image/jpeg', quality / 100));
}

async function encode(form: FormData): Promise<Response> {
  const format = String(form.get('format') ?? 'png'), quality = Number(form.get('quality') ?? 90), dpi = Number(form.get('dpi') ?? 72);
  const src = form.get('file');
  if (!(src instanceof Blob)) return json({ detail: 'No picture came with the request.' }, 400);
  const { px, canvas } = await read(src);
  switch (format) {
    case 'tiff': return file(encodeTiff(px, dpi), 'image/tiff');
    case 'bmp': return file(encodeBmp(px, dpi), 'image/bmp');
    case 'tga': return file(encodeTga(px), 'image/x-tga');
    case 'qoi': return file(encodeQoi(px), 'image/qoi');
    case 'pnm': return file(encodePam(px), 'image/x-portable-arbitrarymap');
    case 'ico': {
      const k = Math.min(1, 256 / Math.max(px.width, px.height)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(px.width * k));
      c.height = Math.max(1, Math.round(px.height * k));
      c.getContext('2d')!.drawImage(canvas, 0, 0, c.width, c.height);
      return file(encodeIco(await bytesOf(await toBlob(c, 'image/png')), c.width, c.height), 'image/vnd.microsoft.icon');
    }
    case 'pdf': return file(encodePdf([{ jpeg: await flatJpeg(canvas, quality), width: px.width, height: px.height, dpi }]), 'application/pdf');
    case 'webp': return file(await bytesOf(await toBlob(canvas, 'image/webp', quality / 100)), 'image/webp');
    case 'jpeg': return file(await flatJpeg(canvas, quality), 'image/jpeg');
    case 'png': return file(await bytesOf(await toBlob(canvas, 'image/png')), 'image/png');
    default: return json({ detail: NEEDS }, 503);
  }
}

async function pdfPages(form: FormData): Promise<Response> {
  const dpi = Number(form.get('dpi') ?? 72), quality = Number(form.get('quality') ?? 90);
  const pages: PdfPage[] = [];
  for (const part of form.getAll('file')) {
    if (!(part instanceof Blob)) continue;
    const { px, canvas } = await read(part);
    pages.push({ jpeg: await flatJpeg(canvas, quality), width: px.width, height: px.height, dpi });
  }
  return pages.length ? file(encodePdf(pages), 'application/pdf') : json({ detail: 'There are no pages to write.' }, 400);
}

async function route(path: string, init?: RequestInit): Promise<Response> {
  if (path === '/capabilities') return json(capabilities);
  if (path in empty) return json(empty[path]);
  const body = init?.body;
  try {
    if (path === '/io/encode' && body instanceof FormData) return await encode(body);
    if (path === '/io/pdf-pages' && body instanceof FormData) return await pdfPages(body);
  } catch (err) {
    return json({ detail: err instanceof Error ? err.message : NEEDS }, 500);
  }
  return json({ detail: NEEDS }, 503);
}

class QuietSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = 0;
  binaryType: BinaryType = 'blob';
  onopen: ((e: Event) => void) | null = null;
  onclose: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onmessage: ((e: Event) => void) | null = null;
  constructor(readonly url: string) {
    super();
    window.setTimeout(() => { this.readyState = 3; const e = new Event('close'); this.onclose?.(e); this.dispatchEvent(e); }, 0);
  }
  send(): void { return; }
  close(): void { this.readyState = 3; }
}

const NativeSocket = window.WebSocket;
window.WebSocket = new Proxy(NativeSocket, {
  construct(target, args: ConstructorParameters<typeof WebSocket>) {
    const url = String(args[0]);
    return /^wss?:\/\/(api\/|\/)/.test(url) || url.includes('/api/') ? new QuietSocket(url) as unknown as WebSocket : new target(...args);
  },
});

const native = window.fetch.bind(window);

window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const at = raw.indexOf('/api/');
  const own = raw.startsWith('/api/') || (raw.startsWith('file:') && at >= 0);
  if (!own) return native(input, init);
  return route(raw.slice(at + 4).split('?')[0], init);
};
