import type { Engine } from '../engine';
import { lutOf, type ColourLut, type Lut3x4 } from '../engine/colour-lut';
import { api } from '../io/api';
import { iccProfile } from '../engine/icc';
import { toBase64 } from '../io/icc-read';
import { readDisplay, type DisplayInfo } from './colour-display';
import { loadPrefs } from './prefs';
import { toast } from './toast';

export type Intent = 'perceptual' | 'relative' | 'saturation' | 'absolute';
/** The device to simulate. `paper` shows the paper's own white (absolute colorimetric) and `ink` the press's own black
 *  (no black point compensation), for Simulate Paper Color and Simulate Black Ink. */
export interface ProofSetup { id: string; name: string; intent: Intent; bpc: boolean; paper?: boolean; ink?: boolean }
export interface ProofPreset { id: string; name: string; setup: ProofSetup }
const KEY = 'formvis.proof';
const PRESETS = 'formvis.proof-presets';

/** The intent and black point compensation a proof is built with: the paper's white needs the absolute intent, and the
 *  press's black needs the compensation off. */
export const proofTerms = (s: ProofSetup): { intent: Intent; bpc: boolean } => ({ intent: s.paper ? 'absolute' : s.intent, bpc: s.paper || s.ink ? false : s.bpc });

/** The standard built-in proof presets (DEV_PLAN 31.7), beside Custom. The working CMYK ones simulate the working CMYK
 *  profile and show only some inks (a plate is a grey image of that ink's coverage, CMY leaves K out); the two colour
 *  blindness ones are Vienot 1999 (Brettel 1997 for the dichromat's confusion lines) in linear RGB. */
export type ProofKind = 'monitor' | 'macrgb' | 'internet' | 'cmyk' | 'cyan' | 'magenta' | 'yellow' | 'black' | 'cmy' | 'protanopia' | 'deuteranopia';
/** The RGB presets that simulate a built-in device: Legacy Macintosh RGB is gamma 1.8, Internet Standard RGB is sRGB. */
const DEVICE: Partial<Record<ProofKind, string>> = { macrgb: 'builtin:macrgb', internet: 'builtin:srgb' };
export const PROOF_KINDS: Array<[ProofKind, string]> = [['monitor', 'Monitor RGB'], ['macrgb', 'Legacy Macintosh RGB (Gamma 1.8)'], ['internet', 'Internet Standard RGB (sRGB)'], ['cmyk', 'Working CMYK'], ['cyan', 'Working Cyan Plate'], ['magenta', 'Working Magenta Plate'], ['yellow', 'Working Yellow Plate'], ['black', 'Working Black Plate'], ['cmy', 'Working CMY Plates'], ['protanopia', 'Color Blindness - Protanopia-type'], ['deuteranopia', 'Color Blindness - Deuteranopia-type']];
const PLATE: Partial<Record<ProofKind, number>> = { cyan: 0, magenta: 1, yellow: 2, black: 3 };
/** Vienot, Brettel and Mollon 1999: the dichromat's colours as a 3x3 on linear sRGB (rows R, G, B). */
const CVD: Partial<Record<ProofKind, number[]>> = {
  protanopia: [0.11238, 0.88762, 0, 0.11238, 0.88762, 0, 0.00401, -0.00401, 1],
  deuteranopia: [0.29275, 0.70725, 0, 0.29275, 0.70725, 0, -0.02234, 0.02234, 1],
};
const lin = (v: number): number => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const unlin = (c: number): number => { const v = c <= 0 ? 0 : c >= 1 ? 1 : c; return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)); };

/** Turns `lut`'s outputs into what a protanope or deuteranope sees (linear RGB, then back to sRGB codes). */
export function colourBlindLut(lut: ColourLut, kind: ProofKind): ColourLut {
  const m = CVD[kind], out = new Uint8Array(lut.rgb.length);
  if (!m) return lut;
  for (let i = 0; i < out.length; i += 3) {
    const r = lin(lut.rgb[i]), g = lin(lut.rgb[i + 1]), b = lin(lut.rgb[i + 2]);
    for (let k = 0; k < 3; k++) out[i + k] = unlin(m[k * 3] * r + m[k * 3 + 1] * g + m[k * 3 + 2] * b);
  }
  return { grid: lut.grid, rgb: out };
}

/** 32-bit Preview Options: exposure in stops on linear light, then the display gamma, folded into the view table.
 *  It works on the 8-bit rendition the canvas shows, so it never changes the document. */
export function previewLut(lut: ColourLut, exposure: number, gamma: number): ColourLut {
  const gain = 2 ** exposure, inv = 1 / Math.max(0.01, gamma), out = new Uint8Array(lut.rgb.length), curve = new Uint8Array(256);
  for (let v = 0; v < 256; v++) curve[v] = Math.round(255 * Math.pow(unlin(lin(v) * gain) / 255, inv));
  for (let i = 0; i < out.length; i++) out[i] = curve[lut.rgb[i]];
  return { grid: lut.grid, rgb: out, gamut: lut.gamut };
}

/** A plate (grey from one ink's coverage), or the CMY inks without K, from the sRGB-to-ink table of the working CMYK. */
export function plateLut(inks: Lut3x4, kind: ProofKind): ColourLut {
  const n = inks.grid ** 3, rgb = new Uint8Array(n * 3), ch = PLATE[kind];
  for (let i = 0; i < n; i++) {
    const c = inks.cmyk.subarray(i * 4, i * 4 + 4);
    if (ch !== undefined) rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = 255 - c[ch];
    else { rgb[i * 3] = 255 - c[0]; rgb[i * 3 + 1] = 255 - c[1]; rgb[i * 3 + 2] = 255 - c[2]; }
  }
  return { grid: inks.grid, rgb };
}

/** A table that leaves every colour within one code is no change to draw: an sRGB-like monitor needs no pass. */
export function nearIdentity(lut: ColourLut): boolean {
  const G = lut.grid, step = 255 / (G - 1);
  let o = 0;
  for (let r = 0; r < G; r++) for (let g = 0; g < G; g++) for (let b = 0; b < G; b++) {
    if (Math.abs(lut.rgb[o++] - r * step) > 1 || Math.abs(lut.rgb[o++] - g * step) > 1 || Math.abs(lut.rgb[o++] - b * step) > 1) return false;
  }
  return true;
}

const cleanSetup = (s: unknown): ProofSetup | null => {
  const o = s && typeof s === 'object' ? (s as Record<string, unknown>) : null;
  if (!o || typeof o.id !== 'string' || !o.id) return null;
  const intent: Intent = o.intent === 'perceptual' || o.intent === 'saturation' || o.intent === 'absolute' ? o.intent : 'relative';
  return { id: o.id, name: typeof o.name === 'string' ? o.name : '', intent, bpc: o.bpc !== false, ...(o.paper === true ? { paper: true } : {}), ...(o.ink === true ? { ink: true } : {}) };
};

/** The view's colour management (1.53.5, H2): a document with a profile is shown through it to the display, and with
 *  Proof Colors on, through the proof device too, with the gamut warning; the engine's LittleCMS builds each table. */
export class ColourView {
  setup: ProofSetup | null = null;
  presets: ProofPreset[] = [];
  proof = false;
  gamut = false;
  /** Gamut Warning's threshold: a colour the proof device moves by more delta E than this is flagged. */
  gamutDelta = 3;
  /** 32-bit Preview Options: exposure in stops and display gamma for a 32-bit document's view. */
  exposure = 0;
  gamma = 1;
  /** 'gamma': exposure and gamma on the 8-bit rendition; 'compress': highlight compression on the composed floats. */
  method: 'gamma' | 'compress' = 'gamma';
  /** The built-in preset in use (null for Custom, the saved device). */
  preset: ProofKind | null = null;
  private work: { id: string; name: string } | null = null;
  /** The monitor's profile as the system gave it (null until read; the browser build has none). */
  display: DisplayInfo | null = null;
  private key = '';
  private seq = 0;

  constructor(private readonly engine: Engine) {
    try { this.setup = cleanSetup(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { /* none kept */ }
    try { const d = Number(localStorage.getItem(`${KEY}.delta`)); if (d >= 0.1 && d <= 50) this.gamutDelta = d; } catch { /* default */ }
    try {
      const list = JSON.parse(localStorage.getItem(PRESETS) ?? '[]') as unknown;
      if (Array.isArray(list)) this.presets = list.flatMap((x: { id?: unknown; name?: unknown; setup?: unknown }) => { const setup = cleanSetup(x?.setup); return setup && typeof x.id === 'string' && typeof x.name === 'string' && x.name.trim() ? [{ id: x.id, name: x.name.trim().slice(0, 60), setup }] : []; }).slice(0, 50);
    } catch { /* none kept */ }
    for (const k of ['projects', 'doc', 'active'] as const) engine.on(k, () => void this.refresh());
    void this.detect();
    window.addEventListener('focus', () => void this.detect());
    // In the desktop app a window dragged to another screen reads that screen's profile once it settles.
    if ('__TAURI_INTERNALS__' in window) {
      let settle = 0;
      void import('@tauri-apps/api/window').then((m) => m.getCurrentWindow().onMoved(() => { window.clearTimeout(settle); settle = window.setTimeout(() => void this.detect(), 400); })).catch(() => undefined);
    }
  }

  /** Chooses a built-in preset (null returns to the saved device) and turns Proof Colors on (the View > Proof Setup commands). */
  usePreset(kind: ProofKind | null): void {
    this.preset = kind;
    if (kind) this.proof = true;
    void this.refresh();
  }

  /** Sets the 32-bit preview and redraws the view (View > 32-bit Preview Options). */
  setPreview(exposure: number, gamma: number, method: 'gamma' | 'compress' = this.method): void {
    this.exposure = Math.max(-10, Math.min(10, exposure));
    this.gamma = Math.max(0.01, Math.min(10, gamma));
    this.method = method;
    this.engine.setPreviewCompression(method === 'compress' ? { exposure: this.exposure } : null);
    void this.refresh();
  }

  /** Sets Gamut Warning's threshold in delta E (0.1 to 50) and redraws; kept for the next session. */
  setGamutDelta(v: number): void {
    this.gamutDelta = Math.max(0.1, Math.min(50, Number.isFinite(v) ? v : 3));
    try { localStorage.setItem(`${KEY}.delta`, String(this.gamutDelta)); } catch { /* kept for this session */ }
    void this.refresh();
  }

  /** What the view is proofing, for the badge on the canvas: the device or preset's name, or null when Proof Colors is off. */
  proofLabel(): string | null {
    if (!this.proof) return null;
    if (this.preset) return PROOF_KINDS.find(([k]) => k === this.preset)?.[1] ?? null;
    return this.setup?.name || null;
  }

  saveSetup(s: ProofSetup): void { this.setup = s; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* kept for this session */ } }

  savePresets(list: ProofPreset[]): void { this.presets = list; try { localStorage.setItem(PRESETS, JSON.stringify(list)); } catch { /* kept for this session */ } }

  /** Reads the monitor's profile again (at start, and when the window gains focus, as it may have moved to another
   *  screen); a change redraws the canvas through the new one. */
  async detect(): Promise<void> {
    const d = await readDisplay();
    if (this.display && this.display.icc === d.icc && this.display.available === d.available) return;
    this.display = d;
    await this.refresh();
  }

  /** The working CMYK from Color Settings ('default' is the shipped one), by id; also kept for the sync read in refresh. */
  private async working(ref: string): Promise<{ id: string; name: string } | null> {
    try {
      this.work = ref.startsWith('id:') ? { id: ref.slice(3), name: ref.slice(3) } : await api.defaultCmykProfile();
    } catch { this.work = null; }
    return this.work;
  }

  private readonly monitorIcc = new Map<string, string>();

  /** The profile Color Settings names for the monitor (a built-in space or a listed one) as base64, or null for sRGB or when it cannot be read. */
  private async chosenMonitor(ref: string): Promise<string | null> {
    if (ref === 'srgb') return null;
    const hit = this.monitorIcc.get(ref);
    if (hit) return hit;
    try {
      const icc = ref === 'display-p3' || ref === 'adobe-rgb' ? toBase64(iccProfile(ref)) : ref.startsWith('id:') ? toBase64(await api.colourProfileBytes(ref.slice(3))) : null;
      if (icc) this.monitorIcc.set(ref, icc);
      return icc;
    } catch { return null; }
  }

  /** Called with the proof device's name (or null) whenever the view is refreshed: the status bar badge. */
  onProof: ((label: string | null) => void) | null = null;

  async refresh(): Promise<void> {
    this.onProof?.(this.engine.current ? this.proofLabel() : null);
    const c = loadPrefs().colour, chosen = c.useDisplay && c.monitor !== 'system' ? await this.chosenMonitor(c.monitor) : null;
    // CMYK and Lab documents (1.57.8): the canvas shows their sRGB rendition, so that is the source proofed.
    const p =this.engine.current, rendered = p?.doc.mode === 'cmyk' || p?.doc.mode === 'lab', prof = rendered ? undefined : p?.doc.profile, kind = this.proof ? this.preset : null;
    const plate = kind === 'cyan' || kind === 'magenta' || kind === 'yellow' || kind === 'black' || kind === 'cmy', cvd = kind === 'protanopia' || kind === 'deuteranopia';
    const device = kind ? DEVICE[kind] : undefined;
    const s = kind === 'cmyk' ? ({ id: this.work?.id ?? '', name: 'Working CMYK', intent: 'relative', bpc: true } as ProofSetup) : device ? ({ id: device, name: PROOF_KINDS.find(([k]) => k === kind)?.[1] ?? '', intent: 'relative', bpc: true } as ProofSetup) : kind ? null : this.setup, proofing = this.proof && (!!s || !!kind);
    const monitor =c.useDisplay && c.monitor === 'system' ? (this.display?.icc && !this.display.managed ? this.display.icc : null) : chosen, terms = proofing && s ? proofTerms(s) : null;
    const key = p ? `${prof ? `${prof.icc.length}:${prof.icc.slice(-64)}` : 'srgb'}|${proofing && s && terms ? `${s.id}:${terms.intent}:${terms.bpc}` : ''}|${kind ?? ''}:${c.cmyk}|${proofing && this.gamut ? this.gamutDelta : false}|${monitor ? `${monitor.length}:${monitor.slice(-64)}:${c.intent}:${c.bpc}` : ''}` : '';
    const squash = this.method === 'compress', lutExposure = squash ? 0 : this.exposure;
    const pv = p?.doc.depth === 32 && p.doc.mode !== 'lab' && p.doc.mode !== 'cmyk' && (lutExposure !== 0 || this.gamma !== 1), vkey = pv ? `${key}|p${lutExposure}:${this.gamma}` : key, raw = kind === 'monitor';
    if (vkey === this.key) return;
    this.key = vkey;
    const n = ++this.seq;
    if (!p || (!pv && (raw || (!prof && !proofing && !monitor)))) { this.engine.setViewTransform(null); return; }
    try {
      const work = kind === 'cmyk' || plate ? await this.working(c.cmyk) : null;
      if (n !== this.seq) return;
      if ((kind === 'cmyk' || plate) && !work) throw new Error('No working CMYK profile was found: choose one in Edit > Color Settings.');
      const proofId = kind === 'cmyk' && work ? work.id : s?.id;
      let lut: ColourLut;
      if (plate && work) lut = plateLut(await api.rgbCmykLut({ id: work.id }, prof ? { icc: prof.icc } : null), kind);
      else if (raw || (pv && !prof && !proofing && !monitor)) lut = lutOf(65, (r, g, b) => [r, g, b]);
      else {
        lut = await api.colourLut({ source: prof ? { icc: prof.icc } : null, dest: monitor ? { icc: monitor } : null, proof: proofId ? { id: proofId } : null, intent: c.intent, proofIntent: terms?.intent ?? 'relative', bpc: terms?.bpc ?? c.bpc, gamut: proofing && this.gamut && !cvd, gamutDelta: this.gamutDelta });
        if (cvd) lut = colourBlindLut(lut, kind);
      }
      if (pv) lut = previewLut(lut, lutExposure, this.gamma);
      if (n !== this.seq) return;
      this.engine.setViewTransform(!prof && !proofing && nearIdentity(lut) ? null : { lut, gamut: proofing && this.gamut && !plate && !cvd });
    } catch (err) {
      if (n !== this.seq) return;
      this.key = '';
      this.engine.setViewTransform(null);
      toast(`The view could not be color-managed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
