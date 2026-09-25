import type { Engine } from '../engine';
import type { GpuRenderer } from '../gpu/probe';

/** Preferences that change how sonny works, kept on this device, as Photoshop's Preferences are. Every one acts on
 *  something real: History States and history memory are the undo limits every project uses; region redraws decide
 *  whether a brush stroke repaints only what it changed; the recovery delay is how soon after a change unsaved work is
 *  kept for crash recovery. The graphics processor settings choose the renderer (Phase 18). */
export interface Prefs { historyStates: number; historyMB: number; regionRedraws: boolean; recoverySeconds: number; autoShowHome: boolean; useGpu: boolean; renderer: GpuRenderer; gpuMemoryMB: number; engineDevice: EngineDevice }

/** The engine's compute device (Phase 18.6), sent to the engine, which reports what it uses. */
export type EngineDevice = 'auto' | 'metal' | 'cuda' | 'cpu';
export const ENGINE_CHOICES: ReadonlyArray<readonly [EngineDevice, string]> = [['auto', 'Automatic'], ['metal', 'Metal (Core ML)'], ['cuda', 'CUDA'], ['cpu', 'CPU']];

export const DEFAULT_PREFS: Prefs = { historyStates: 100, historyMB: 256, regionRedraws: true, recoverySeconds: 20, autoShowHome: true, useGpu: true, renderer: 'auto', gpuMemoryMB: 1024, engineDevice: 'auto' };
export const RECOVERY_CHOICES: ReadonlyArray<readonly [string, string]> = [['10', '10 seconds'], ['20', '20 seconds'], ['60', '1 minute'], ['300', '5 minutes'], ['600', '10 minutes']];
const KEY = 'sonny.prefs';

const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

export function loadPrefs(): Prefs {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<keyof Prefs, unknown>>;
    return {
      historyStates: Math.round(num(r.historyStates, 1, 1000, DEFAULT_PREFS.historyStates)),
      historyMB: Math.round(num(r.historyMB, 16, 4096, DEFAULT_PREFS.historyMB)),
      regionRedraws: typeof r.regionRedraws === 'boolean' ? r.regionRedraws : DEFAULT_PREFS.regionRedraws,
      recoverySeconds: Math.round(num(r.recoverySeconds, 5, 3600, DEFAULT_PREFS.recoverySeconds)),
      autoShowHome: typeof r.autoShowHome === 'boolean' ? r.autoShowHome : DEFAULT_PREFS.autoShowHome,
      useGpu: typeof r.useGpu === 'boolean' ? r.useGpu : DEFAULT_PREFS.useGpu,
      renderer: r.renderer === 'webgpu' || r.renderer === 'webgl2' || r.renderer === 'cpu' || r.renderer === 'auto' ? r.renderer : DEFAULT_PREFS.renderer,
      gpuMemoryMB: Math.round(num(r.gpuMemoryMB, 128, 16384, DEFAULT_PREFS.gpuMemoryMB)),
      engineDevice: ENGINE_CHOICES.some(([k]) => k === r.engineDevice) ? r.engineDevice as EngineDevice : DEFAULT_PREFS.engineDevice,
    };
  } catch { return { ...DEFAULT_PREFS }; }
}

export function savePrefs(p: Prefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* kept for this session only */ }
}

/** Puts the engine-side preferences into effect; the recovery delay is read by the app when it schedules a save. */
export function applyPrefs(engine: Engine, p: Prefs): void {
  engine.setHistoryLimits(p.historyStates, p.historyMB * 1024 * 1024);
  engine.dirtyRendering = p.regionRedraws;
}
