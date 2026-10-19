import type { Engine, ResampleMethod } from '../engine';
import { previewMode } from '../engine/image-edit';
import { renderCache } from '../engine/renderer';
import { TILE_SIZES, setTileSize } from '../engine/tiled';
import { setBandThreads } from '../engine/band-pool';
import { framePacing } from '../gpu/frame-trace';
import { api } from '../io/api';
import { gamutWarning } from '../engine/colour-lut';
import { slicePrefs } from '../extensions/tools/slice';
import type { RawSharpen, RawSharpenAmount } from '../io/raw-sharpen';
import { isLang, type Lang } from './i18n/langs';
import type { GpuPower, GpuRenderer } from '../gpu/probe';
import { DEFAULT_COLOUR, cleanColour, cleanPresets, type ColourPreset, type ColourSettings, type MismatchPref } from './colour-settings';

/** Preferences that change how formvis works, kept on this device. Every one acts on
 *  something real: History States and history memory are the undo limits every project uses; region redraws decide
 *  whether a brush stroke repaints only what it changed; the recovery delay is how soon after a change unsaved work is
 *  kept for crash recovery. The graphics processor settings choose the renderer (Phase 18). */
export interface Prefs extends PagePrefs { language: Lang; profileMismatch: MismatchPref; colour: ColourSettings; colourPresets: ColourPreset[]; shortcuts: Record<string, string[]>; restoreSession: boolean; agentsAllowed: boolean; comfyuiUrl: string; nodemodeUrl: string; historyStates: number; historyMB: number; historyAuto: boolean; memoryLimitMB: number; effectCacheMB: number; backgroundReleaseSec: number; cacheLevels: number; regionRedraws: boolean; layerReuse: boolean; fullPreviews: boolean; recoverySeconds: number; autoShowHome: boolean; useGpu: boolean; gpuFilters: boolean; renderer: GpuRenderer; gpuMemoryMB: number; gpuPower: GpuPower; lowLatency: boolean; framePacingMs: number; cacheTilePx: number; workerThreads: number; engineDevice: EngineDevice;
  /* The sections (the owner's walkthrough): Tools, History & Cache, Workspace, Cursors, Transparency & Gamut,
     Units & Rulers, Guides & Grid; every one acts on something real. */
  zoomWheel: boolean; autoFirstSnapshot: boolean; snapshotMB: number; narrowCollapse: boolean; rememberLayout: boolean;
  paintCursor: PaintCursor; cursorCrosshair: boolean; checkerSize: CheckerSize; checkerColors: CheckerColors; checkerTheme: boolean;
  rulerUnits: RulerUnits; guideColor: string; gridColor: string; gridSpacing: number; gridSubdivisions: number;
  /* The workspace charter (DEV_PLAN 35.1): the Home screen when the last document closes, What's New after an update,
     and the values that stick: every tool option, and each dialog's last controls. */
  homeOnLastClose: boolean; whatsNewAuto: boolean; whatsNewSeen: string;
  toolOptions: Record<string, ToolOptionValue>; dialogValues: Record<string, Record<string, DialogValue>>;
  /** The user dictionary Check Spelling adds to (1.70.4). */
  spellWords: string[];
  /** Image > Analysis > Select Data Points (1.70.7): the Measurement Log columns shown, by data point name. */
  measureDataPoints: string[];
  /** Type > Font Preview Size (36.31): each family drawn in its own face in the font menus at this size, or plain. */
  fontPreview: FontPreview;
  /** Edit > Toolbar (36.22): the tool rail's groups of tool ids, in order, and the tools kept in Extra Tools; null is the built-in layout. */
  toolbar: ToolbarPref | null;
  /** Preferences > Tools: the pen pressure curve every pressure-sensitive brush starts with. */
  pressureCurve: PressureCurve;
  /** Preferences > Interface: the size of the interface's text. */
  uiFontSize: UiFontSize;
  /** Preferences > Type: how many recently used fonts the font menus list first, and the fonts used, newest first. */
  recentFontCount: number; recentFonts: string[];
  /** Preferences > Camera Raw Defaults: the white balance and bit depth the Camera Raw dialog starts with. */
  rawWb: 'as_shot' | 'auto' | 'daylight'; rawBits: 8 | 16;
  /** Camera Raw Defaults: Auto Tone applied on open, the layer opened as a smart object, and the resolution (ppi) a RAW opens at; 0 keeps the file's. */
  rawAutoTone: boolean; rawSmart: boolean; rawPpi: number;
  /** Show the Camera Raw dialog when a camera RAW opens; off opens it at once with the defaults above. */
  rawAsk: boolean;
  /** Camera Raw Defaults: the colour space a 16-bit RAW opens in, and the output sharpening applied as it opens. */
  rawWide: boolean; rawSharpen: RawSharpen; rawSharpenAmount: RawSharpenAmount;
  /** Preferences > Workspace: with panels hidden (Tab), the pointer at the window's left or right edge shows them again. */
  autoShowPanels: boolean;
  /** Preferences > History Log: each new history step is written to the log (Edit > History Log saves it). */
  historyLog: boolean;
  /** Preferences > File Handling: a picture placed or dropped into an open document starts in Free Transform. */
  placeTransform: boolean;
  /** Preferences > General: ease zoom steps, and the colour picker the swatches open (formvis's own or the system's). */
  animatedZoom: boolean; systemPicker: boolean; zoomResizes: boolean; beepWhenDone: boolean; interpolation: ResampleMethod;
  /** Preferences > Workspace: a floating document window dropped on the tab bar goes back to its tab. */
  floatDocking: boolean;
  /** Preferences > Tools: the tool tips, Shift with a tool's key cycles its group, and the Zoom tool centres the clicked point. */
  showTooltips: boolean; shiftToolSwitch: boolean; zoomClickCentre: boolean;
  /** Preferences > File Handling: the extension of exported files in lower case, and how many files File > Open Recent lists. */
  lowerExtension: boolean; recentFileCount: number;
  /** Preferences > Transparency & Gamut: the Gamut Warning's colour and its opacity in percent. */
  gamutColor: string; gamutOpacity: number;
  /** Preferences > Guides, Grid & Slices: the line styles of guides and the grid, the slice lines' colour and their numbers. */
  guideStyle: LineStyle; gridStyle: LineStyle; sliceColor: string; sliceNumbers: boolean;
  /** The grid lines' opacity in percent, and how long a notice stays in seconds (0 keeps the usual 3.6 and 6). */
  gridOpacity: number; noticeSeconds: number;
  /** Edit > Keyboard Shortcuts: saved sets of bindings, by name, each a command id to its combinations. */
  shortcutSets: Record<string, Record<string, string[]>>;
  /** Edit > Menus: command ids hidden from the menu bar, and the colour name each shown item is drawn in. */
  menuHidden: string[]; menuColors: Record<string, string>;
  /** Preferences > Interface: transitions and the marching ants run; Preferences > Tools: pen pressure is read. */
  animations: boolean; usePressure: boolean }
export const MENU_COLORS: readonly string[] = ['red', 'orange', 'yellow', 'green', 'blue', 'violet', 'gray'];
export const RAW_WB_CHOICES: ReadonlyArray<readonly ['as_shot' | 'auto' | 'daylight', string]> = [['as_shot', 'As Shot'], ['auto', 'Auto'], ['daylight', 'Daylight']];
/** Preferences > Scratch Disks, Cursors, Transparency & Gamut, Units & Rulers, Guides Grid & Slices, Plug-ins, Type and Enhanced Controls. */
export interface PagePrefs {
  scratchFolder: string;
  cursorOnlyCross: boolean; cursorOther: 'standard' | 'precise'; brushPreviewColor: string;
  checkerA: string; checkerB: string;
  printRes: number; screenRes: number; colWidth: number; gutter: number;
  showExtPanels: boolean;
  smartQuotes: boolean; escCommit: boolean; placeholderText: boolean;
  pinchZoom: boolean; trackpadRotate: boolean; scrubAccel: number; touchGestures: boolean }
export const PAGE_DEFAULTS: PagePrefs = { scratchFolder: '', cursorOnlyCross: false, cursorOther: 'standard', brushPreviewColor: '#ff0000', checkerA: '#ffffff', checkerB: '#cccccc',
  printRes: 300, screenRes: 72, colWidth: 15, gutter: 4.2,
  showExtPanels: true, smartQuotes: false, escCommit: false, placeholderText: false, pinchZoom: true, trackpadRotate: false, scrubAccel: 0, touchGestures: true };
const hex = (v: unknown, d: string, blank = false): string => (typeof v === 'string' && (blank ? /^(#[0-9a-f]{6})?$/i : /^#[0-9a-f]{6}$/i).test(v) ? v : d);
const flag = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const pageOf = (r: Partial<Record<keyof PagePrefs, unknown>>): PagePrefs => {
  const d = PAGE_DEFAULTS;
  return {
    scratchFolder: typeof r.scratchFolder === 'string' ? r.scratchFolder.slice(0, 500) : d.scratchFolder,
    cursorOnlyCross: flag(r.cursorOnlyCross, d.cursorOnlyCross), cursorOther: r.cursorOther === 'precise' ? 'precise' : 'standard', brushPreviewColor: hex(r.brushPreviewColor, d.brushPreviewColor),
    checkerA: hex(r.checkerA, d.checkerA), checkerB: hex(r.checkerB, d.checkerB),
    printRes: Math.round(num(r.printRes, 1, 10000, d.printRes)), screenRes: Math.round(num(r.screenRes, 1, 10000, d.screenRes)), colWidth: num(r.colWidth, 1, 1000, d.colWidth), gutter: num(r.gutter, 0, 500, d.gutter),    showExtPanels: flag(r.showExtPanels, d.showExtPanels), smartQuotes: flag(r.smartQuotes, d.smartQuotes), escCommit: flag(r.escCommit, d.escCommit), placeholderText: flag(r.placeholderText, d.placeholderText),
    pinchZoom: flag(r.pinchZoom, d.pinchZoom), trackpadRotate: flag(r.trackpadRotate, d.trackpadRotate), scrubAccel: Math.round(num(r.scrubAccel, 0, 100, d.scrubAccel)), touchGestures: flag(r.touchGestures, d.touchGestures),
  };
};
export type PressureCurve = 'linear' | 'soft' | 'firm' | 's';
export const PRESSURE_CURVES: ReadonlyArray<readonly [PressureCurve, string]> = [['linear', 'Linear'], ['soft', 'Soft'], ['firm', 'Firm'], ['s', 'S curve']];
export const PRESSURE_POINTS: Record<PressureCurve, number[] | null> = { linear: null, soft: [0, 0.35, 0.6, 0.8, 1], firm: [0, 0.1, 0.3, 0.6, 1], s: [0, 0.1, 0.5, 0.9, 1] };
export type UiFontSize = 'small' | 'default' | 'large' | 'larger';
export const UI_FONT_SIZES: ReadonlyArray<readonly [UiFontSize, string]> = [['small', 'Small'], ['default', 'Default'], ['large', 'Large'], ['larger', 'Larger']];
export const UI_FONT_SCALE: Record<UiFontSize, number> = { small: 0.9, default: 1, large: 1.15, larger: 1.3 };
/** The interface language for a first launch: the system's first language formvis has, else English. */
export function systemLang(): Lang {
  try {
    for (const raw of navigator.languages ?? [navigator.language]) {
      const l = raw.replace('_', '-'), base = l.split('-')[0].toLowerCase();
      if (isLang(l)) return l;
      const hit = ({ pt: 'pt-BR', zh: 'zh-CN', no: 'nb' } as Record<string, Lang>)[base] ?? (isLang(base) ? base : null);
      if (hit) return hit;
    }
  } catch { /* English */ }
  return 'en';
}
export interface ToolbarPref { groups: string[][]; hidden: string[] }
export type FontPreview = 'none' | 'small' | 'medium' | 'large' | 'extra' | 'huge';
export const FONT_PREVIEWS: readonly FontPreview[] = ['none', 'small', 'medium', 'large', 'extra', 'huge'];
/** Every data point Record Measurements can show, in log order, and the ones on by default. */
export const MEASURE_POINTS: readonly string[] = ['Label', 'Scale', 'Area', 'Perimeter', 'Length', 'Angle', 'Count', 'W', 'H', 'Gray Value', 'Min Gray', 'Max Gray', 'Integrated Density', 'Centroid X', 'Centroid Y', 'Circularity', 'Histogram'];
export const DEFAULT_MEASURE_POINTS: readonly string[] = ['Label', 'Scale', 'Area', 'Perimeter', 'Length', 'Angle', 'Count', 'W', 'H'];
export type ToolOptionValue = string | number | boolean;
export type DialogValue = string | boolean;
export type PaintCursor = 'tip' | 'precise' | 'standard';
export type CheckerSize = 'none' | 'small' | 'medium' | 'large';
export type CheckerColors = 'auto' | 'light' | 'medium' | 'dark' | 'custom';
export type RulerUnits = 'px' | 'in' | 'cm' | 'mm' | '%' | 'col';
/** Preferences > General > Image Interpolation: the resampling the Image Size dialog starts with. */
export const INTERPOLATIONS: ReadonlyArray<readonly [ResampleMethod, string]> = [['high', 'High quality'], ['smooth', 'Smooth'], ['nearest', 'Nearest (hard edges)'], ['bilinear', 'Bilinear'], ['bicubic', 'Bicubic'], ['smoother', 'Bicubic Smoother (enlargement)'], ['sharper', 'Bicubic Sharper (reduction)'], ['lanczos', 'Lanczos']];
export type LineStyle = 'solid' | 'dashed' | 'dotted';
export const LINE_STYLES: ReadonlyArray<readonly [LineStyle, string]> = [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']];
export const LINE_DASH: Record<LineStyle, number[]> = { solid: [], dashed: [6, 4], dotted: [1, 3] };
export const PAINT_CURSORS: ReadonlyArray<readonly [PaintCursor, string]> = [['tip', 'Normal Brush Tip'], ['precise', 'Precise'], ['standard', 'Standard']];
export const CHECKER_SIZES: ReadonlyArray<readonly [CheckerSize, string]> = [['none', 'None'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']];
export const CHECKER_COLORS: ReadonlyArray<readonly [CheckerColors, string]> = [['auto', 'Match Theme'], ['light', 'Light'], ['medium', 'Medium'], ['dark', 'Dark'], ['custom', 'Custom']];
export const RULER_UNITS: ReadonlyArray<readonly [RulerUnits, string]> = [['px', 'Pixels'], ['in', 'Inches'], ['cm', 'Centimeters'], ['mm', 'Millimeters'], ['%', 'Percent'], ['col', 'Columns']];
/** The checkerboard's cell in screen pixels, and its two colours (the Transparency settings). */
export const CHECKER_CELL: Record<CheckerSize, number> = { none: 8, small: 4, medium: 8, large: 16 };
export const CHECKER_PAIR: Record<Exclude<CheckerColors, 'auto' | 'custom'>, readonly [string, string]> = { light: ['#ffffff', '#cccccc'], medium: ['#cccccc', '#999999'], dark: ['#666666', '#999999'] };
/** The checkerboard's two colours for a choice; Match Theme takes the light pair in a light theme and the dark pair in a dark one. */
export const checkerPair = (choice: CheckerColors, themeLight: boolean, custom: readonly [string, string] = ['#ffffff', '#cccccc']): readonly [string, string] => choice === 'custom' ? custom : CHECKER_PAIR[choice === 'auto' ? (themeLight ? 'light' : 'dark') : choice];

/** The engine's compute device (Phase 18.6), sent to the engine, which reports what it uses. */
export type EngineDevice = 'auto' | 'metal' | 'cuda' | 'dml' | 'cpu';
export const ENGINE_CHOICES: ReadonlyArray<readonly [EngineDevice, string]> = [['auto', 'Automatic'], ['metal', 'Metal (Core ML)'], ['cuda', 'CUDA'], ['dml', 'DirectML (Windows GPU)'], ['cpu', 'CPU']];

export const DEFAULT_PREFS: Prefs = { language: 'en', profileMismatch: 'convert', colour: DEFAULT_COLOUR, colourPresets: [], shortcuts: {}, restoreSession: true, agentsAllowed: false, comfyuiUrl: 'http://127.0.0.1:8188', nodemodeUrl: 'http://localhost:8000', historyStates: 100, historyMB: 256, historyAuto: true, memoryLimitMB: 0, effectCacheMB: 256, backgroundReleaseSec: 30, cacheLevels: 6, regionRedraws: true, layerReuse: true, fullPreviews: false, recoverySeconds: 20, autoShowHome: true, useGpu: true, gpuFilters: true, renderer: 'auto', gpuMemoryMB: 1024, gpuPower: 'high-performance', lowLatency: false, framePacingMs: 0, cacheTilePx: 2048, workerThreads: 0, engineDevice: 'auto',
  zoomWheel: false, autoFirstSnapshot: true, snapshotMB: 768, narrowCollapse: true, rememberLayout: true, paintCursor: 'tip', cursorCrosshair: false,
  checkerSize: 'medium', checkerColors: 'auto', checkerTheme: true, rulerUnits: 'px', guideColor: '', gridColor: '', gridSpacing: 100, gridSubdivisions: 4,
  homeOnLastClose: false, whatsNewAuto: true, whatsNewSeen: '', toolOptions: {}, dialogValues: {}, spellWords: [], measureDataPoints: [...DEFAULT_MEASURE_POINTS], fontPreview: 'medium', toolbar: null, pressureCurve: 'linear', uiFontSize: 'default', recentFontCount: 5, recentFonts: [], rawWb: 'as_shot', rawBits: 8, rawAutoTone: false, rawSmart: false, rawAsk: true, rawPpi: 0, rawWide: false, rawSharpen: 'none', rawSharpenAmount: 'standard', autoShowPanels: true, historyLog: false, placeTransform: true, animatedZoom: true, systemPicker: false, zoomResizes: false, beepWhenDone: false, interpolation: 'high', floatDocking: true, showTooltips: true, shiftToolSwitch: true, zoomClickCentre: false, lowerExtension: true, recentFileCount: 20, gamutColor: '#808080', gamutOpacity: 100, guideStyle: 'solid', gridStyle: 'solid', gridOpacity: 100, noticeSeconds: 0, sliceColor: '', sliceNumbers: true, shortcutSets: {}, menuHidden: [], menuColors: {}, animations: true, usePressure: true, ...PAGE_DEFAULTS };
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

/** The saved toolbar layout: strings only, each tool id once. Ids no longer known are dropped, and tools missing from the
 *  layout are placed, when the rail is built (`resolveLayout`, ui/tool-groups.ts), which holds the registry. */
function cleanToolbar(v: unknown): ToolbarPref | null {
  if (!plain(v) || !Array.isArray(v.groups) || !Array.isArray(v.hidden)) return null;
  const seen = new Set<string>();
  const ids = (a: unknown): string[] => (Array.isArray(a) ? a : []).filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 80 && !seen.has(x) && !!seen.add(x));
  const groups = v.groups.slice(0, 200).map(ids).filter((g) => g.length > 0);
  return { groups, hidden: ids(v.hidden) };
}

/** A binding map (command id to combinations), strings only: what a saved set or an imported file may hold. */
export function cleanBindings(v: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!plain(v)) return out;
  for (const [k, x] of Object.entries(v).slice(0, 3000)) if (Array.isArray(x)) out[k.slice(0, 120)] = x.filter((s): s is string => typeof s === 'string' && s.length > 0 && s.length <= 40).slice(0, 8);
  return out;
}

function cleanShortcutSets(v: unknown): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {};
  if (!plain(v)) return out;
  for (const [name, set] of Object.entries(v).slice(0, 50)) if (name.trim() && name.length <= 60) out[name] = cleanBindings(set);
  return out;
}

function cleanMenuColors(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!plain(v)) return out;
  for (const [k, x] of Object.entries(v).slice(0, 2000)) if (typeof x === 'string' && MENU_COLORS.includes(x)) out[k.slice(0, 120)] = x;
  return out;
}

export function loadPrefs(): Prefs {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<keyof Prefs, unknown>>;
    return {
      language: isLang(r.language) ? r.language : systemLang(),   // any of the 26 (36.32); at the first launch, the system's
      historyStates: Math.round(num(r.historyStates, 1, 1000, DEFAULT_PREFS.historyStates)),
      historyMB: Math.round(num(r.historyMB, 16, 4096, DEFAULT_PREFS.historyMB)),
      historyAuto: typeof r.historyAuto === 'boolean' ? r.historyAuto : DEFAULT_PREFS.historyAuto,   // 1.61.3
      memoryLimitMB: r.memoryLimitMB === 0 ? 0 : Math.round(num(r.memoryLimitMB, 512, 65536, DEFAULT_PREFS.memoryLimitMB)),   // 0 is automatic (PC-AU-0155)
      effectCacheMB: Math.round(num(r.effectCacheMB, 16, 4096, DEFAULT_PREFS.effectCacheMB)),
      backgroundReleaseSec: r.backgroundReleaseSec === 0 ? 0 : Math.round(num(r.backgroundReleaseSec, 5, 3600, DEFAULT_PREFS.backgroundReleaseSec)),
      cacheLevels: Math.round(num(r.cacheLevels, 0, 8, DEFAULT_PREFS.cacheLevels)),
      regionRedraws: typeof r.regionRedraws === 'boolean' ? r.regionRedraws : DEFAULT_PREFS.regionRedraws,
      layerReuse: typeof r.layerReuse === 'boolean' ? r.layerReuse : DEFAULT_PREFS.layerReuse,
      fullPreviews: typeof r.fullPreviews === 'boolean' ? r.fullPreviews : DEFAULT_PREFS.fullPreviews,
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
      gpuFilters: typeof r.gpuFilters === 'boolean' ? r.gpuFilters : DEFAULT_PREFS.gpuFilters,   // 36.10
      renderer: r.renderer === 'webgpu' || r.renderer === 'webgl2' || r.renderer === 'cpu' || r.renderer === 'auto' || r.renderer === 'native' ? r.renderer : DEFAULT_PREFS.renderer,
      gpuMemoryMB: Math.round(num(r.gpuMemoryMB, 128, 16384, DEFAULT_PREFS.gpuMemoryMB)),
      gpuPower: r.gpuPower === 'low-power' || r.gpuPower === 'default' || r.gpuPower === 'high-performance' ? r.gpuPower : DEFAULT_PREFS.gpuPower,
      lowLatency: typeof r.lowLatency === 'boolean' ? r.lowLatency : DEFAULT_PREFS.lowLatency,
      framePacingMs: [0, 16, 33, 66].includes(Number(r.framePacingMs)) ? Number(r.framePacingMs) : DEFAULT_PREFS.framePacingMs,
      cacheTilePx: TILE_SIZES.includes(Number(r.cacheTilePx)) ? Number(r.cacheTilePx) : DEFAULT_PREFS.cacheTilePx,
      workerThreads: Math.round(num(r.workerThreads, 0, 16, DEFAULT_PREFS.workerThreads)),
      engineDevice: ENGINE_CHOICES.some(([k]) => k === r.engineDevice) ? r.engineDevice as EngineDevice : DEFAULT_PREFS.engineDevice,
      zoomWheel: typeof r.zoomWheel === 'boolean' ? r.zoomWheel : DEFAULT_PREFS.zoomWheel,
      autoFirstSnapshot: typeof r.autoFirstSnapshot === 'boolean' ? r.autoFirstSnapshot : DEFAULT_PREFS.autoFirstSnapshot,
      snapshotMB: Math.round(num(r.snapshotMB, 64, 8192, DEFAULT_PREFS.snapshotMB)),
      narrowCollapse: typeof r.narrowCollapse === 'boolean' ? r.narrowCollapse : DEFAULT_PREFS.narrowCollapse,
      rememberLayout: typeof r.rememberLayout === 'boolean' ? r.rememberLayout : DEFAULT_PREFS.rememberLayout,
      paintCursor: PAINT_CURSORS.some(([k]) => k === r.paintCursor) ? r.paintCursor as PaintCursor : DEFAULT_PREFS.paintCursor,
      cursorCrosshair: typeof r.cursorCrosshair === 'boolean' ? r.cursorCrosshair : DEFAULT_PREFS.cursorCrosshair,
      checkerSize: CHECKER_SIZES.some(([k]) => k === r.checkerSize) ? r.checkerSize as CheckerSize : DEFAULT_PREFS.checkerSize,
      checkerColors: r.checkerTheme !== true && r.checkerColors === 'light' ? 'auto' : CHECKER_COLORS.some(([k]) => k === r.checkerColors) ? r.checkerColors as CheckerColors : DEFAULT_PREFS.checkerColors,   // before Match Theme existed, Light was the default, so a saved Light is Match Theme once
      checkerTheme: true,
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
      spellWords: Array.isArray(r.spellWords) ? r.spellWords.filter((w): w is string => typeof w === 'string' && w.length > 0 && w.length <= 80).slice(0, 5000) : [],
      measureDataPoints: Array.isArray(r.measureDataPoints) ? MEASURE_POINTS.filter((n) => (r.measureDataPoints as unknown[]).includes(n)) : [...DEFAULT_MEASURE_POINTS],
      fontPreview: FONT_PREVIEWS.find((v) => v === r.fontPreview) ?? DEFAULT_PREFS.fontPreview,
      toolbar: cleanToolbar(r.toolbar),
      pressureCurve: PRESSURE_CURVES.some(([k]) => k === r.pressureCurve) ? r.pressureCurve as PressureCurve : DEFAULT_PREFS.pressureCurve,
      uiFontSize: UI_FONT_SIZES.some(([k]) => k === r.uiFontSize) ? r.uiFontSize as UiFontSize : DEFAULT_PREFS.uiFontSize,
      recentFontCount: Math.round(num(r.recentFontCount, 0, 20, DEFAULT_PREFS.recentFontCount)),
      recentFonts: Array.isArray(r.recentFonts) ? r.recentFonts.filter((f): f is string => typeof f === 'string' && f.length > 0 && f.length <= 120).slice(0, 20) : [],
      rawWb: RAW_WB_CHOICES.find(([k]) => k === r.rawWb)?.[0] ?? DEFAULT_PREFS.rawWb,
      rawBits: r.rawBits === 16 ? 16 : 8,
      rawAutoTone: r.rawAutoTone === true,
      rawSmart: r.rawSmart === true,
      rawAsk: r.rawAsk !== false,
      rawWide: r.rawWide === true,
      rawSharpen: r.rawSharpen === 'screen' || r.rawSharpen === 'glossy' || r.rawSharpen === 'matte' ? r.rawSharpen : 'none',
      rawSharpenAmount: r.rawSharpenAmount === 'low' || r.rawSharpenAmount === 'high' ? r.rawSharpenAmount : 'standard',
      autoShowPanels: r.autoShowPanels !== false,
      historyLog: r.historyLog === true,
      placeTransform: r.placeTransform !== false,
      animatedZoom: r.animatedZoom !== false, systemPicker: r.systemPicker === true, zoomResizes: r.zoomResizes === true, beepWhenDone: r.beepWhenDone === true, interpolation: INTERPOLATIONS.some(([k]) => k === r.interpolation) ? r.interpolation as ResampleMethod : 'high', floatDocking: r.floatDocking !== false, showTooltips: r.showTooltips !== false, shiftToolSwitch: r.shiftToolSwitch !== false, zoomClickCentre: r.zoomClickCentre === true, lowerExtension: r.lowerExtension !== false,
      recentFileCount: Math.round(num(r.recentFileCount, 0, 40, DEFAULT_PREFS.recentFileCount)),
      gamutColor: typeof r.gamutColor === 'string' && /^#[0-9a-f]{6}$/i.test(r.gamutColor) ? r.gamutColor : DEFAULT_PREFS.gamutColor,
      gamutOpacity: Math.round(num(r.gamutOpacity, 0, 100, DEFAULT_PREFS.gamutOpacity)),
      guideStyle: LINE_STYLES.some(([k]) => k === r.guideStyle) ? r.guideStyle as LineStyle : 'solid',
      gridStyle: LINE_STYLES.some(([k]) => k === r.gridStyle) ? r.gridStyle as LineStyle : 'solid',
      gridOpacity: Math.round(num(r.gridOpacity, 5, 100, DEFAULT_PREFS.gridOpacity)),
      noticeSeconds: Math.round(num(r.noticeSeconds, 0, 60, DEFAULT_PREFS.noticeSeconds)),
      sliceColor: typeof r.sliceColor === 'string' && /^(#[0-9a-f]{6})?$/i.test(r.sliceColor) ? r.sliceColor : '',
      sliceNumbers: r.sliceNumbers !== false,
      shortcutSets: cleanShortcutSets(r.shortcutSets),
      menuHidden: Array.isArray(r.menuHidden) ? r.menuHidden.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 120).slice(0, 2000) : [],
      menuColors: cleanMenuColors(r.menuColors),
      animations: r.animations !== false,
      usePressure: r.usePressure !== false,
      ...pageOf(r),
      rawPpi: typeof r.rawPpi === 'number' && Number.isFinite(r.rawPpi) && r.rawPpi >= 1 && r.rawPpi <= 10000 ? Math.round(r.rawPpi) : 0,
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

let appliedCurve: PressureCurve | null = null;

/** Scales the interface's font-size tokens (--fs-9 to --fs-18) to the chosen size, and the rules that still write a size in
 *  pixels with them. */
export function applyUiFontSize(p: Prefs): void {
  const k = UI_FONT_SCALE[p.uiFontSize], s = document.documentElement.style;
  for (const n of [9, 10, 11, 12, 13, 14, 16, 18]) { if (k === 1) s.removeProperty(`--fs-${n}`); else s.setProperty(`--fs-${n}`, `${Math.round(n * k * 10) / 10}px`); }
  scalePxFonts(k);
}

let pxFontSheet: HTMLStyleElement | null = null;
let pxFontFactor = 1;
/** The style rules with a literal pixel font size get the same factor from one generated sheet that follows them, made
 *  again only when the factor changes (the sheet itself is left out of the walk). */
function scalePxFonts(k: number): void {
  if (k === pxFontFactor) return;
  pxFontFactor = k;
  if (!pxFontSheet) { if (k === 1) return; pxFontSheet = document.createElement('style'); pxFontSheet.dataset.role = 'ui-font-scale'; document.head.appendChild(pxFontSheet); }
  const walk = (rules: CSSRuleList): string => {
    let out = '';
    for (const r of Array.from(rules)) {
      if (r instanceof CSSStyleRule) {
        const m = /^(\d+(?:\.\d+)?)px$/.exec(r.style.getPropertyValue('font-size'));
        if (m && r.selectorText) out += `${r.selectorText}{font-size:${Math.round(parseFloat(m[1]) * k * 10) / 10}px}`;
      } else if (r instanceof CSSMediaRule) { const inner = walk(r.cssRules); if (inner) out += `@media ${r.media.mediaText}{${inner}}`; }
      else if (r instanceof CSSSupportsRule) { const inner = walk(r.cssRules); if (inner) out += `@supports ${r.conditionText}{${inner}}`; }
    }
    return out;
  };
  let css = '';
  if (k !== 1) for (const sheet of Array.from(document.styleSheets)) {
    if (sheet.ownerNode === pxFontSheet) continue;
    try { css += walk(sheet.cssRules); } catch { /* a sheet from another origin cannot be read */ }
  }
  pxFontSheet.textContent = css;
}

/** Interface scale: the whole window under CSS zoom on the root, kept on this device (the View > Interface Zoom commands
 *  use the same key). */
export const UI_SCALES: ReadonlyArray<readonly [string, string]> = [['0.8', '80%'], ['0.9', '90%'], ['1', '100%'], ['1.1', '110%'], ['1.25', '125%'], ['1.5', '150%'], ['1.75', '175%'], ['2', '200%']];
export function uiScaleChoice(): string {
  try { const v = localStorage.getItem('formvis.uiZoom') ?? '1'; return UI_SCALES.some(([k]) => k === v) ? v : '1'; } catch { return '1'; }
}
export function setUiScale(v: string): void {
  try { localStorage.setItem('formvis.uiZoom', v); } catch { /* kept for this session only */ }
  window.dispatchEvent(new Event('formvis:ui-zoom'));
}

/** Preferences > Plugins > Updates: whether the desktop app looks for a new version when it starts (on unless turned off). */
export function updateAtStart(): boolean {
  try { return localStorage.getItem('formvis.updateAtStart') !== '0'; } catch { return true; }
}
export function setUpdateAtStart(on: boolean): void {
  try { localStorage.setItem('formvis.updateAtStart', on ? '1' : '0'); } catch { /* kept for this session only */ }
}

let appliedScratch: string | null = null;
/** Sends the scratch folder to the engine once per change; a refused or unreachable engine is tried again at the next call. */
function setScratchFolder(folder: string): void {
  if (folder === appliedScratch) return;
  appliedScratch = folder;
  api.setScratch(folder).then(() => window.dispatchEvent(new Event('formvis:scratch')), () => { appliedScratch = null; window.dispatchEvent(new Event('formvis:scratch')); });
}
/** Sends the saved scratch folder again, as the engine becomes reachable (it may have restarted). */
export const resendScratch = (): void => { appliedScratch = null; setScratchFolder(loadPrefs().scratchFolder); };

/** Puts the engine-side preferences into effect; the recovery delay is read by the app when it schedules a save. */
export function applyPrefs(engine: Engine, p: Prefs): void {
  renderCache.levels = p.cacheLevels;
  framePacing.minMs = p.framePacingMs;
  setTileSize(p.cacheTilePx);
  setBandThreads(p.workerThreads);
  renderCache.prefix = p.layerReuse;
  renderCache.effectBytes = p.effectCacheMB * 1048576;
  engine.setMemoryLimit(p.memoryLimitMB * 1048576);
  engine.backgroundReleaseSec = p.backgroundReleaseSec;
  engine.setHistoryLimits(p.historyStates, p.historyAuto ? null : p.historyMB * 1024 * 1024);   // automatic: from the memory budget (1.61.3)
  engine.dirtyRendering = p.regionRedraws;
  previewMode.full = p.fullPreviews;
  if (p.pressureCurve !== appliedCurve) { appliedCurve = p.pressureCurve; engine.pressureCurve = PRESSURE_POINTS[p.pressureCurve]; }   // only when the choice changes, so a tool's own pick is not undone by another setting
  engine.autoFirstSnapshot = p.autoFirstSnapshot;
  engine.snapshotByteLimit = p.snapshotMB * 1024 * 1024;
  engine.view = { ...engine.view, gridSpacing: p.gridSpacing, gridSubdivisions: p.gridSubdivisions };
  engine.cursorPrefs = { paint: p.paintCursor, crosshair: p.cursorCrosshair, onlyCross: p.cursorOnlyCross, previewColor: p.brushPreviewColor };
  setScratchFolder(p.scratchFolder);
  engine.zoomPrefs = { animate: p.animatedZoom, centreClick: p.zoomClickCentre };
  slicePrefs.color = p.sliceColor; slicePrefs.numbers = p.sliceNumbers;
  const gc = parseInt(p.gamutColor.slice(1), 16), go = p.gamutOpacity / 100;
  if (gamutWarning.r !== gc >> 16 || gamutWarning.g !== ((gc >> 8) & 255) || gamutWarning.b !== (gc & 255) || gamutWarning.opacity !== go) {
    gamutWarning.r = gc >> 16; gamutWarning.g = (gc >> 8) & 255; gamutWarning.b = gc & 255; gamutWarning.opacity = go;
    if (engine.viewTransform?.gamut) engine.emit('render', null);
  }
  engine.emit('overlay', null);
}
