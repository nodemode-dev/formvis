/** Graphics processor detection and the choice of renderer (Phase 18.1), for Preferences > Performance: the detected processor is named, Use Graphics Processor
 *  is on when one is usable, a failed start turns it off, and the mode in use is shown. WebGPU maps to Metal on macOS
 *  and Direct3D 12 on Windows; WebGL2 is the path on Linux, whose desktop webview has no WebGPU. The GPU is asked for
 *  with the high-performance preference, so a machine with integrated and discrete (NVIDIA) GPUs reports the discrete
 *  one. Rendering itself still runs on the CPU until the GPU renderer (Phase 18.2) uses this choice. */

export type GpuRenderer = 'auto' | 'webgpu' | 'webgl2' | 'cpu' | 'native';
export type GpuMode = 'webgpu' | 'webgl2' | 'cpu' | 'native';
export interface GpuAdapter { api: 'webgpu' | 'webgl2'; name: string; software: boolean; maxTexture: number }
/** `native`: running as the desktop app, whose shell can host the native GPU renderer (Phase 20). */
export interface GpuProbe { webgpu: GpuAdapter | null; webgl2: GpuAdapter | null; native?: boolean }
export interface GpuChoice { mode: GpuMode; adapter: GpuAdapter | null; reason: string }

/** Which graphics processor the page asks for on a computer with two, and the low-latency canvas hint; both are read when a
 *  display starts, so a change applies at the next launch. */
export type GpuPower = 'high-performance' | 'low-power' | 'default';
export interface DisplayOptions { power: GpuPower; lowLatency: boolean }
export const POWER_CHOICES: ReadonlyArray<readonly [GpuPower, string]> = [['high-performance', 'High performance'], ['low-power', 'Low power'], ['default', 'System default']];

export const RENDERER_CHOICES: ReadonlyArray<readonly [GpuRenderer, string]> = [['auto', 'Automatic'], ['webgpu', 'WebGPU'], ['webgl2', 'WebGL2'], ['native', 'Native GPU (desktop app)'], ['cpu', 'CPU']];

/** Software rasterisers: a GPU API on the CPU, slower than drawing on the CPU directly. */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|software|microsoft basic render/i;
export const isSoftware = (name: string): boolean => SOFTWARE.test(name);

interface AdapterLike { info?: { vendor?: string; architecture?: string; description?: string }; isFallbackAdapter?: boolean; limits: { maxTextureDimension2D: number } }
interface GpuLike { requestAdapter(o: { powerPreference: 'high-performance' }): Promise<AdapterLike | null> }

export async function probeGpu(): Promise<GpuProbe> {
  let webgpu: GpuAdapter | null = null;
  try {
    const gpu = (navigator as unknown as { gpu?: GpuLike }).gpu;
    const a = gpu ? await gpu.requestAdapter({ powerPreference: 'high-performance' }) : null;
    if (a) {
      const i = a.info ?? {}, name = [i.vendor, i.architecture, i.description].filter(Boolean).join(' ') || 'WebGPU adapter';
      webgpu = { api: 'webgpu', name, software: !!a.isFallbackAdapter || isSoftware(name), maxTexture: a.limits.maxTextureDimension2D };
    }
  } catch { webgpu = null; }
  let webgl2: GpuAdapter | null = null;
  try {
    const gl = document.createElement('canvas').getContext('webgl2', { powerPreference: 'high-performance' });
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const name = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      webgl2 = { api: 'webgl2', name, software: isSoftware(name), maxTexture: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) };
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { webgl2 = null; }
  return { webgpu, webgl2, native: '__TAURI_INTERNALS__' in window };
}

/** Automatic takes WebGPU, then WebGL2, on a hardware GPU only: a software rasteriser is slower than drawing on the
 *  CPU. A renderer named in Preferences is used when present, software or not, and otherwise the other GPU API, then
 *  the CPU. Every choice carries its reason, shown with the mode. */
export function chooseRenderer(p: GpuProbe, use: boolean, want: GpuRenderer): GpuChoice {
  if (!use) return { mode: 'cpu', adapter: null, reason: 'Use Graphics Processor is off' };
  if (want === 'cpu') return { mode: 'cpu', adapter: null, reason: 'the CPU renderer is chosen in Preferences' };
  // The native GPU renderer (Phase 20) only when chosen, and only in the desktop app; Automatic never picks it until it
  // is verified on real hardware.
  if (want === 'native' && p.native) return { mode: 'native', adapter: null, reason: 'chosen in Preferences' };
  if (want === 'webgpu' && p.webgpu) return { mode: 'webgpu', adapter: p.webgpu, reason: 'chosen in Preferences' };
  if (want === 'webgl2' && p.webgl2) return { mode: 'webgl2', adapter: p.webgl2, reason: 'chosen in Preferences' };
  const order = want === 'webgl2' ? [p.webgl2, p.webgpu] : [p.webgpu, p.webgl2];
  const hardware = order.find((a): a is GpuAdapter => !!a && !a.software);
  const unavailable = want === 'native' ? 'the native GPU renderer is only in the desktop app' : `${want === 'webgpu' ? 'WebGPU' : 'WebGL2'} is not available here`;
  if (hardware) return { mode: hardware.api, adapter: hardware, reason: want === 'auto' ? 'automatic' : unavailable };
  const why = p.webgpu || p.webgl2 ? 'only a software GPU was found, which is slower than the CPU renderer' : 'no graphics processor was found';
  return { mode: 'cpu', adapter: null, reason: want === 'native' ? `the native GPU renderer is only in the desktop app, and ${why}` : why };
}

export const modeLabel = (m: GpuMode): string => (m === 'webgpu' ? 'WebGPU' : m === 'webgl2' ? 'WebGL2' : m === 'native' ? 'Native GPU' : 'CPU');

/** The processor named for Preferences: the hardware one first, then any. */
export function detectedName(p: GpuProbe): string | null {
  const a = [p.webgpu, p.webgl2].find((x) => x && !x.software) ?? p.webgpu ?? p.webgl2;
  return a ? `${a.name}${a.software ? ' (software)' : ''}` : null;
}

/** A start that never finished: set before the GPU is touched, cleared once it answers. Found set at the next launch,
 *  it means the last start crashed or hung, and Use Graphics Processor is turned off. */
const STARTING = 'formvis.gpu.starting';
export function gpuStartFailedLastTime(): boolean { try { return localStorage.getItem(STARTING) === '1'; } catch { return false; } }
export function markGpuStarting(): void { try { localStorage.setItem(STARTING, '1'); } catch { /* no storage, no marker */ } }
export function markGpuStarted(): void { try { localStorage.removeItem(STARTING); } catch { /* no storage, no marker */ } }
