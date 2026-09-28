import type { Engine } from '../engine';
import type { GpuRenderer } from '../gpu/probe';

/** Preferences that change how formvis works, kept on this device, as Photoshop's Preferences are. Every one acts on
 *  something real: History States and history memory are the undo limits every project uses; region redraws decide
 *  whether a brush stroke repaints only what it changed; the recovery delay is how soon after a change unsaved work is
 *  kept for crash recovery. The graphics processor settings choose the renderer (Phase 18). */
export interface Prefs { nodemodeUrl: string; historyStates: number; historyMB: number; regionRedraws: boolean; recoverySeconds: number; autoShowHome: boolean; useGpu: boolean; renderer: GpuRenderer; gpuMemoryMB: number; engineDevice: EngineDevice;
  /* Photoshop's sections (the owner's walkthrough): Tools, History & Cache, Workspace, Cursors, Transparency & Gamut,
     Units & Rulers, Guides & Grid; every one acts on something real. */
  zoomWheel: boolean; autoFirstSnapshot: boolean; snapshotMB: number; narrowCollapse: boolean;
  paintCursor: PaintCursor; cursorCrosshair: boolean; checkerSize: CheckerSize; checkerColors: CheckerColors;
  rulerUnits: RulerUnits; guideColor: string; gridColor: string; gridSpacing: number; gridSubdivisions: number }
export type PaintCursor = 'tip' | 'precise' | 'standard';
export type CheckerSize = 'none' | 'small' | 'medium' | 'large';
export type CheckerColors = 'light' | 'medium' | 'dark';
export type RulerUnits = 'px' | 'in' | 'cm' | 'mm' | '%';
export const PAINT_CURSORS: ReadonlyArray<readonly [PaintCursor, string]> = [['tip', 'Normal Brush Tip'], ['precise', 'Precise'], ['standard', 'Standard']];
export const CHECKER_SIZES: ReadonlyArray<readonly [CheckerSize, string]> = [['none', 'None'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']];
export const CHECKER_COLORS: ReadonlyArray<readonly [CheckerColors, string]> = [['light', 'Light'], ['medium', 'Medium'], ['dark', 'Dark']];
export const RULER_UNITS: ReadonlyArray<readonly [RulerUnits, string]> = [['px', 'Pixels'], ['in', 'Inches'], ['cm', 'Centimeters'], ['mm', 'Millimeters'], ['%', 'Percent']];
/** The checkerboard's cell in screen pixels, and its two colours, as Photoshop's Transparency settings. */
export const CHECKER_CELL: Record<CheckerSize, number> = { none: 8, small: 4, medium: 8, large: 16 };
export const CHECKER_PAIR: Record<CheckerColors, readonly [string, string]> = { light: ['#ffffff', '#cccccc'], medium: ['#cccccc', '#999999'], dark: ['#666666', '#999999'] };

/** The engine's compute device (Phase 18.6), sent to the engine, which reports what it uses. */
export type EngineDevice = 'auto' | 'metal' | 'cuda' | 'cpu';
export const ENGINE_CHOICES: ReadonlyArray<readonly [EngineDevice, string]> = [['auto', 'Automatic'], ['metal', 'Metal (Core ML)'], ['cuda', 'CUDA'], ['cpu', 'CPU']];

export const DEFAULT_PREFS: Prefs = { nodemodeUrl: 'http://localhost:8000', historyStates: 100, historyMB: 256, regionRedraws: true, recoverySeconds: 20, autoShowHome: true, useGpu: true, renderer: 'auto', gpuMemoryMB: 1024, engineDevice: 'auto',
  zoomWheel: false, autoFirstSnapshot: true, snapshotMB: 768, narrowCollapse: true, paintCursor: 'tip', cursorCrosshair: false,
  checkerSize: 'medium', checkerColors: 'light', rulerUnits: 'px', guideColor: '', gridColor: '', gridSpacing: 100, gridSubdivisions: 4 };
export const RECOVERY_CHOICES: ReadonlyArray<readonly [string, string]> = [['10', '10 seconds'], ['20', '20 seconds'], ['60', '1 minute'], ['300', '5 minutes'], ['600', '10 minutes']];
const KEY = 'formvis.prefs';

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
      nodemodeUrl: typeof r.nodemodeUrl === 'string' && /^https?:\/\/./.test(r.nodemodeUrl) ? r.nodemodeUrl.slice(0, 300) : DEFAULT_PREFS.nodemodeUrl,   // Preferences > Plugins (1.50.8)
      useGpu: typeof r.useGpu === 'boolean' ? r.useGpu : DEFAULT_PREFS.useGpu,
      renderer: r.renderer === 'webgpu' || r.renderer === 'webgl2' || r.renderer === 'cpu' || r.renderer === 'auto' || r.renderer === 'native' ? r.renderer : DEFAULT_PREFS.renderer,
      gpuMemoryMB: Math.round(num(r.gpuMemoryMB, 128, 16384, DEFAULT_PREFS.gpuMemoryMB)),
      engineDevice: ENGINE_CHOICES.some(([k]) => k === r.engineDevice) ? r.engineDevice as EngineDevice : DEFAULT_PREFS.engineDevice,
      zoomWheel: typeof r.zoomWheel === 'boolean' ? r.zoomWheel : DEFAULT_PREFS.zoomWheel,
      autoFirstSnapshot: typeof r.autoFirstSnapshot === 'boolean' ? r.autoFirstSnapshot : DEFAULT_PREFS.autoFirstSnapshot,
      snapshotMB: Math.round(num(r.snapshotMB, 64, 8192, DEFAULT_PREFS.snapshotMB)),
      narrowCollapse: typeof r.narrowCollapse === 'boolean' ? r.narrowCollapse : DEFAULT_PREFS.narrowCollapse,
      paintCursor: PAINT_CURSORS.some(([k]) => k === r.paintCursor) ? r.paintCursor as PaintCursor : DEFAULT_PREFS.paintCursor,
      cursorCrosshair: typeof r.cursorCrosshair === 'boolean' ? r.cursorCrosshair : DEFAULT_PREFS.cursorCrosshair,
      checkerSize: CHECKER_SIZES.some(([k]) => k === r.checkerSize) ? r.checkerSize as CheckerSize : DEFAULT_PREFS.checkerSize,
      checkerColors: CHECKER_COLORS.some(([k]) => k === r.checkerColors) ? r.checkerColors as CheckerColors : DEFAULT_PREFS.checkerColors,
      rulerUnits: RULER_UNITS.some(([k]) => k === r.rulerUnits) ? r.rulerUnits as RulerUnits : DEFAULT_PREFS.rulerUnits,
      guideColor: typeof r.guideColor === 'string' && /^(#[0-9a-f]{6})?$/i.test(r.guideColor) ? r.guideColor : DEFAULT_PREFS.guideColor,
      gridColor: typeof r.gridColor === 'string' && /^(#[0-9a-f]{6})?$/i.test(r.gridColor) ? r.gridColor : DEFAULT_PREFS.gridColor,
      gridSpacing: Math.round(num(r.gridSpacing, 2, 5000, DEFAULT_PREFS.gridSpacing)),
      gridSubdivisions: Math.round(num(r.gridSubdivisions, 1, 64, DEFAULT_PREFS.gridSubdivisions)),
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
  engine.autoFirstSnapshot = p.autoFirstSnapshot;
  engine.snapshotByteLimit = p.snapshotMB * 1024 * 1024;
  engine.view = { ...engine.view, gridSpacing: p.gridSpacing, gridSubdivisions: p.gridSubdivisions };
  engine.cursorPrefs = { paint: p.paintCursor, crosshair: p.cursorCrosshair };
  engine.emit('overlay', null);
}
