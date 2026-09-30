import { CONTOURS, DEFAULT_GLOBAL_LIGHT, MAX_EXTRA, MULTI_EFFECTS, defaultEffects, effectsActive, instances, withGlobalLight, type ContourId, type EffectExtras, type Engine, type GlobalLight, type LayerEffects, type MultiEffect, type RGB, allPatterns } from '../../engine';
import { BLEND_IF_IDENTITY, type BlendIf } from '../../engine/types';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { checkRow, sliderRow } from './controls';

const hex = (c: RGB): string => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const fromHex = (h: string): RGB => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });

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
  private blending: { blendIf: BlendIf; knockout: 'none' | 'shallow' | 'deep' } = { blendIf: structuredClone(BLEND_IF_IDENTITY), knockout: 'none' };
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
      select.addEventListener('change', () => { set(select.value); this.changed(); });
      this.field(label, select);
      this.syncs.push(() => { select.value = get(); });
    };
    const contours = CONTOURS.map((c) => [c.id, c.label] as [string, string]);
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
    const bl = (): { blendIf: BlendIf; knockout: 'none' | 'shallow' | 'deep' } => this.blending;
    this.body.appendChild(el('<p class="cv-dialog-note">Blending Options (M2): Knockout punches through what lies below; Blend If shows the layer only inside each range, each end feathered between its two values.</p>'));
    choice('Knockout', [['none', 'None'], ['shallow', 'Shallow'], ['deep', 'Deep']], () => bl().knockout, (v) => { bl().knockout = v as 'none' | 'shallow' | 'deep'; });
    choice('Blend If', [['gray', 'Gray'], ['r', 'Red'], ['g', 'Green'], ['b', 'Blue']], () => bl().blendIf.channel, (v) => { bl().blendIf.channel = v as BlendIf['channel']; });
    for (const [side, label] of [['thisLayer', 'This Layer'], ['underlying', 'Underlying Layer']] as const) for (const [k, name] of [[0, 'black start'], [1, 'black end'], [2, 'white start'], [3, 'white end']] as const) {
      slider(`${label}: ${name}`, 0, 255, () => bl().blendIf[side][k], (v) => { const r = bl().blendIf[side]; r[k] = v; if (k === 0 && r[1] < v) r[1] = v; if (k === 1 && r[0] > v) r[0] = v; if (k === 2 && r[3] < v) r[3] = v; if (k === 3 && r[2] > v) r[2] = v; });
    }
    check('Drop Shadow', () => fx().dropShadow.enabled, (v) => { fx().dropShadow.enabled = v; });
    multi('dropShadow');
    colour('Colour', () => fx().dropShadow.color, (c) => { fx().dropShadow.color = c; });
    slider('Opacity (%)', 0, 100, () => Math.round(fx().dropShadow.opacity * 100), (v) => { fx().dropShadow.opacity = v / 100; });
    slider('Angle (\u00b0)', -180, 180, () => fx().dropShadow.angle, (v) => { fx().dropShadow.angle = v; });
    check('Use Global Light', () => !!fx().dropShadow.useGlobal, (v) => { fx().dropShadow.useGlobal = v; });
    slider('Distance (px)', 0, 200, () => fx().dropShadow.distance, (v) => { fx().dropShadow.distance = v; });
    slider('Size (px)', 0, 100, () => fx().dropShadow.size, (v) => { fx().dropShadow.size = v; });
    choice('Contour', contours, () => fx().dropShadow.contour ?? 'linear', (v) => { fx().dropShadow.contour = v as ContourId; });
    check('Outer Glow', () => fx().outerGlow.enabled, (v) => { fx().outerGlow.enabled = v; });
    colour('Colour', () => fx().outerGlow.color, (c) => { fx().outerGlow.color = c; });
    slider('Opacity (%)', 0, 100, () => Math.round(fx().outerGlow.opacity * 100), (v) => { fx().outerGlow.opacity = v / 100; });
    slider('Size (px)', 0, 100, () => fx().outerGlow.size, (v) => { fx().outerGlow.size = v; });
    choice('Contour', contours, () => fx().outerGlow.contour ?? 'linear', (v) => { fx().outerGlow.contour = v as ContourId; });
    check('Stroke', () => fx().stroke.enabled, (v) => { fx().stroke.enabled = v; });
    multi('stroke');
    choice('Position', [['outside', 'Outside'], ['inside', 'Inside'], ['center', 'Center']], () => fx().stroke.position ?? 'outside', (v) => { fx().stroke.position = v === 'inside' || v === 'center' ? v : 'outside'; });
    colour('Colour', () => fx().stroke.color, (c) => { fx().stroke.color = c; });
    slider('Size (px)', 1, 50, () => fx().stroke.size, (v) => { fx().stroke.size = v; });
    slider('Opacity (%)', 0, 100, () => Math.round(fx().stroke.opacity * 100), (v) => { fx().stroke.opacity = v / 100; });
    check('Inner Shadow', () => fx().innerShadow.enabled, (v) => { fx().innerShadow.enabled = v; });
    multi('innerShadow');
    colour('Colour', () => fx().innerShadow.color, (c) => { fx().innerShadow.color = c; });
    slider('Opacity (%)', 0, 100, () => Math.round(fx().innerShadow.opacity * 100), (v) => { fx().innerShadow.opacity = v / 100; });
    slider('Angle (\u00b0)', -180, 180, () => fx().innerShadow.angle, (v) => { fx().innerShadow.angle = v; });
    check('Use Global Light', () => !!fx().innerShadow.useGlobal, (v) => { fx().innerShadow.useGlobal = v; });
    slider('Distance (px)', 0, 200, () => fx().innerShadow.distance, (v) => { fx().innerShadow.distance = v; });
    slider('Size (px)', 0, 100, () => fx().innerShadow.size, (v) => { fx().innerShadow.size = v; });
    choice('Contour', contours, () => fx().innerShadow.contour ?? 'linear', (v) => { fx().innerShadow.contour = v as ContourId; });
    check('Inner Glow', () => fx().innerGlow.enabled, (v) => { fx().innerGlow.enabled = v; });
    colour('Colour', () => fx().innerGlow.color, (c) => { fx().innerGlow.color = c; });
    slider('Opacity (%)', 0, 100, () => Math.round(fx().innerGlow.opacity * 100), (v) => { fx().innerGlow.opacity = v / 100; });
    slider('Size (px)', 0, 100, () => fx().innerGlow.size, (v) => { fx().innerGlow.size = v; });
    choice('Contour', contours, () => fx().innerGlow.contour ?? 'linear', (v) => { fx().innerGlow.contour = v as ContourId; });
    check('Color Overlay', () => fx().colorOverlay.enabled, (v) => { fx().colorOverlay.enabled = v; });
    multi('colorOverlay');
    colour('Colour', () => fx().colorOverlay.color, (c) => { fx().colorOverlay.color = c; });
    slider('Opacity (%)', 0, 100, () => Math.round(fx().colorOverlay.opacity * 100), (v) => { fx().colorOverlay.opacity = v / 100; });
    check('Gradient Overlay', () => fx().gradientOverlay.enabled, (v) => { fx().gradientOverlay.enabled = v; });
    multi('gradientOverlay');
    colour('From', () => fx().gradientOverlay.from, (c) => { fx().gradientOverlay.from = c; });
    colour('To', () => fx().gradientOverlay.to, (c) => { fx().gradientOverlay.to = c; });
    slider('Opacity (%)', 0, 100, () => Math.round(fx().gradientOverlay.opacity * 100), (v) => { fx().gradientOverlay.opacity = v / 100; });
    slider('Angle (\u00b0)', -180, 180, () => fx().gradientOverlay.angle, (v) => { fx().gradientOverlay.angle = v; });
    slider('Scale (%)', 10, 150, () => Math.round(fx().gradientOverlay.scale * 100), (v) => { fx().gradientOverlay.scale = v / 100; });
    check('Radial', () => fx().gradientOverlay.style === 'radial', (v) => { fx().gradientOverlay.style = v ? 'radial' : 'linear'; });
    check('Reverse', () => fx().gradientOverlay.reverse, (v) => { fx().gradientOverlay.reverse = v; });
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
    slider('Opacity (%)', 0, 100, () => Math.round(fx().patternOverlay.opacity * 100), (v) => { fx().patternOverlay.opacity = v / 100; });
    slider('Scale (%)', 10, 1000, () => Math.round(fx().patternOverlay.scale * 100), (v) => { fx().patternOverlay.scale = v / 100; });
    check('Satin', () => fx().satin.enabled, (v) => { fx().satin.enabled = v; });
    colour('Colour', () => fx().satin.color, (c) => { fx().satin.color = c; });
    slider('Opacity (%)', 0, 100, () => Math.round(fx().satin.opacity * 100), (v) => { fx().satin.opacity = v / 100; });
    slider('Angle (\u00b0)', -180, 180, () => fx().satin.angle, (v) => { fx().satin.angle = v; });
    slider('Distance (px)', 0, 250, () => fx().satin.distance, (v) => { fx().satin.distance = v; });
    slider('Size (px)', 0, 250, () => fx().satin.size, (v) => { fx().satin.size = v; });
    check('Invert', () => fx().satin.invert, (v) => { fx().satin.invert = v; });
    check('Bevel & Emboss', () => fx().bevel.enabled, (v) => { fx().bevel.enabled = v; });
    choice('Style', [['inner', 'Inner Bevel'], ['outer', 'Outer Bevel'], ['emboss', 'Emboss'], ['pillow', 'Pillow Emboss']], () => fx().bevel.style, (v) => { fx().bevel.style = v === 'outer' || v === 'emboss' || v === 'pillow' ? v : 'inner'; });
    slider('Depth (%)', 1, 1000, () => fx().bevel.depth, (v) => { fx().bevel.depth = v; });
    check('Direction down', () => fx().bevel.down, (v) => { fx().bevel.down = v; });
    slider('Size (px)', 0, 250, () => fx().bevel.size, (v) => { fx().bevel.size = v; });
    slider('Soften (px)', 0, 16, () => fx().bevel.soften, (v) => { fx().bevel.soften = v; });
    slider('Angle (\u00b0)', -180, 180, () => fx().bevel.angle, (v) => { fx().bevel.angle = v; });
    slider('Altitude (\u00b0)', 0, 90, () => fx().bevel.altitude, (v) => { fx().bevel.altitude = v; });
    check('Use Global Light', () => !!fx().bevel.useGlobal, (v) => { fx().bevel.useGlobal = v; });
    choice('Gloss Contour', contours, () => fx().bevel.gloss ?? 'linear', (v) => { fx().bevel.gloss = v as ContourId; });
    colour('Highlight', () => fx().bevel.highlight, (c) => { fx().bevel.highlight = c; });
    slider('Highlight opacity (%)', 0, 100, () => Math.round(fx().bevel.highlightOpacity * 100), (v) => { fx().bevel.highlightOpacity = v / 100; });
    colour('Shadow', () => fx().bevel.shadow, (c) => { fx().bevel.shadow = c; });
    slider('Shadow opacity (%)', 0, 100, () => Math.round(fx().bevel.shadowOpacity * 100), (v) => { fx().bevel.shadowOpacity = v / 100; });
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.onClose = () => { if (!this.applied) this.engine.previewLayerEffects(null); };
  }

  show(): void {
    const layer = this.engine.current?.activeLayer;
    if (!layer || layer.isGroup || layer.adjustment) { this.engine.notice('Select a pixel layer to give it a layer style.'); return; }
    this.layerId = layer.id;
    this.applied = false;
    this.fx = structuredClone(layer.effects ?? defaultEffects());
    this.blending = { blendIf: structuredClone(layer.blendIf ?? BLEND_IF_IDENTITY), knockout: layer.knockout ?? 'none' };
    for (const k of MULTI_EFFECTS) { this.inst[k] = instances(this.fx, k); this.sel[k] = 0; (this.fx as unknown as Record<string, unknown>)[k] = this.inst[k][0]; }
    delete this.fx.extra;
    this.light = { ...(this.engine.current?.doc.globalLight ?? DEFAULT_GLOBAL_LIGHT) };
    for (const sync of this.syncs) sync();
    this.open();
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
    if (id) { this.engine.applyStyleAndLight(id, fx, light, { blendIf: this.blending.blendIf, knockout: this.blending.knockout }); this.onApplied?.(fx ? structuredClone(fx) : null); }
  }
}
