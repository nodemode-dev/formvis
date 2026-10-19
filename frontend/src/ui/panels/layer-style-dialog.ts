import { BLEND_MODES, CONTOURS, DEFAULT_GLOBAL_LIGHT, contourCurve, customContourId, customContourPoints, type ContourPoint, MAX_EXTRA, MULTI_EFFECTS, defaultEffects, effectsActive, effectsFromData, instances, withGlobalLight, type BevelContour, type BevelTexture, type BlendMode, type ContourId, type EffectExtras, type Engine, type GlobalLight, type LayerEffects, type MultiEffect, type RGB, allPatterns } from '../../engine';
import { BLEND_IF_IDENTITY, type BlendIf, type StrokeGradient } from '../../engine/types';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { t } from '../i18n';
import { checkRow, sliderRow } from './controls';

const hex = (c: RGB): string => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const fromHex = (h: string): RGB => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });
/** The Layer Style submenu's items (1.65.2): the dialog's section each opens, and its first row's label. */
const SECTIONS = { dropShadow: 'Drop Shadow', outerGlow: 'Outer Glow', stroke: 'Stroke', innerShadow: 'Inner Shadow', innerGlow: 'Inner Glow', colorOverlay: 'Color Overlay', gradientOverlay: 'Gradient Overlay', patternOverlay: 'Pattern Overlay', satin: 'Satin', bevel: 'Bevel & Emboss' } as const;
export type StyleSection = keyof typeof SECTIONS | 'blending';
const STYLE_DEFAULT_KEY = 'formvis.layerStyleDefault';

/** Layer > Layer Style: the document's Global Light, then Drop Shadow, Outer Glow, Stroke (outside, inside or
 *  center), Inner Shadow, Inner Glow, Satin, Color Overlay, Gradient Overlay, Pattern Overlay and Bevel & Emboss for the
 *  active pixel layer, with contours on the shadows, glows and bevel, shown live while the dialog is open. OK applies
 *  the style and any change of light as one undo step; Cancel leaves the layer and the light as they were. */
export class LayerStyleDialog extends Dialog {
  private fx: LayerEffects = defaultEffects();
  private light: GlobalLight = { ...DEFAULT_GLOBAL_LIGHT };
  /** Every instance of each multi effect, and which one the controls edit. */
  private inst = {} as Record<MultiEffect, Array<LayerEffects[MultiEffect]>>;
  private sel = {} as Record<MultiEffect, number>;
  private layerId: string | null = null;
  private applied = false;
  private blending: { blendIf: BlendIf; knockout: 'none' | 'shallow' | 'deep'; channels: [boolean, boolean, boolean]; clipGroup: boolean; shapes: boolean; blend: BlendMode; opacity: number; fill: number } = { blendIf: structuredClone(BLEND_IF_IDENTITY), knockout: 'none', channels: [true, true, true], clipGroup: false, shapes: true, blend: 'normal', opacity: 1, fill: 1 };
  private readonly syncs: Array<() => void> = [];

  constructor(private readonly engine: Engine) {
    super('Layer Style', 420);
    const fx = (): LayerEffects => this.fx;
    const check = (label: string, get: () => boolean, set: (v: boolean) => void): void => {
      const row = checkRow(label, (v) => { set(v); this.changed(); });
      this.body.appendChild(row.el);
      this.syncs.push(() => row.set(get()));
    };
    const slider = (label: string, min: number, max: number, get: () => number, set: (v: number) => void): void => {
      const row = sliderRow(label, min, max, 1, (v) => { set(v); this.changed(); });
      this.body.appendChild(row.el);
      this.syncs.push(() => row.set(get()));
    };
    const colour = (label: string, get: () => RGB, set: (c: RGB) => void): void => {
      const input = el<HTMLInputElement>('<input class="cv-input" type="color">');
      input.addEventListener('input', () => { set(fromHex(input.value)); this.changed(); });
      this.field(label, input);
      this.syncs.push(() => { input.value = hex(get()); });
    };
    const choice = (label: string, options: Array<[string, string]>, get: () => string, set: (v: string) => void): void => {
      const select = el<HTMLSelectElement>(`<select class="cv-input">${options.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`);
      const curved = options === contours;
      const editor = curved ? this.contourEditor(get, (id) => { set(id); this.changed(); }) : null;
      select.addEventListener('change', () => { set(select.value === 'custom' ? customContourId([{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }]) : select.value); editor?.sync(); this.changed(); });
      this.field(label, select);
      if (editor) this.field(`${label} curve`, editor.el);
      this.syncs.push(() => { const v = get(); select.value = v.startsWith('custom:') ? 'custom' : v; editor?.sync(); });
    };
    const contours: Array<[string, string]> = [...CONTOURS.map((c) => [c.id, c.label] as [string, string]), ['custom', 'Custom curve']];
    const blends = BLEND_MODES.map((m) => [m.id, m.label] as [string, string]);
    // Instances: each multi effect's controls edit the selected instance, since this.fx[k] is that very object.
    const multi = (k: MultiEffect): void => {
      const pick = el<HTMLSelectElement>('<select class="cv-input"></select>');
      const add = el<HTMLButtonElement>('<button class="cv-btn" type="button">Add</button>'), remove = el<HTMLButtonElement>('<button class="cv-btn" type="button">Remove</button>');
      const row = el('<div class="cv-row-actions"></div>');
      row.append(pick, add, remove);
      this.field('Instances', row);
      const choose = (i: number): void => { this.sel[k] = i; (this.fx as unknown as Record<string, unknown>)[k] = this.inst[k][i]; for (const s of this.syncs) s(); this.changed(); };
      pick.addEventListener('change', () => choose(Number(pick.value)));
      add.addEventListener('click', () => { const list = this.inst[k]; if (list.length > MAX_EXTRA) return; list.push(structuredClone(list[this.sel[k]])); choose(list.length - 1); });
      remove.addEventListener('click', () => { const list = this.inst[k]; if (list.length <= 1) return; list.splice(this.sel[k], 1); choose(Math.min(this.sel[k], list.length - 1)); });
      this.syncs.push(() => {
        const n = this.inst[k].length;
        while (pick.options.length > n) pick.remove(pick.options.length - 1);
        for (let i = 0; i < n; i++) { const o = pick.options[i] ?? pick.appendChild(document.createElement('option')); if (o.value !== String(i)) o.value = String(i); if (o.textContent !== `${i + 1} of ${n}`) o.textContent = `${i + 1} of ${n}`; }
        pick.value = String(this.sel[k]);
        add.disabled = n > MAX_EXTRA;
        remove.disabled = n <= 1;
      });
    };
    const lightRowA = sliderRow('Global light angle (\u00b0)', -180, 180, 1, (v) => { this.light = { ...this.light, angle: v }; this.changed(); });
    const lightRowB = sliderRow('Global light altitude (\u00b0)', 0, 90, 1, (v) => { this.light = { ...this.light, altitude: v }; this.changed(); });
    this.body.append(lightRowA.el, lightRowB.el);
    this.syncs.push(() => { lightRowA.set(this.light.angle); lightRowB.set(this.light.altitude); });
    // Styles saved in the Styles panel, applied to the style being edited.
    const presetPick = el<HTMLSelectElement>('<select class="cv-input"></select>');
    this.field('Style preset', presetPick);
    presetPick.addEventListener('change', () => {
      const next = effectsFromData(this.savedStyles().find((s) => s.id === presetPick.value)?.effects);
      presetPick.value = '';
      if (!next) return;
      this.adopt(next);
      for (const s of this.syncs) s();
      this.changed();
    });
    this.syncs.push(() => {
      const list = this.savedStyles();
      while (presetPick.options.length > list.length + 1) presetPick.remove(presetPick.options.length - 1);
      [{ id: '', name: 'Choose a saved style' }, ...list].forEach((s, i) => {
        const o = presetPick.options[i] ?? presetPick.appendChild(document.createElement('option'));
        if (o.value !== s.id) o.value = s.id;
        if (o.textContent !== s.name) o.textContent = s.name;
      });
      presetPick.value = '';
    });
    const bl = (): LayerStyleDialog['blending'] => this.blending;
    this.body.appendChild(el('<p class="cv-dialog-note">Blending Options (M2): Knockout punches through what lies below; Blend If shows the layer only inside each range, each end feathered between its two values.</p>'));
    choice('Layer blend mode', blends, () => bl().blend, (v) => { bl().blend = v as BlendMode; });
    slider('Layer opacity (%)', 0, 100, () => Math.round(bl().opacity * 100), (v) => { bl().opacity = v / 100; });
    slider('Fill opacity (%)', 0, 100, () => Math.round(bl().fill * 100), (v) => { bl().fill = v / 100; });
    choice('Knockout', [['none', 'None'], ['shallow', 'Shallow'], ['deep', 'Deep']], () => bl().knockout, (v) => { bl().knockout = v as 'none' | 'shallow' | 'deep'; });
    for (const [i, name] of ['Red', 'Green', 'Blue'].entries()) check(`Channel ${name}`, () => bl().channels[i], (v) => { bl().channels[i] = v; });
    choice('Blend If', [['gray', 'Gray'], ['r', 'Red'], ['g', 'Green'], ['b', 'Blue']], () => bl().blendIf.channel, (v) => { bl().blendIf.channel = v as BlendIf['channel']; });
    for (const [side, label] of [['thisLayer', 'This Layer'], ['underlying', 'Underlying Layer']] as const) for (const [k, name] of [[0, 'black start'], [1, 'black end'], [2, 'white start'], [3, 'white end']] as const) {
      slider(t(`${label}: ${name}`), 0, 255, () => bl().blendIf[side][k], (v) => { const r = bl().blendIf[side]; r[k] = v; if (k === 0 && r[1] < v) r[1] = v; if (k === 1 && r[0] > v) r[0] = v; if (k === 2 && r[3] < v) r[3] = v; if (k === 3 && r[2] > v) r[2] = v; });
    }
    check('Blend Interior Effects as Group', () => !!fx().blendInterior, (v) => { if (v) fx().blendInterior = true; else delete fx().blendInterior; });
    check('Blend Clipped Layers as Group', () => bl().clipGroup, (v) => { bl().clipGroup = v; });
    check('Transparency Shapes Layer', () => bl().shapes, (v) => { bl().shapes = v; });
    check('Layer Mask Hides Effects',() => fx().layerMaskHides !== false, (v) => { if (v) delete fx().layerMaskHides; else fx().layerMaskHides = false; });
    check('Drop Shadow', () => fx().dropShadow.enabled, (v) => { fx().dropShadow.enabled = v; });
    multi('dropShadow');
    choice('Blend mode', blends, () => fx().dropShadow.blend, (v) => { fx().dropShadow.blend = v as BlendMode; });
    colour('Colour', () => fx().dropShadow.color, (c) => { fx().dropShadow.color = c; });
    slider('Opacity (%)', 0, 100, () => Math.round(fx().dropShadow.opacity * 100), (v) => { fx().dropShadow.opacity = v / 100; });
    slider('Angle (\u00b0)', -180, 180, () => fx().dropShadow.angle, (v) => { fx().dropShadow.angle = v; });
    check('Use Global Light', () => !!fx().dropShadow.useGlobal, (v) => { fx().dropShadow.useGlobal = v; });
    slider('Distance (px)', 0, 200, () => fx().dropShadow.distance, (v) => { fx().dropShadow.distance = v; });
    slider('Spread (%)', 0, 100, () => fx().dropShadow.spread ?? 0, (v) => { if (v > 0) fx().dropShadow.spread = v; else delete fx().dropShadow.spread; });
    slider('Size (px)', 0, 100, () => fx().dropShadow.size, (v) => { fx().dropShadow.size = v; });
    slider('Noise (%)', 0, 100, () => fx().dropShadow.noise ?? 0, (v) => { if (v > 0) fx().dropShadow.noise = v; else delete fx().dropShadow.noise; });
    choice('Contour', contours, () => fx().dropShadow.contour ?? 'linear', (v) => { fx().dropShadow.contour = v as ContourId; });
    check('Anti-aliased', () => !!fx().dropShadow.antiAlias, (v) => { if (v) fx().dropShadow.antiAlias = true; else delete fx().dropShadow.antiAlias; });
    check('Layer Knocks Out Drop Shadow', () => !!fx().dropShadow.knockout, (v) => { if (v) fx().dropShadow.knockout = true; else delete fx().dropShadow.knockout; });
    check('Outer Glow', () => fx().outerGlow.enabled, (v) => { fx().outerGlow.enabled = v; });
    choice('Blend mode', blends, () => fx().outerGlow.blend, (v) => { fx().outerGlow.blend = v as BlendMode; });
    colour('Colour', () => fx().outerGlow.color, (c) => { fx().outerGlow.color = c; });
    slider('Opacity (%)', 0, 100, () => Math.round(fx().outerGlow.opacity * 100), (v) => { fx().outerGlow.opacity = v / 100; });
    choice('Technique', [['softer', 'Softer'], ['precise', 'Precise']], () => fx().outerGlow.technique ?? 'softer', (v) => { if (v === 'precise') fx().outerGlow.technique = 'precise'; else delete fx().outerGlow.technique; });
    slider('Spread (%)', 0, 100, () => fx().outerGlow.spread ?? 0, (v) => { if (v > 0) fx().outerGlow.spread = v; else delete fx().outerGlow.spread; });
    slider('Size (px)', 0, 500, () => fx().outerGlow.size, (v) => { fx().outerGlow.size = v; });
    slider('Noise (%)', 0, 100, () => fx().outerGlow.noise ?? 0, (v) => { if (v > 0) fx().outerGlow.noise = v; else delete fx().outerGlow.noise; });
    choice('Contour', contours, () => fx().outerGlow.contour ?? 'linear', (v) => { fx().outerGlow.contour = v as ContourId; });
    check('Anti-aliased', () => !!fx().outerGlow.antiAlias, (v) => { if (v) fx().outerGlow.antiAlias = true; else delete fx().outerGlow.antiAlias; });
    slider('Range (%)', 1, 100, () => fx().outerGlow.range ?? 100, (v) => { if (v < 100) fx().outerGlow.range = v; else delete fx().outerGlow.range; });
    check('Stroke', () => fx().stroke.enabled, (v) => { fx().stroke.enabled = v; });
    multi('stroke');
    choice('Position', [['outside', 'Outside'], ['inside', 'Inside'], ['center', 'Center']], () => fx().stroke.position ?? 'outside', (v) => { fx().stroke.position = v === 'inside' || v === 'center' ? v : 'outside'; });
    colour('Colour', () => fx().stroke.color, (c) => { fx().stroke.color = c; });
    slider('Size (px)', 1, 500, () => fx().stroke.size, (v) => { fx().stroke.size = v; });
    slider('Opacity (%)', 0, 100, () => Math.round(fx().stroke.opacity * 100), (v) => { fx().stroke.opacity = v / 100; });
    const sg = (): StrokeGradient => (fx().stroke.gradient ??= { from: { r: 0, g: 0, b: 0 }, to: { r: 255, g: 255, b: 255 }, angle: 90, style: 'linear', reverse: false });
    choice('Stroke fill', [['color', 'Colour'], ['gradient', 'Gradient']], () => (fx().stroke.gradient ? 'gradient' : 'color'), (v) => { if (v === 'gradient') sg(); else delete fx().stroke.gradient; });
    colour('Gradient from', () => fx().stroke.gradient?.from ?? fx().stroke.color, (c) => { sg().from = c; });
    colour('Gradient to', () => fx().stroke.gradient?.to ?? { r: 255, g: 255, b: 255 }, (c) => { sg().to = c; });
    slider('Gradient angle (°)', -180, 180, () => fx().stroke.gradient?.angle ?? 90, (v) => { sg().angle = v; });
    check('Gradient radial', () => fx().stroke.gradient?.style === 'radial', (v) => { sg().style = v ? 'radial' : 'linear'; });
    check('Gradient reverse', () => !!fx().stroke.gradient?.reverse, (v) => { sg().reverse = v; });
    check('Inner Shadow', () => fx().innerShadow.enabled, (v) => { fx().innerShadow.enabled = v; });
    multi('innerShadow');
    choice('Blend mode', blends, () => fx().innerShadow.blend, (v) => { fx().innerShadow.blend = v as BlendMode; });
    colour('Colour', () => fx().innerShadow.color, (c) => { fx().innerShadow.color = c; });
    slider('Opacity (%)', 0, 100, () => Math.round(fx().innerShadow.opacity * 100), (v) => { fx().innerShadow.opacity = v / 100; });
    slider('Angle (\u00b0)', -180, 180, () => fx().innerShadow.angle, (v) => { fx().innerShadow.angle = v; });
    check('Use Global Light', () => !!fx().innerShadow.useGlobal, (v) => { fx().innerShadow.useGlobal = v; });
    slider('Distance (px)', 0, 200, () => fx().innerShadow.distance, (v) => { fx().innerShadow.distance = v; });
    slider('Choke (%)', 0, 100, () => fx().innerShadow.choke ?? 0, (v) => { if (v > 0) fx().innerShadow.choke = v; else delete fx().innerShadow.choke; });
    slider('Size (px)', 0, 100, () => fx().innerShadow.size, (v) => { fx().innerShadow.size = v; });
    slider('Noise (%)', 0, 100, () => fx().innerShadow.noise ?? 0, (v) => { if (v > 0) fx().innerShadow.noise = v; else delete fx().innerShadow.noise; });
    choice('Contour', contours, () => fx().innerShadow.contour ?? 'linear', (v) => { fx().innerShadow.contour = v as ContourId; });
    check('Anti-aliased', () => !!fx().innerShadow.antiAlias, (v) => { if (v) fx().innerShadow.antiAlias = true; else delete fx().innerShadow.antiAlias; });
    check('Inner Glow', () => fx().innerGlow.enabled, (v) => { fx().innerGlow.enabled = v; });
    choice('Blend mode', blends, () => fx().innerGlow.blend, (v) => { fx().innerGlow.blend = v as BlendMode; });
    colour('Colour', () => fx().innerGlow.color, (c) => { fx().innerGlow.color = c; });
    slider('Opacity (%)', 0, 100, () => Math.round(fx().innerGlow.opacity * 100), (v) => { fx().innerGlow.opacity = v / 100; });
    choice('Technique', [['softer', 'Softer'], ['precise', 'Precise']], () => fx().innerGlow.technique ?? 'softer', (v) => { if (v === 'precise') fx().innerGlow.technique = 'precise'; else delete fx().innerGlow.technique; });
    choice('Source', [['edge', 'Edge'], ['center', 'Center']], () => fx().innerGlow.source ?? 'edge', (v) => { if (v === 'center') fx().innerGlow.source = 'center'; else delete fx().innerGlow.source; });
    slider('Choke (%)', 0, 100, () => fx().innerGlow.choke ?? 0, (v) => { if (v > 0) fx().innerGlow.choke = v; else delete fx().innerGlow.choke; });
    slider('Size (px)', 0, 500, () => fx().innerGlow.size, (v) => { fx().innerGlow.size = v; });
    slider('Noise (%)', 0, 100, () => fx().innerGlow.noise ?? 0, (v) => { if (v > 0) fx().innerGlow.noise = v; else delete fx().innerGlow.noise; });
    choice('Contour', contours, () => fx().innerGlow.contour ?? 'linear', (v) => { fx().innerGlow.contour = v as ContourId; });
    check('Anti-aliased', () => !!fx().innerGlow.antiAlias, (v) => { if (v) fx().innerGlow.antiAlias = true; else delete fx().innerGlow.antiAlias; });
    check('Color Overlay', () => fx().colorOverlay.enabled, (v) => { fx().colorOverlay.enabled = v; });
    multi('colorOverlay');
    choice('Blend mode', blends, () => fx().colorOverlay.blend, (v) => { fx().colorOverlay.blend = v as BlendMode; });
    colour('Colour', () => fx().colorOverlay.color, (c) => { fx().colorOverlay.color = c; });
    slider('Opacity (%)', 0, 100, () => Math.round(fx().colorOverlay.opacity * 100), (v) => { fx().colorOverlay.opacity = v / 100; });
    check('Gradient Overlay', () => fx().gradientOverlay.enabled, (v) => { fx().gradientOverlay.enabled = v; });
    multi('gradientOverlay');
    // Changing either end sets the first or last stop of a many-stop gradient (from PSD or .asl, 36.8) and keeps the rest.
    colour('From', () => fx().gradientOverlay.from, (c) => { const g = fx().gradientOverlay; g.from = c; if (g.stops) g.stops[0] = { ...g.stops[0], color: c }; });
    colour('To', () => fx().gradientOverlay.to, (c) => { const g = fx().gradientOverlay; g.to = c; if (g.stops) g.stops[g.stops.length - 1] = { ...g.stops[g.stops.length - 1], color: c }; });
    choice('Blend mode', blends, () => fx().gradientOverlay.blend, (v) => { fx().gradientOverlay.blend = v as BlendMode; });
    slider('Opacity (%)', 0, 100, () => Math.round(fx().gradientOverlay.opacity * 100), (v) => { fx().gradientOverlay.opacity = v / 100; });
    slider('Angle (\u00b0)', -180, 180, () => fx().gradientOverlay.angle, (v) => { fx().gradientOverlay.angle = v; });
    slider('Scale (%)', 10, 150, () => Math.round(fx().gradientOverlay.scale * 100), (v) => { fx().gradientOverlay.scale = v / 100; });
    choice('Style', [['linear', 'Linear'], ['radial', 'Radial'], ['angle', 'Angle'], ['reflected', 'Reflected'], ['diamond', 'Diamond']], () => fx().gradientOverlay.style, (v) => { fx().gradientOverlay.style = v === 'radial' || v === 'angle' || v === 'reflected' || v === 'diamond' ? v : 'linear'; });
    check('Reverse', () => fx().gradientOverlay.reverse, (v) => { fx().gradientOverlay.reverse = v; });
    check('Dither', () => !!fx().gradientOverlay.dither, (v) => { if (v) fx().gradientOverlay.dither = true; else delete fx().gradientOverlay.dither; });
    choice('Method', [['classic', 'Classic'], ['perceptual', 'Perceptual'], ['linear', 'Linear']], () => fx().gradientOverlay.method ?? 'classic', (v) => { if (v === 'perceptual' || v === 'linear') fx().gradientOverlay.method = v; else delete fx().gradientOverlay.method; });
    slider('Smoothness (%)', 0, 100, () => fx().gradientOverlay.smoothness ?? 0, (v) => { if (v > 0) fx().gradientOverlay.smoothness = v; else delete fx().gradientOverlay.smoothness; });
    check('Pattern Overlay', () => fx().patternOverlay.enabled, (v) => { fx().patternOverlay.enabled = v; });
    const patternPick = el<HTMLSelectElement>('<select class="cv-input"></select>');
    patternPick.addEventListener('change', () => { fx().patternOverlay.pattern = patternPick.value; this.changed(); });
    this.field('Pattern', patternPick);
    this.syncs.push(() => {
      // The list refreshes each time the dialog opens, since patterns can be defined meanwhile; a pattern this style
      // names but that is not here shows as missing.
      const want = fx().patternOverlay.pattern, list = allPatterns().map((p) => [p.id, p.name] as [string, string]);
      if (!list.some(([id]) => id === want)) list.push([want, 'Missing pattern']);
      while (patternPick.options.length > list.length) patternPick.remove(patternPick.options.length - 1);
      list.forEach(([id, name], i) => {
        let o = patternPick.options[i];
        if (!o) { o = document.createElement('option'); patternPick.appendChild(o); }
        if (o.value !== id) o.value = id;
        if (o.textContent !== name) o.textContent = name;
      });
      patternPick.value = want;
    });
    choice('Blend mode', blends, () => fx().patternOverlay.blend, (v) => { fx().patternOverlay.blend = v as BlendMode; });
    slider('Opacity (%)', 0, 100, () => Math.round(fx().patternOverlay.opacity * 100), (v) => { fx().patternOverlay.opacity = v / 100; });
    slider('Scale (%)', 10, 1000, () => Math.round(fx().patternOverlay.scale * 100), (v) => { fx().patternOverlay.scale = v / 100; });
    slider('Angle (°)', -180, 180, () => fx().patternOverlay.angle ?? 0, (v) => { if (v !== 0) fx().patternOverlay.angle = v; else delete fx().patternOverlay.angle; });
    check('Link with Layer', () => fx().patternOverlay.link !== false, (v) => { if (v) delete fx().patternOverlay.link; else fx().patternOverlay.link = false; });
    slider('Phase X (px)', -500, 500, () => fx().patternOverlay.phaseX ?? 0, (v) => { if (v !== 0) fx().patternOverlay.phaseX = v; else delete fx().patternOverlay.phaseX; });
    slider('Phase Y (px)', -500, 500, () => fx().patternOverlay.phaseY ?? 0, (v) => { if (v !== 0) fx().patternOverlay.phaseY = v; else delete fx().patternOverlay.phaseY; });
    check('Satin', () => fx().satin.enabled, (v) => { fx().satin.enabled = v; });
    choice('Blend mode', blends, () => fx().satin.blend, (v) => { fx().satin.blend = v as BlendMode; });
    colour('Colour', () => fx().satin.color, (c) => { fx().satin.color = c; });
    slider('Opacity (%)', 0, 100, () => Math.round(fx().satin.opacity * 100), (v) => { fx().satin.opacity = v / 100; });
    slider('Angle (\u00b0)', -180, 180, () => fx().satin.angle, (v) => { fx().satin.angle = v; });
    slider('Distance (px)', 0, 250, () => fx().satin.distance, (v) => { fx().satin.distance = v; });
    slider('Size (px)', 0, 250, () => fx().satin.size, (v) => { fx().satin.size = v; });
    check('Invert', () => fx().satin.invert, (v) => { fx().satin.invert = v; });
    choice('Contour', contours, () => fx().satin.contour ?? 'linear', (v) => { if (v === 'linear') delete fx().satin.contour; else fx().satin.contour = v as ContourId; });
    check('Anti-aliased', () => !!fx().satin.antiAlias, (v) => { if (v) fx().satin.antiAlias = true; else delete fx().satin.antiAlias; });
    check('Bevel & Emboss', () => fx().bevel.enabled, (v) => { fx().bevel.enabled = v; });
    choice('Style', [['inner', 'Inner Bevel'], ['outer', 'Outer Bevel'], ['emboss', 'Emboss'], ['pillow', 'Pillow Emboss'], ['stroke', 'Stroke Emboss']], () => fx().bevel.style, (v) => { fx().bevel.style = v === 'outer' || v === 'emboss' || v === 'pillow' || v === 'stroke' ? v : 'inner'; });
    choice('Technique', [['smooth', 'Smooth'], ['chiselHard', 'Chisel Hard'], ['chiselSoft', 'Chisel Soft']], () => fx().bevel.technique ?? 'smooth', (v) => { if (v === 'chiselHard' || v === 'chiselSoft') fx().bevel.technique = v; else delete fx().bevel.technique; });
    slider('Depth (%)', 1, 1000, () => fx().bevel.depth, (v) => { fx().bevel.depth = v; });
    check('Direction down', () => fx().bevel.down, (v) => { fx().bevel.down = v; });
    slider('Size (px)', 0, 250, () => fx().bevel.size, (v) => { fx().bevel.size = v; });
    slider('Soften (px)', 0, 16, () => fx().bevel.soften, (v) => { fx().bevel.soften = v; });
    slider('Angle (\u00b0)', -180, 180, () => fx().bevel.angle, (v) => { fx().bevel.angle = v; });
    slider('Altitude (\u00b0)', 0, 90, () => fx().bevel.altitude, (v) => { fx().bevel.altitude = v; });
    check('Use Global Light', () => !!fx().bevel.useGlobal, (v) => { fx().bevel.useGlobal = v; });
    choice('Gloss Contour', contours, () => fx().bevel.gloss ?? 'linear', (v) => { fx().bevel.gloss = v as ContourId; });
    check('Gloss anti-aliased', () => !!fx().bevel.antiAlias, (v) => { if (v) fx().bevel.antiAlias = true; else delete fx().bevel.antiAlias; });
    choice('Highlight mode', blends, () => fx().bevel.highlightBlend, (v) => { fx().bevel.highlightBlend = v as BlendMode; });
    colour('Highlight', () => fx().bevel.highlight, (c) => { fx().bevel.highlight = c; });
    slider('Highlight opacity (%)', 0, 100, () => Math.round(fx().bevel.highlightOpacity * 100), (v) => { fx().bevel.highlightOpacity = v / 100; });
    choice('Shadow mode', blends, () => fx().bevel.shadowBlend, (v) => { fx().bevel.shadowBlend = v as BlendMode; });
    colour('Shadow', () => fx().bevel.shadow, (c) => { fx().bevel.shadow = c; });
    slider('Shadow opacity (%)', 0, 100, () => Math.round(fx().bevel.shadowOpacity * 100), (v) => { fx().bevel.shadowOpacity = v / 100; });
    const bc = (): BevelContour => (fx().bevel.contour ??= { enabled: false, id: 'linear', range: 0.5 }), bt = (): BevelTexture => (fx().bevel.texture ??= { enabled: false, pattern: 'builtin:checker', scale: 1, depth: 1, invert: false });
    check('Contour', () => !!fx().bevel.contour?.enabled, (v) => { bc().enabled = v; });
    choice('Contour shape', contours, () => fx().bevel.contour?.id ?? 'linear', (v) => { bc().id = v as ContourId; });
    slider('Contour range (%)', 1, 100, () => Math.round((fx().bevel.contour?.range ?? 0.5) * 100), (v) => { bc().range = v / 100; });
    check('Texture', () => !!fx().bevel.texture?.enabled, (v) => { bt().enabled = v; });
    const texturePick = el<HTMLSelectElement>('<select class="cv-input"></select>');
    texturePick.addEventListener('change', () => { bt().pattern = texturePick.value; this.changed(); });
    this.field('Texture pattern', texturePick);
    this.syncs.push(() => {
      const want = fx().bevel.texture?.pattern ?? 'builtin:checker', list = allPatterns().map((p) => [p.id, p.name] as [string, string]);
      if (!list.some(([id]) => id === want)) list.push([want, 'Missing pattern']);
      while (texturePick.options.length > list.length) texturePick.remove(texturePick.options.length - 1);
      list.forEach(([id, name], i) => {
        const o = texturePick.options[i] ?? texturePick.appendChild(document.createElement('option'));
        if (o.value !== id) o.value = id;
        if (o.textContent !== name) o.textContent = name;
      });
      texturePick.value = want;
    });
    slider('Texture scale (%)', 1, 1000, () => Math.round((fx().bevel.texture?.scale ?? 1) * 100), (v) => { bt().scale = v / 100; });
    slider('Texture depth (%)', -1000, 1000, () => Math.round((fx().bevel.texture?.depth ?? 1) * 100), (v) => { bt().depth = v / 100; });
    check('Invert texture', () => !!fx().bevel.texture?.invert, (v) => { bt().invert = v; });
    check('Texture link with layer', () => fx().bevel.texture?.link !== false, (v) => { if (v) delete bt().link; else bt().link = false; });
    this.button('Make Default', 'ghost', () => { this.saveDefault(); this.engine.notice('Layer style settings saved as the default.'); }).classList.add('cv-btn-apart');
    this.button('Reset to Default', 'ghost', () => this.resetToDefault());
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.onClose = () => { if (!this.applied) this.engine.previewLayerEffects(null); };
  }

  /** The custom contour editor shared by every contour row: points on a curve, dragged in place, a click on empty
   *  ground adds one, a double click removes one. Its points live in the contour id, so they save with the style. */
  private contourEditor(get: () => string, put: (id: ContourId) => void): { el: HTMLCanvasElement; sync: () => void } {
    const S = 160, canvas = el<HTMLCanvasElement>(`<canvas class="cv-contour-edit" width="${S}" height="${S}" style="width:${S}px;height:${S}px;touch-action:none;cursor:crosshair"></canvas>`);
    const g = canvas.getContext('2d');
    let pts: ContourPoint[] = [], drag = -1;
    const px = (p: ContourPoint): [number, number] => [4 + p.x * (S - 8), S - 4 - p.y * (S - 8)];
    const hit = (e: PointerEvent): number => {
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * S, y = ((e.clientY - r.top) / r.height) * S;
      return pts.findIndex((p) => { const [a, b] = px(p); return Math.hypot(a - x, b - y) <= 7; });
    };
    const at = (e: PointerEvent): ContourPoint => {
      const r = canvas.getBoundingClientRect();
      return { x: Math.min(1, Math.max(0, (((e.clientX - r.left) / r.width) * S - 4) / (S - 8))), y: Math.min(1, Math.max(0, 1 - (((e.clientY - r.top) / r.height) * S - 4) / (S - 8))) };
    };
    const draw = (): void => {
      if (!g) return;
      const css = getComputedStyle(canvas);
      const pick = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback;
      g.clearRect(0, 0, S, S);
      g.fillStyle = pick('--bg-tertiary', '#222127'); g.fillRect(0, 0, S, S);
      g.strokeStyle = pick('--border-light', '#34333a'); g.lineWidth = 1;
      for (let i = 0; i <= 4; i++) { const v = 4 + (i / 4) * (S - 8); g.beginPath(); g.moveTo(v, 4); g.lineTo(v, S - 4); g.moveTo(4, v); g.lineTo(S - 4, v); g.stroke(); }
      const f = pts.length >= 2 ? contourCurve(customContourId(pts)) : null;
      g.strokeStyle = pick('--accent-color', '#f97316'); g.lineWidth = 2; g.beginPath();
      for (let i = 0; i <= 64; i++) { const t = i / 64, [x, y] = px({ x: t, y: Math.min(1, Math.max(0, f ? f(t) : t)) }); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
      g.fillStyle = pick('--text-primary', '#f7f7f7');
      for (const p of pts) { const [x, y] = px(p); g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
    };
    const commit = (): void => { put(customContourId(pts)); draw(); };
    canvas.addEventListener('pointerdown', (e) => {
      const i = hit(e);
      if (i >= 0) drag = i;
      else if (pts.length < 32) { pts.push(at(e)); pts.sort((a, b) => a.x - b.x); drag = hit(e); commit(); }
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (drag < 0) return;
      const p = at(e), lo = drag > 0 ? pts[drag - 1].x + 0.002 : 0, hi = drag < pts.length - 1 ? pts[drag + 1].x - 0.002 : 1;
      pts[drag] = { x: Math.min(hi, Math.max(lo, p.x)), y: p.y };
      commit();
    });
    canvas.addEventListener('pointerup', () => { drag = -1; });
    canvas.addEventListener('dblclick', (e) => {
      const i = hit(e as unknown as PointerEvent);
      if (i >= 0 && pts.length > 2) { pts.splice(i, 1); commit(); }
    });
    const sync = (): void => {
      const own = customContourPoints(get());
      const row = canvas.parentElement;
      if (row) row.style.display = own ? '' : 'none';
      if (own && drag < 0) { pts = own; draw(); }
    };
    return { el: canvas, sync };
  }

  /** Opens on the active layer; with `focus`, scrolled to that section and, for an effect, the effect turned on. */
  show(focus?: StyleSection): void {
    const layer = this.engine.current?.activeLayer;
    if (!layer || layer.isGroup || layer.adjustment) { this.engine.notice('Select a pixel layer to give it a layer style.'); return; }
    this.layerId = layer.id;
    this.applied = false;
    this.adopt(layer.effects ?? this.baseline());
    this.blending = { blendIf: structuredClone(layer.blendIf ?? BLEND_IF_IDENTITY), knockout: layer.knockout ?? 'none', channels: layer.blendChannels ? [...layer.blendChannels] : [true, true, true], clipGroup: layer.blendClipped === true, shapes: layer.transparencyShapes !== false, blend: layer.blend, opacity: layer.opacity, fill: layer.fill ?? 1 };
    if (focus && focus !== 'blending') this.fx[focus].enabled = true;
    this.light = { ...(this.engine.current?.doc.globalLight ?? DEFAULT_GLOBAL_LIGHT) };
    for (const sync of this.syncs) sync();
    const label = focus && focus !== 'blending' ? SECTIONS[focus] : null, rows = focus ? [...this.body.querySelectorAll<HTMLElement>('.cv-field, .cv-dialog-note')] : [];
    const row = label ? rows.find((r) => r.querySelector('span')?.textContent === label) : rows.find((r) => r.classList.contains('cv-dialog-note'));
    this.open((row?.classList.contains('cv-dialog-note') ? row.nextElementSibling : row)?.querySelector<HTMLElement>('input, select'));
    this.changed();
    if (row) this.body.scrollTop += row.getBoundingClientRect().top - this.body.getBoundingClientRect().top;
  }

  /** The dialog's working style taken from `effects`, each multi effect's instances split out. */
  private adopt(effects: LayerEffects): void {
    this.fx = structuredClone(effects);
    delete this.fx.hidden;
    for (const k of MULTI_EFFECTS) { this.inst[k] = instances(this.fx, k); this.sel[k] = 0; (this.fx as unknown as Record<string, unknown>)[k] = this.inst[k][0]; }
    delete this.fx.extra;
  }

  /** The style a layer with none starts from: the settings saved by Make Default, else the factory ones; all off. */
  private baseline(): LayerEffects {
    let fx = defaultEffects();
    try {
      const saved = localStorage.getItem(STYLE_DEFAULT_KEY);
      if (saved) fx = { ...fx, ...(JSON.parse(saved) as Partial<LayerEffects>) };
    } catch { fx = defaultEffects(); }
    for (const k of Object.keys(fx) as Array<keyof LayerEffects>) { const e = fx[k] as { enabled?: boolean } | undefined; if (e && typeof e === 'object' && 'enabled' in e) e.enabled = false; }
    delete fx.extra;
    return fx;
  }

  /** The styles the Styles panel has saved, as it keeps them. */
  private savedStyles(): Array<{ id: string; name: string; effects: unknown }> {
    try {
      const r = [...(JSON.parse(localStorage.getItem('formvis.stylePresets') ?? '[]') as unknown[]), ...(this.engine.current?.doc.stylePresets ?? [])].filter((p, i, a) => !!p && a.findIndex((q) => (q as { id?: string }).id === (p as { id?: string }).id) === i) as unknown;
      return Array.isArray(r) ? r.filter((p): p is { id: string; name: string; effects: unknown } => !!p && typeof p.id === 'string' && typeof p.name === 'string') : [];
    } catch { return []; }
  }

  private saveDefault(): void {
    try { localStorage.setItem(STYLE_DEFAULT_KEY, JSON.stringify(this.assembled())); } catch { return; }
  }

  /** Every effect's settings back to the default, each effect staying on or off as it was. */
  private resetToDefault(): void {
    const on = this.assembled(), base = this.baseline();
    for (const k of Object.keys(base) as Array<keyof LayerEffects>) {
      const e = base[k] as { enabled?: boolean } | undefined, was = on[k] as { enabled?: boolean } | undefined;
      if (e && typeof e === 'object' && 'enabled' in e && was) e.enabled = !!was.enabled;
    }
    this.adopt(base);
    for (const sync of this.syncs) sync();
    this.changed();
  }

  /** What the preview shows: the pending light put into effects that use it, those flags then dropped so the
   *  document's current light does not override the pending one. */
  /** The whole style: each multi effect's first instance as the main one and the rest as extras. */
  private assembled(): LayerEffects {
    const out = structuredClone({ ...this.fx, extra: undefined }) as LayerEffects, extra: EffectExtras = {};
    for (const k of MULTI_EFFECTS) {
      const list = structuredClone(this.inst[k] ?? [this.fx[k]]);
      (out as unknown as Record<string, unknown>)[k] = list[0];
      if (list.length > 1) (extra as Record<string, unknown>)[k] = list.slice(1);
    }
    delete out.extra;
    if (Object.keys(extra).length) out.extra = extra;
    return out;
  }

  private previewFx(): LayerEffects {
    const fx = structuredClone(withGlobalLight(this.assembled(), this.light));
    delete fx.dropShadow.useGlobal; delete fx.innerShadow.useGlobal; delete fx.bevel.useGlobal;
    for (const e of [...(fx.extra?.dropShadow ?? []), ...(fx.extra?.innerShadow ?? [])]) delete e.useGlobal;
    return fx;
  }

  private changed(): void {
    if (this.layerId) this.engine.previewLayerEffects(this.layerId, this.previewFx());
  }

  /** Called when the dialog applies a style, or none, for Actions to record it. */
  onApplied: ((fx: LayerEffects | null) => void) | null = null;

  private apply(): void {
    this.applied = true;
    const whole = this.assembled(), id = this.layerId, fx = effectsActive(whole) ? whole : null, cur = this.engine.current?.doc.globalLight ?? DEFAULT_GLOBAL_LIGHT;
    const light = this.light.angle !== cur.angle || this.light.altitude !== cur.altitude ? { ...this.light } : null;
    this.close();
    if (id) { this.engine.applyStyleAndLight(id, fx, light, { blendIf: this.blending.blendIf, knockout: this.blending.knockout, channels: this.blending.channels, clipGroup: this.blending.clipGroup, shapes: this.blending.shapes, general: { blend: this.blending.blend, opacity: this.blending.opacity, fill: this.blending.fill } }); this.onApplied?.(fx ? structuredClone(fx) : null); }
  }
}
