import { VERSION } from '../../../frontend/src/version';

const NEEDS = 'This needs the desktop engine. The demo runs the picture engine in the page; saving to the library, camera raw, colour conversion, local models, video and agents belong to the desktop app.';

const answer = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

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

const route = (path: string): Response => {
  if (path === '/capabilities') return answer(capabilities);
  if (path in empty) return answer(empty[path]);
  return answer({ detail: NEEDS }, 503);
};

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
  const path = raw.slice(at + 4).split('?')[0];
  return Promise.resolve(route(path));
};
