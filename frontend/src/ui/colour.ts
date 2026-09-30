import type { Engine } from '../engine';
import { api } from '../io/api';
import { toast } from './toast';

export type Intent = 'perceptual' | 'relative' | 'saturation' | 'absolute';
export interface ProofSetup { id: string; name: string; intent: Intent; bpc: boolean }
const KEY = 'formvis.proof';

/** The view's colour management (1.53.5, H2): a document with a profile is shown through it to the display, and with
 *  Proof Colors on, through the proof device too, with the gamut warning; the engine's LittleCMS builds each table. */
export class ColourView {
  setup: ProofSetup | null = null;
  proof = false;
  gamut = false;
  private key = '';
  private seq = 0;

  constructor(private readonly engine: Engine) {
    try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as ProofSetup | null; if (s && typeof s.id === 'string') this.setup = s; } catch { /* none kept */ }
    for (const k of ['projects', 'doc', 'active'] as const) engine.on(k, () => void this.refresh());
  }

  saveSetup(s: ProofSetup): void { this.setup = s; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* kept for this session */ } }

  async refresh(): Promise<void> {
    const p = this.engine.current, prof = p?.doc.profile, s = this.setup, proofing = this.proof && !!s;
    const key = p ? `${prof ? `${prof.icc.length}:${prof.icc.slice(-64)}` : 'srgb'}|${proofing && s ? `${s.id}:${s.intent}:${s.bpc}` : ''}|${proofing && this.gamut}` : '';
    if (key === this.key) return;
    this.key = key;
    if (!p || (!prof && !proofing)) { this.engine.setViewTransform(null); return; }
    const n = ++this.seq;
    try {
      const lut = await api.colourLut({ source: prof ? { icc: prof.icc } : null, proof: proofing && s ? { id: s.id } : null, proofIntent: s?.intent ?? 'relative', bpc: s?.bpc ?? true, gamut: proofing && this.gamut });
      if (n === this.seq) this.engine.setViewTransform({ lut, gamut: proofing && this.gamut });
    } catch (err) {
      if (n !== this.seq) return;
      this.key = '';
      this.engine.setViewTransform(null);
      toast(`The view could not be colour-managed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
