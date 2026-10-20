import type { Mat } from '../engine/geometry';
import { BLEND_IDS } from './blend-wgsl';
import type { Checker, DisplayLayer, ScreenDisplay } from './display';

/** The native GPU renderer (Phase 20) as a screen display, for the desktop app: the shell's formvis-render draws the
 *  document into the window's own GPU surface (Metal, Vulkan, Direct3D 12) beneath the web view, and this display keeps
 *  its mirror of the document up to date. Each image, mask and table gets a stable id and is sent again only when its
 *  version changes, as raw bytes; then the stack and the view. Draw requests while one is in flight are coalesced to the
 *  latest, so a slow frame never queues up more. What the native renderer cannot draw yet (folders with their own
 *  blend modes beyond those measured, masked folders with clipped layers) is named by unsupported(), and the stage draws on the CPU with that reason. */

type Invoke = <T>(cmd: string, args?: unknown, options?: { headers: Record<string, string> }) => Promise<T>;
type Img = HTMLCanvasElement | OffscreenCanvas;

interface Frame { layers: readonly DisplayLayer[]; view: Mat; checker: Checker; doc: { width: number; height: number } }

const isIdentity = (m: Mat): boolean => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
/** formvis's canvas matrix [a, b, c, d, e, f] (x' = a x + c y + e) as the renderer's [a, b, c, d, e, f] (x' = a x + b y + c). */
const affine = (m: Mat): number[] | null => (isIdentity(m) ? null : [m[0], m[2], m[4], m[1], m[3], m[5]]);

/** The blend modes a folder composited alone was measured in within two levels of the CPU renderer. */
const GROUP_BLENDS: ReadonlySet<string> = new Set(['normal', 'multiply', 'screen', 'lighten', 'luminosity', 'soft-light', 'linear-burn', 'subtract', 'color', 'negation', 'overlay', 'difference', 'darken', 'exclusion', 'hard-light', 'color-dodge', 'linear-light', 'pin-light', 'divide', 'glow', 'hue', 'saturation', 'color-burn', 'reflect', 'vivid-light']);

/** The folder blend modes a folder holding clipped layers was measured in within two levels of the CPU renderer. */
const CLIPPED_GROUP_BLENDS: ReadonlySet<string> = new Set(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'luminosity', 'color', 'hue', 'difference']);

/** The blend modes of a clipped layer inside a Hue folder that were measured within two levels of the CPU renderer. */
const HUE_CLIPPED_CHILD: ReadonlySet<string> = new Set(['multiply', 'overlay', 'hue', 'difference', 'darken', 'lighten']);

const foldersWithin =(list: readonly DisplayLayer[]): boolean => list.some((x) => !!x.folders?.length || (!!x.sub && foldersWithin(x.sub)));

export class NativeDisplay implements ScreenDisplay {
  onLost: (() => void) | null = null;
  /** The native renderer tiles layers, so no texture size limits them. */
  readonly maxTexture = Number.MAX_SAFE_INTEGER;
  readonly api = 'native' as const;
  private readonly ids = new WeakMap<object, string>();
  private readonly sent = new WeakMap<object, number>();
  private next = 1;
  private docSize = '';
  private busy = false;
  private pending: Frame | null = null;
  private dead = false;

  private constructor(readonly canvas: HTMLCanvasElement, private readonly invoke: Invoke, readonly adapter: string) {}

  /** Starts the native canvas in the desktop app's window; null outside the desktop app or when the shell cannot. */
  static async create(canvas: HTMLCanvasElement): Promise<NativeDisplay | null> {
    if (!('__TAURI_INTERNALS__' in window)) return null;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const adapter = await invoke<string>('native_start');
      document.documentElement.classList.add('is-native-canvas');
      return new NativeDisplay(canvas, invoke as Invoke, adapter);
    } catch {
      return null;
    }
  }

  unsupported(layers: readonly DisplayLayer[]): string | null {
    for (const l of layers) {
      for (let c = l.clip; c; c = c.parent) {
        const m = c.matrix;
        if (m[0] !== 1 || m[1] !== 0 || m[2] !== 0 || m[3] !== 1 || m[4] !== 0 || m[5] !== 0) return 'a clipped layer whose base layer is moved, scaled or placed, which the native renderer does not position yet';
      }
      if (l.ko) {
        const back = this.unsupported(l.ko.back);
        if (back) return back;
      }
      if (l.sub) {
        if (l.sub.some((x) => x.clip)) {
          if (!CLIPPED_GROUP_BLENDS.has(l.blend)) return 'a folder with clipped layers in a blend mode the native renderer does not match the CPU in yet';
          if (l.blend === 'hue' && l.sub.some((x) => x.clip && !HUE_CLIPPED_CHILD.has(x.blend))) return 'a Hue folder with a clipped layer in a blend mode the native renderer does not match the CPU in yet';
          if (l.mask || foldersWithin(l.sub)) return 'a masked folder with clipped layers, which the native renderer does not match the CPU in within two levels yet';
        }
        if (!GROUP_BLENDS.has(l.blend)) return 'a folder in a blend mode the native renderer does not match the CPU in yet';
        const inner = this.unsupported(l.sub);
        if (inner) return inner;
        continue;
      }
      if (l.hood && l.blend !== 'normal') return 'a Shadows/Highlights, HDR Toning or Clarity adjustment layer in a blend mode of its own, which the native renderer does not match the CPU in yet';
      if (l.hood && this.docDims && Math.max(this.docDims.width, this.docDims.height) > 8192) return 'a Shadows/Highlights or Clarity adjustment on a document over 8,192 pixels a side, which the native renderer does not blur yet';
      if (!l.image && !l.lut && !l.grain && !l.hood && l.threshold === undefined) return 'an adjustment layer the native renderer does not draw yet';
      if (l.blendIf && (!l.image || l.blendIf.channel > 4)) return 'a layer has Blend If on a channel or an adjustment limit, which the native renderer does not match the CPU in yet';
    }
    return null;
  }

  private docDims: { width: number; height: number } | null = null;

  document(width: number, height: number): void {
    this.docDims = { width, height };
  }

  render(layers: readonly DisplayLayer[], view: Mat, _zoom: number, _rect: [number, number, number, number], checker: Checker): void {
    const doc = this.docDims;
    if (this.dead || !doc) return;
    this.pending = { layers, view, checker, doc };
    if (!this.busy) void this.drain();
  }

  destroy(): void {
    this.dead = true;
    document.documentElement.classList.remove('is-native-canvas');
    void this.invoke('native_stop').catch(() => undefined);
  }

  private id(o: object): string {
    let v = this.ids.get(o);
    if (!v) { v = `n${this.next++}`; this.ids.set(o, v); }
    return v;
  }

  private async drain(): Promise<void> {
    this.busy = true;
    try {
      while (this.pending && !this.dead) {
        const f = this.pending;
        this.pending = null;
        await this.frame(f);
      }
    } catch {
      this.dead = true;
      this.onLost?.();
    } finally {
      this.busy = false;
    }
  }

  /** Sends an image's pixels when its version has changed since it was last sent. */
  private async put(img: Img, version: number): Promise<string> {
    const id = this.id(img);
    if (this.sent.get(img) === version) return id;
    const w = img.width, h = img.height;
    const ctx = img.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx || !w || !h) return id;
    const bytes = new Uint8Array(ctx.getImageData(0, 0, w, h).data.buffer);
    const s = String;
    await this.invoke('native_put', bytes, { headers: { 'x-id': id, 'x-lw': s(w), 'x-lh': s(h), 'x-x': '0', 'x-y': '0', 'x-w': s(w), 'x-h': s(h) } });
    this.sent.set(img, version);
    return id;
  }

  private async frame(f: Frame): Promise<void> {
    const size = `${f.doc.width}x${f.doc.height}`;
    if (size !== this.docSize) {
      await this.invoke('native_doc', { width: f.doc.width, height: f.doc.height });
      this.docSize = size;
    }
    await this.invoke('native_stack', { stack: await this.entries(f.layers) });
    await this.present(f);
  }

  private async entries(layers: readonly DisplayLayer[]): Promise<Record<string, unknown>[]> {
    const stack: Record<string, unknown>[] = [];
    for (const l of layers) {
      const entry: Record<string, unknown> = { id: '', mode: Math.max(0, BLEND_IDS.indexOf(l.blend)), opacity: l.opacity, visible: true, transform: null, mask: null, maskTransform: null, clipTo: null, table: null, threshold: null };
      if (l.sub) {
        entry.group = await this.entries(l.sub);
        stack.push(entry);
        continue;
      }
      if (l.lut) {
        const table = this.id(l.lut);
        if (this.sent.get(l.lut) !== l.version) {
          if (l.lut3) {
            await this.invoke('native_table3', new Uint8Array(l.lut.buffer, l.lut.byteOffset, l.lut.byteLength), { headers: { 'x-id': table } });
          } else {
            const pick = (c: number): number[] => Array.from({ length: 256 }, (_, i) => l.lut![i * 4 + c]);
            await this.invoke('native_table', { id: table, red: pick(0), green: pick(1), blue: pick(2) });
          }
          this.sent.set(l.lut, l.version);
        }
        entry.id = table;
        entry.table = table;
      } else if (l.hood) {
        entry.hood = { kind: l.hood.kind, rgb: l.hood.rgb, radii: l.hood.radii.map((r) => [r[0], r[1]]), p: Array.from(l.hood.p) };
      } else if (l.grain) {
        entry.grain = l.grain;
      } else if (l.threshold !== undefined) {
        entry.threshold = l.threshold;
      } else if (l.image) {
        entry.id = await this.put(l.image, l.version);
        entry.transform = affine(l.matrix);
      } else continue;
      if (l.mask) {
        entry.mask = await this.put(l.mask.image, l.mask.version);
        entry.maskTransform = affine(l.mask.matrix);
      }
      if (l.folders?.length) {
        const chain: [string, number[] | null][] = [];
        for (const f of l.folders) chain.push([await this.put(f.image, f.version), affine(f.matrix)]);
        entry.folders = chain;
      }
      if (l.clip) entry.clipTo = await this.put(l.clip.image, l.clip.version);
      if (l.blendIf) entry.blendIf = { channel: l.blendIf.channel, thisLayer: Array.from(l.blendIf.thisLayer), underlying: Array.from(l.blendIf.underlying) };
      if (l.chOff) entry.chOff = l.chOff;
      if (l.ko) entry.knockout = { opacity: l.ko.opacity, back: await this.entries(l.ko.back) };
      stack.push(entry);
    }
    return stack;
  }

  private async present(f: Frame): Promise<void> {
    // The stage's view is in its canvas's device pixels; the window surface is the whole window's.
    const r = this.canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const c = f.checker;
    await this.invoke('native_present', {
      panX: r.left * dpr + f.view[4], panY: r.top * dpr + f.view[5], zoom: f.view[0],
      checkerA: c.a.map((v) => v / 255), checkerB: c.b.map((v) => v / 255), checkerCell: c.cell,
    });
  }
}
