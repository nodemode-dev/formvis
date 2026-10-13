import type { Engine } from '../engine';
import type { GpuRenderer } from '../gpu/probe';
import { DEFAULT_COLOUR, cleanColour, cleanPresets, type ColourPreset, type ColourSettings, type MismatchPref } from './colour-settings';

/** Preferences that change how formvis works, kept on this device, as Photoshop's Preferences are. Every one acts on
 *  something real: History States and history memory are the undo limits every project uses; region redraws decide
 *  whether a brush stroke repaints only what it changed; the recovery delay is how soon after a change unsaved work is
 *  kept for crash recovery. The graphics processor settings choose the renderer (Phase 18). */
export interface Prefs { profileMismatch: MismatchPref; colour: ColourSettings; colourPresets: ColourPreset[]; shortcuts: Record<string, string[]>; restoreSession: boolean; agentsAllowed: boolean; comfyuiUrl: string; nodemodeUrl: string; historyStates: number; historyMB: number; historyAuto: boolean; regionRedraws: boolean; recoverySeconds: number; autoShowHome: boolean; useGpu: boolean; renderer: GpuRenderer; gpuMemoryMB: number; engineDevice: EngineDevice;
  /* Photoshop's sections (the owner's walkthrough): Tools, History & Cache, Workspace, Cursors, Transparency & Gamut,
     Units & Rulers, Guides & Grid; every one acts on something real. */
  zoomWheel: boolean; autoFirstSnapshot: boolean; snapshotMB: number; narrowCollapse: boolean;
  paintCursor: PaintCursor; cursorCrosshair: boolean; checkerSize: CheckerSize; checkerColors: CheckerColors;
  rulerUnits: RulerUnits; guideColor: string; gridColor: string; gridSpacing: number; gridSubdivisions: number;
  /* The workspace charter (DEV_PLAN 35.1): the Home screen when the last document closes, What's New after an update,
     and the values that stick: every tool option, and each dialog's last controls. */
  homeOnLastClose: boolean; whatsNewAuto: boolean; whatsNewSeen: string;
  toolOptions: Record<string, ToolOptionValue>; dialogValues: Record<string, Record<string, DialogValue>> }
export type ToolOptionValue = string | number | boolean;
export type DialogValue = string | boolean;
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

export const DEFAULT_PREFS: Prefs = { profileMismatch: 'convert', colour: DEFAULT_COLOUR, colourPresets: [], shortcuts: {}, restoreSession: true, agentsAllowed: false, comfyuiUrl: 'http://127.0.0.1:8188', nodemodeUrl: 'http://localhost:8000', historyStates: 100, historyMB: 256, historyAuto: true, regionRedraws: true, recoverySeconds: 20, autoShowHome: true, useGpu: true, renderer: 'auto', gpuMemoryMB: 1024, engineDevice: 'auto',
  zoomWheel: false, autoFirstSnapshot: true, snapshotMB: 768, narrowCollapse: true, paintCursor: 'tip', cursorCrosshair: false,
  checkerSize: 'medium', checkerColors: 'light', rulerUnits: 'px', guideColor: '', gridColor: '', gridSpacing: 100, gridSubdivisions: 4,
  homeOnLastClose: false, whatsNewAuto: true, whatsNewSeen: '', toolOptions: {}, dialogValues: {} };
export const RECOVERY_CHOICES: ReadonlyArray<readonly [string, string]> = [['10', '10 seconds'], ['20', '20 seconds'], ['60', '1 minute'], ['300', '5 minutes'], ['600', '10 minutes']];
const KEY = 'formvis.prefs';

const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Tool options by `tool.option`, oldest change first (the order they are put back in); only scalars are kept. */
function cleanToolOptions(v: unknown): Record<string, ToolOptionValue> {
  const out: Record<string, ToolOptionValue> = {};
  if (!plain(v)) return out;
  for (const [k, x] of Object.entries(v).slice(0, 600)) if (typeof x === 'string' ? x.length <= 200 : typeof x === 'boolean' || (typeof x === 'number' && Number.isFinite(x))) out[k.slice(0, 120)] = x as ToolOptionValue;
  return out;
}

/** Each dialog's last control values, by dialog and control name. */
function cleanDialogValues(v: unknown): Record<string, Record<string, DialogValue>> {
  const out: Record<string, Record<string, DialogValue>> = {};
  if (!plain(v)) return out;
  for (const [d, vals] of Object.entries(v).slice(0, 200)) {
    if (!plain(vals)) continue;
    const row: Record<string, DialogValue> = {};
    for (const [k, x] of Object.entries(vals).slice(0, 80)) if ((typeof x === 'string' && x.length <= 2000) || typeof x === 'boolean') row[k.slice(0, 120)] = x;
    out[d.slice(0, 120)] = row;
  }
  return out;
}

export function loadPrefs(): Prefs {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<keyof Prefs, unknown>>;
    return {
      historyStates: Math.round(num(r.historyStates, 1, 1000, DEFAULT_PREFS.historyStates)),
      historyMB: Math.round(num(r.historyMB, 16, 4096, DEFAULT_PREFS.historyMB)),
      historyAuto: typeof r.historyAuto === 'boolean' ? r.historyAuto : DEFAULT_PREFS.historyAuto,   // 1.61.3
      regionRedraws: typeof r.regionRedraws === 'boolean' ? r.regionRedraws : DEFAULT_PREFS.regionRedraws,
      recoverySeconds: Math.round(num(r.recoverySeconds, 5, 3600, DEFAULT_PREFS.recoverySeconds)),
      autoShowHome: typeof r.autoShowHome === 'boolean' ? r.autoShowHome : DEFAULT_PREFS.autoShowHome,
      // Rebound keys (1.53.4): command id to its combinations, only strings kept.
      shortcuts: r.shortcuts && typeof r.shortcuts === 'object' ? Object.fromEntries(Object.entries(r.shortcuts as Record<string, unknown>).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).filter((x): x is string => typeof x === 'string')])) : {},
      profileMismatch: r.profileMismatch === 'keep' || r.profileMismatch === 'ask' || r.profileMismatch === 'discard' ? r.profileMismatch : 'convert',   // 1.53.5
      colour: cleanColour(r.colour),
      colourPresets: cleanPresets(r.colourPresets),
      restoreSession: r.restoreSession !== false,   // Preferences > File Handling, on unless turned off (1.52.4)
      agentsAllowed: r.agentsAllowed === true,   // Preferences > Plugins, off unless turned on (1.52.1)
      comfyuiUrl: typeof r.comfyuiUrl === 'string' && /^https?:\/\/./.test(r.comfyuiUrl) ? r.comfyuiUrl.slice(0, 300) : DEFAULT_PREFS.comfyuiUrl,   // Preferences > Plugins (1.50.9)
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
      homeOnLastClose: typeof r.homeOnLastClose === 'boolean' ? r.homeOnLastClose : DEFAULT_PREFS.homeOnLastClose,
      whatsNewAuto: typeof r.whatsNewAuto === 'boolean' ? r.whatsNewAuto : DEFAULT_PREFS.whatsNewAuto,
      whatsNewSeen: typeof r.whatsNewSeen === 'string' ? r.whatsNewSeen.slice(0, 32) : DEFAULT_PREFS.whatsNewSeen,
      toolOptions: cleanToolOptions(r.toolOptions),
      dialogValues: cleanDialogValues(r.dialogValues),
    };
  } catch { return { ...DEFAULT_PREFS }; }
}

export function savePrefs(p: Prefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* kept for this session only */ }
}

/** A value a dialog kept under `name` (see `Dialog.remember`), for dialogs that hold their settings as an object. */
export const recalled = (dialog: string, name: string): DialogValue | undefined => loadPrefs().dialogValues[dialog]?.[name];

/** Keeps `value` for a dialog under `name`; nothing is written when it is already what is kept. */
export function remembered(dialog: string, name: string, value: DialogValue): void {
  const cur = loadPrefs().dialogValues;
  if (cur[dialog]?.[name] === value) return;
  updatePrefs({ dialogValues: { ...cur, [dialog]: { ...cur[dialog], [name]: value } } });
}

/** Changes some preferences and keeps them: what a tool option, a dialog or What's New remembers goes through here. */
export function updatePrefs(patch: Partial<Prefs>): Prefs {
  const p = { ...loadPrefs(), ...patch };
  savePrefs(p);
  return p;
}

/** Puts the engine-side preferences into effect; the recovery delay is read by the app when it schedules a save. */
export function applyPrefs(engine: Engine, p: Prefs): void {
  engine.setHistoryLimits(p.historyStates, p.historyAuto ? null : p.historyMB * 1024 * 1024);   // automatic: from the memory budget (1.61.3)
  engine.dirtyRendering = p.regionRedraws;
  engine.autoFirstSnapshot = p.autoFirstSnapshot;
  engine.snapshotByteLimit = p.snapshotMB * 1024 * 1024;
  engine.view = { ...engine.view, gridSpacing: p.gridSpacing, gridSubdivisions: p.gridSubdivisions };
  engine.cursorPrefs = { paint: p.paintCursor, crosshair: p.cursorCrosshair };
  engine.emit('overlay', null);
}
