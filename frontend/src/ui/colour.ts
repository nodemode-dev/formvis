import type { Engine } from '../engine';
import type { ColourLut } from '../engine/colour-lut';
import { api } from '../io/api';
import { readDisplay, type DisplayInfo } from './colour-display';
import { loadPrefs } from './prefs';
import { toast } from './toast';

export type Intent = 'perceptual' | 'relative' | 'saturation' | 'absolute';
/** The device to simulate. `paper` shows the paper's own white (absolute colorimetric) and `ink` the press's own black
 *  (no black point compensation), as Photoshop's Simulate Paper Color and Simulate Black Ink. */
export interface ProofSetup { id: string; name: string; intent: Intent; bpc: boolean; paper?: boolean; ink?: boolean }
export interface ProofPreset { id: string; name: string; setup: ProofSetup }
const KEY = 'formvis.proof';
const PRESETS = 'formvis.proof-presets';

/** The intent and black point compensation a proof is built with: the paper's white needs the absolute intent, and the
 *  press's black needs the compensation off. */
export const proofTerms = (s: ProofSetup): { intent: Intent; bpc: boolean } => ({ intent: s.paper ? 'absolute' : s.intent, bpc: s.paper || s.ink ? false : s.bpc });

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
  /** The monitor's profile as the system gave it (null until read; the browser build has none). */
  display: DisplayInfo | null = null;
  private key = '';
  private seq = 0;

  constructor(private readonly engine: Engine) {
    try { this.setup = cleanSetup(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { /* none kept */ }
    try {
      const list = JSON.parse(localStorage.getItem(PRESETS) ?? '[]') as unknown;
      if (Array.isArray(list)) this.presets = list.flatMap((x: { id?: unknown; name?: unknown; setup?: unknown }) => { const setup = cleanSetup(x?.setup); return setup && typeof x.id === 'string' && typeof x.name === 'string' && x.name.trim() ? [{ id: x.id, name: x.name.trim().slice(0, 60), setup }] : []; }).slice(0, 50);
    } catch { /* none kept */ }
    for (const k of ['projects', 'doc', 'active'] as const) engine.on(k, () => void this.refresh());
    void this.detect();
    window.addEventListener('focus', () => void this.detect());
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

  async refresh(): Promise<void> {
    // CMYK and Lab documents (1.57.8): the canvas shows their sRGB rendition, so that is the source proofed.
    const p = this.engine.current, rendered = p?.doc.mode === 'cmyk' || p?.doc.mode === 'lab', prof = rendered ? undefined : p?.doc.profile, s = this.setup, proofing = this.proof && !!s;
    const c = loadPrefs().colour, monitor = c.useDisplay && this.display?.icc ? this.display.icc : null, terms = proofing && s ? proofTerms(s) : null;
    const key = p ? `${prof ? `${prof.icc.length}:${prof.icc.slice(-64)}` : 'srgb'}|${proofing && s && terms ? `${s.id}:${terms.intent}:${terms.bpc}` : ''}|${proofing && this.gamut}|${monitor ? `${monitor.length}:${monitor.slice(-64)}:${c.intent}:${c.bpc}` : ''}` : '';
    if (key === this.key) return;
    this.key = key;
    if (!p || (!prof && !proofing && !monitor)) { this.engine.setViewTransform(null); return; }
    const n = ++this.seq;
    try {
      const lut = await api.colourLut({ source: prof ? { icc: prof.icc } : null, dest: monitor ? { icc: monitor } : null, proof: proofing && s ? { id: s.id } : null, intent: c.intent, proofIntent: terms?.intent ?? 'relative', bpc: terms?.bpc ?? c.bpc, gamut: proofing && this.gamut });
      if (n !== this.seq) return;
      this.engine.setViewTransform(!prof && !proofing && nearIdentity(lut) ? null : { lut, gamut: proofing && this.gamut });
    } catch (err) {
      if (n !== this.seq) return;
      this.key = '';
      this.engine.setViewTransform(null);
      toast(`The view could not be colour-managed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
