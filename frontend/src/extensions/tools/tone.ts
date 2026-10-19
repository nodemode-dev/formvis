import type { Engine, Pt } from '../../engine';
import type { OptionSpec, Tool } from '../registry';
import { brushKeys, brushOptions, drawBrushCursor } from './brush-common';

let hover: Pt | null = null;

/** Dodge, Burn and Sponge share O; each reveals a toned copy of the layer where it is brushed, and a
 *  new stroke over the same area tones it further. */
function toneTool(id: 'dodge' | 'burn' | 'sponge', label: string, order: number, hint: string): Tool {
  return {
    id, label, key: 'O', order,
    icon: () => ({ dodge: 'tDodge', burn: 'tBurn', sponge: 'tSponge' } as Record<string, string>)[id] ?? id,   // the tool line icons (Phase 21)
    hint: () => `${hint} \u00b7 [ ] size`,
    cursor: () => 'none',
    down(ctx, p) { if (p.button !== 0) return; hover = p.doc; ctx.engine.beginRetouchStroke(id, p.doc, p.shift); },
    move(ctx, p) { hover = p.doc; ctx.engine.strokeTo(p.doc); ctx.engine.emit('overlay', null); },
    up(ctx) { ctx.engine.endStroke(); },
    hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
    cancel(ctx) { ctx.engine.cancelStroke(); },
    keydown(ctx, e) { return brushKeys(ctx, e); },
    overlay(ctx, g) { drawBrushCursor(ctx, g, hover); },
    options: (e: Engine): OptionSpec[] => [
      { kind: 'title', text: label },
      ...(id === 'sponge'
        ? [
            { kind: 'segment', label: 'Mode', priority: 80, choices: [{ id: 'desaturate', label: 'Desaturate' }, { id: 'saturate', label: 'Saturate' }], get: () => e.tone.spongeMode, set: (v: string) => e.setTone({ spongeMode: v === 'saturate' ? 'saturate' : 'desaturate' }) },
            { kind: 'range', label: 'Flow', priority: 85, min: 1, max: 100, get: () => Math.round(e.tone.flow * 100), set: (v: number) => e.setTone({ flow: v / 100 }) },
            { kind: 'toggle', label: 'Vibrance', priority: 40, get: () => e.tone.vibrance, set: (v: boolean) => e.setTone({ vibrance: v }) },   // 1.50.7, the tool audit
          ] as OptionSpec[]
        : [
            { kind: 'segment', label: 'Range', priority: 80, choices: [{ id: 'shadows', label: 'Shadows' }, { id: 'midtones', label: 'Midtones' }, { id: 'highlights', label: 'Highlights' }], get: () => e.tone.range, set: (v: string) => e.setTone({ range: v === 'shadows' || v === 'highlights' ? v : 'midtones' }) },
            { kind: 'range', label: 'Exposure', priority: 80, min: 1, max: 100, get: () => Math.round(e.tone.exposure * 100), set: (v: number) => e.setTone({ exposure: v / 100 }) },
            { kind: 'toggle', label: 'Protect Tones', priority: 40, get: () => e.tone.protectTones, set: (v: boolean) => e.setTone({ protectTones: v }) },   // 1.50.7
          ] as OptionSpec[]),
      ...brushOptions(e, 'Strength'),
    ],
  };
}

export const dodgeTool = toneTool('dodge', 'Dodge', 66, 'Paint to lighten, most in the chosen tonal range');
export const burnTool = toneTool('burn', 'Burn', 67, 'Paint to darken, most in the chosen tonal range');
export const spongeTool = toneTool('sponge', 'Sponge', 68, 'Paint to take color out, or with Saturate, to strengthen it');
