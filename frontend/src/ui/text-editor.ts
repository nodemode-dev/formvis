import { baseDirection, fontCss, liveText, shapingLang, shiftParas, textMetrics, withParaAttrs, type Engine, type ID, type ParaAttrs, type Pt, type TextSpec } from '../engine';
import type { Project } from '../engine/project';
import { runAttrsOver, runFeatureOn, shiftRuns, withRunAttrs, withRunFeature, type RunPatch } from '../engine/opentype';
import type { RGB } from '../engine/types';
import { el, setHidden, setStyleVar } from './dom';
import { loadPrefs } from './prefs';

const PLACEHOLDER = 'Lorem ipsum dolor sit amet';
let live: TextEditor | null = null;

/** The text being typed, if any: the selected range, and the features in force over it (for the Type menu and options bar). */
export const typedRange = (): { start: number; end: number } | null => live?.selection() ?? null;
export const typedFeatureOn = (tag: string): boolean | null => live?.featureOn(tag) ?? null;
export const typedFeatureToggle = (tag: string): boolean => live?.toggleFeature(tag) ?? false;
export const typedStyle = (patch: RunPatch): boolean => live?.styleRange(patch) ?? false;
export const typedAttrs = (): { color: RGB; family: string; bold: boolean; italic: boolean; underline: boolean; strike: boolean; caps?: 'all' | 'small'; scaleX: number; scaleY: number } | null => live?.rangeAttrs() ?? null;
/** The settings of the paragraph under the caret, and a change to those under the caret or selection; both are for text of two paragraphs or more being typed (a single paragraph takes the layer's own). */
export type ParaPatch = Partial<Record<keyof ParaAttrs, unknown>>;
export const typedParas = (): ParaAttrs | null => live?.paragraphAttrs() ?? null;
export const typedParaSet = (patch: ParaPatch): boolean => live?.styleParagraphs(patch) ?? false;

/** Typing on the canvas: one kept text box over the stage, set in the text's own font, size, colour and line spacing
 *  at the current zoom, with its first baseline on the click (or on an existing layer's first baseline, the layer
 *  hidden meanwhile). The engine renders the text when it commits. Ctrl or Cmd with Enter, a click elsewhere with the
 *  Type tool, or a change of tool commits; Escape cancels. The Type tool's options restyle it as you type. */
export class TextEditor {
  private readonly box = el<HTMLTextAreaElement>('<textarea class="cv-type-editor" wrap="off" spellcheck="true" aria-label="Text" hidden></textarea>');
  private session: { project: Project; at: Pt; layerId: ID | null; spec: TextSpec; scale: number; mask?: boolean; shift?: Pt } | null = null;

  private typed = '';
  private lastPara = -1;

  constructor(host: HTMLElement, private readonly engine: Engine) {
    live = this;
    host.appendChild(this.box);
    this.box.addEventListener('input', (e) => { this.curl(e as InputEvent); this.follow(); this.place(); });
    document.addEventListener('cv:type-commit', () => { void this.commit(); });
    document.addEventListener('cv:type-cancel', () => this.cancel());
    this.box.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); if (loadPrefs().escCommit) void this.commit(); else this.cancel(); }
      else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void this.commit(); }
      else if ((e.metaKey || e.ctrlKey) && e.altKey && /^Arrow(Left|Right|Up|Down)$/.test(e.key)) {   // moves the text being typed, by a pixel (Shift: ten)
        e.preventDefault();
        const n = e.shiftKey ? 10 : 1;
        this.moveBy(e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0, e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0);
      }
      else if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.code === 'Period' || e.code === 'Comma')) { e.preventDefault(); this.nudgeSize(e.code === 'Period' ? 1 : -1, e.altKey ? 10 : 2); }
      else if (e.altKey && !e.metaKey && !e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); this.nudgeSpacing('tracking', e.key === 'ArrowRight' ? 1 : -1, e.shiftKey ? 100 : 20); }
      else if (e.altKey && !e.metaKey && !e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); this.nudgeSpacing('lineHeight', e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 0.25 : 0.05); }
    });
    engine.on('viewport', () => this.place());
    engine.on('tool', () => { if (engine.tool !== 'type') void this.commit(); });
    engine.on('active', () => { if (this.session && this.session.project !== engine.current) this.cancel(); });
    document.addEventListener('cv:type-settings', () => this.restyle());
    document.addEventListener('cv:type-move', (e) => { const d = (e as CustomEvent<Pt>).detail; if (d) this.moveBy(d.x, d.y); });
    // Ctrl or Cmd with a drag on the text itself moves it as well (the Type tool does so for a drag outside it).
    this.box.addEventListener('pointerdown', (e) => {
      if (!this.session || e.button !== 0 || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const box = this.box;
      let lx = e.clientX, ly = e.clientY;
      box.setPointerCapture(e.pointerId);
      const move = (m: PointerEvent): void => {
        const v = this.engine.current?.viewport, r = -((v?.rotation ?? 0) * Math.PI) / 180, k = v?.zoom || 1, dx = m.clientX - lx, dy = m.clientY - ly;
        lx = m.clientX; ly = m.clientY;
        this.moveBy((dx * Math.cos(r) - dy * Math.sin(r)) / k, (dx * Math.sin(r) + dy * Math.cos(r)) / k);
      };
      const up = (): void => { box.removeEventListener('pointermove', move); box.removeEventListener('pointerup', up); box.removeEventListener('pointercancel', up); };
      box.addEventListener('pointermove', move);
      box.addEventListener('pointerup', up);
      box.addEventListener('pointercancel', up);
    });
    for (const ev of ['keyup', 'pointerup', 'select'] as const) this.box.addEventListener(ev, () => this.syncPara());
  }

  get editing(): boolean { return this.session !== null; }

  /** The runs follow an edit of the typed text: what is before and after the change keeps its features. */
  private follow(): void {
    const s = this.session, now = this.box.value;
    if (s?.spec.runs?.length) s.spec = { ...s.spec, runs: shiftRuns(s.spec.runs, this.typed, now) };
    if (s?.spec.paras?.length) s.spec = { ...s.spec, paras: shiftParas(s.spec.paras, this.typed, now) };
    this.typed = now;
    this.syncPara();
  }

  /** The paragraph the caret is in (paragraphs are set apart by line breaks). */
  private caretPara(): number {
    const b = this.box;
    let n = 0;
    for (let i = b.value.indexOf('\n'); i !== -1 && i < b.selectionStart; i = b.value.indexOf('\n', i + 1)) n += 1;
    return n;
  }

  /** The paragraphs the selection touches (a selection that ends at a paragraph's start does not take that paragraph). */
  private paraSpan(): { from: number; to: number } {
    const b = this.box, end = b.selectionEnd > b.selectionStart && b.value[b.selectionEnd - 1] === '\n' ? b.selectionEnd - 1 : b.selectionEnd;
    let from = 0, to = 0;
    for (let i = b.value.indexOf('\n'); i !== -1; i = b.value.indexOf('\n', i + 1)) {
      if (i < b.selectionStart) from += 1;
      if (i < end) to += 1;
    }
    return { from, to: Math.max(from, to) };
  }

  /** Tells the Paragraph panel when the caret moves to another paragraph, so it shows that paragraph's settings. */
  private syncPara(): void {
    if (!this.session) return;
    const at = this.caretPara();
    if (at === this.lastPara) return;
    this.lastPara = at;
    this.engine.emit('options', null);
  }

  /** The caret paragraph's settings, its own over the layer's; null unless the text has two paragraphs or more. */
  paragraphAttrs(): ParaAttrs | null {
    const s = this.session;
    if (!s || (!s.spec.paras?.length && !this.box.value.includes('\n'))) return null;
    const t = s.spec, p = t.paras?.[this.caretPara()] ?? {};
    const out: ParaAttrs = { align: t.align, edge: t.edge, indentFirst: t.indentFirst, indentLeft: t.indentLeft, indentRight: t.indentRight, spaceBefore: t.spaceBefore, spaceAfter: t.spaceAfter, lastLine: t.lastLine, bidi: t.bidi, ...p };
    if (p.align && p.edge === undefined) delete out.edge;
    return out;
  }

  /** Sets paragraph settings (a value sets, undefined clears) over the paragraphs the caret or selection touches; false for text of one paragraph, which the layer's own settings cover. */
  styleParagraphs(patch: ParaPatch): boolean {
    const s = this.session;
    if (!s || (!s.spec.paras?.length && !this.box.value.includes('\n'))) return false;
    const { from, to } = this.paraSpan(), count = this.box.value.split('\n').length;
    const list: ParaAttrs[] = Array.from({ length: count }, (_, i) => ({ ...(s.spec.paras?.[i] ?? {}) }));
    for (let i = from; i <= to; i++) list[i] = withParaAttrs(list[i], patch);
    while (list.length && !Object.keys(list[list.length - 1]).length) list.pop();
    s.spec = { ...s.spec, paras: list.length ? list : undefined };
    this.place();
    this.engine.emit('options', null);
    return true;
  }

  /** The selected range of the typed text (none when only a caret). */
  selection(): { start: number; end: number } | null {
    const b = this.box;
    return this.session && b.selectionEnd > b.selectionStart ? { start: b.selectionStart, end: b.selectionEnd } : null;
  }

  /** Whether `tag` is on over the selection; null with no selection. */
  featureOn(tag: string): boolean | null {
    const r = this.selection(), s = this.session;
    return r && s ? runFeatureOn(s.spec.features, s.spec.runs, r.start, r.end, tag) : null;
  }

  /** Turns `tag` on or off over the selection (a range of the text); false when nothing is selected. */
  toggleFeature(tag: string): boolean {
    const r = this.selection(), s = this.session;
    if (!r || !s) return false;
    s.spec = { ...s.spec, runs: withRunFeature(s.spec.runs, r.start, r.end, tag, !runFeatureOn(s.spec.features, s.spec.runs, r.start, r.end, tag)) };
    this.place();
    return true;
  }

  /** Sets run attributes (colour, font family, bold, italic ...) over the selection; false when nothing is selected. */
  styleRange(patch: RunPatch): boolean {
    const r = this.selection(), s = this.session;
    if (!r || !s) return false;
    s.spec = { ...s.spec, runs: withRunAttrs(s.spec.runs, r.start, r.end, patch) };
    this.place();
    return true;
  }

  /** What the selected letters share (colour, family, bold, italic), over the layer's own. */
  rangeAttrs(): { color: RGB; family: string; bold: boolean; italic: boolean; underline: boolean; strike: boolean; caps?: 'all' | 'small'; scaleX: number; scaleY: number } | null {
    const r = this.selection(), s = this.session;
    if (!r || !s) return null;
    const a = runAttrsOver(s.spec.runs, r.start, r.end), t = s.spec;
    return { color: a.color ?? t.color, family: a.family ?? t.family, bold: a.bold ?? t.bold, italic: a.italic ?? t.italic, underline: a.underline ?? !!t.underline, strike: a.strike ?? !!t.strike, caps: a.caps ?? t.caps, scaleX: a.scaleX ?? t.scaleX ?? 100, scaleY: a.scaleY ?? t.scaleY ?? 100 };
  }

  /** Starts typing new text whose first baseline begins at (x, y), or edits type layer `layerId`; a session already
   *  open is committed first. */
  begin(target: { x: number; y: number; box?: { w: number; h: number } } | { layerId: ID }): void {
    void this.commit();
    const e = this.engine, p = e.current;
    if (!p) return;
    if ('layerId' in target) {
      const l = p.layer(target.layerId);
      if (!l?.text || !l.raster || !liveText(l)) return;
      const t = l.transform, scale = t.w / l.raster.width, m = textMetrics(l.text);
      const x = l.text.align === 'center' ? t.x + t.w / 2 : l.text.align === 'right' ? t.x + t.w - m.pad * scale : t.x + m.pad * scale;
      this.session = { project: p, at: { x, y: t.y + (m.pad + m.ascent) * (t.h / l.raster.height) }, layerId: l.id, spec: { ...l.text }, scale };
      e.textSettings = { ...l.text, content: '', rendered: undefined, runs: undefined, paras: undefined };
      e.emit('options', null);
      e.setTextEditing(l.id);
      this.box.value = l.text.content;
    } else {
      // A dragged box makes paragraph text; the tool's kind makes it vertical, or a mask (a selection, not a layer).
      this.session = { project: p, at: { x: target.x, y: target.y }, layerId: null, spec: { ...e.textSettings, content: '', color: e.fg, rendered: undefined, runs: undefined, box: target.box ?? null }, scale: 1, mask: e.typeMask };
      this.box.value = loadPrefs().placeholderText ? PLACEHOLDER : '';
    }
    this.typed = this.box.value;
    this.lastPara = -1;
    queueMicrotask(() => e.emit('options', null));
    setHidden(this.box, false);
    this.place();
    this.box.focus();
    if (this.box.value === PLACEHOLDER && !('layerId' in target)) this.box.select();   // typing replaces the placeholder
  }

  /** Preferences > Type > Use Smart Quotes: a typed straight quote becomes the curly one that fits what comes before it. */
  private curl(e: InputEvent): void {
    if (e.inputType !== 'insertText' || (e.data !== '"' && e.data !== "'") || !loadPrefs().smartQuotes) return;
    const b = this.box, at = b.selectionStart;
    if (at < 1) return;
    const before = at > 1 ? b.value[at - 2] : '', open = before === '' || /[\s(\[{]/.test(before) || [0x2014, 0x2013].includes(before.charCodeAt(0)) || before === '“' || before === '‘';
    b.setRangeText(e.data === '"' ? (open ? '“' : '”') : (open ? '‘' : '’'), at - 1, at, 'end');
  }

  /** Renders what was typed into its layer and closes the box; empty new text is dropped, and emptied existing text
   *  keeps its old text. */
  async commit(): Promise<void> {
    const s = this.session;
    if (!s) return;
    const spec: TextSpec = { ...s.spec, content: this.box.value.replace(/\r\n?/g, '\n') };
    this.end();
    if (this.engine.current !== s.project || !spec.content.trim()) return;
    if (s.layerId) await this.engine.updateTextLayer(s.layerId, spec, s.shift);
    else if (s.mask) await this.engine.createTextSelection(s.at, spec);
    else await this.engine.createTextLayer(s.at, spec);
  }

  cancel(): void { this.end(); }

  /** Ctrl drag with the Type tool while typing: the text being typed (a new one, or an existing layer's) moves by (dx, dy) document pixels. */
  moveBy(dx: number, dy: number): void {
    const s = this.session;
    if (!s) return;
    s.at = { x: s.at.x + dx, y: s.at.y + dy };
    if (s.layerId) s.shift = { x: (s.shift?.x ?? 0) + dx, y: (s.shift?.y ?? 0) + dy };
    this.place();
    if (document.activeElement !== this.box) this.box.focus({ preventScroll: true });
  }

  /** Puts `text` at the caret (over a selection) of the text being typed; false when nothing is being typed. */
  insertAtCaret(text: string): boolean {
    if (!this.session) return false;
    const b = this.box, a = b.selectionStart, z = b.selectionEnd;
    b.setRangeText(text, a, z, 'end');
    b.focus();
    this.place();
    return true;
  }

  private end(): void {
    this.session = null;
    this.engine.setTextEditing(null);
    setHidden(this.box, true);
    this.box.blur();
    this.engine.emit('options', null);
  }

  /** Type size shortcuts: Ctrl or Cmd with Shift and . or , grows or shrinks the size by 2 (Alt: 10), for the text being typed. */
  private nudgeSize(dir: 1 | -1, step: number): void {
    const e = this.engine;
    e.textSettings = { ...e.textSettings, size: Math.min(2000, Math.max(1, Math.round(e.textSettings.size) + dir * step)) };
    e.emit('options', null);
    document.dispatchEvent(new CustomEvent('cv:type-settings'));
  }

  /** Alt with Left or Right changes the tracking by 20 thousandths of an em (Shift: 100); Alt with Up or Down the leading by 0.05 of the size (Shift: 0.25). */
  private nudgeSpacing(key: 'tracking' | 'lineHeight', dir: 1 | -1, step: number): void {
    const e = this.engine, t = e.textSettings;
    e.textSettings = key === 'tracking'
      ? { ...t, tracking: Math.min(10000, Math.max(-1000, Math.round(t.tracking + dir * step))) }
      : { ...t, lineHeight: Math.min(4, Math.max(0.5, Math.round((t.lineHeight + dir * step) * 100) / 100)) };
    e.emit('options', null);
    document.dispatchEvent(new CustomEvent('cv:type-settings'));
  }

  private restyle(): void {
    const s = this.session, t = this.engine.textSettings;
    if (!s) return;
    s.spec = { ...s.spec, antialias: t.antialias, hyphenate: t.hyphenate, language: t.language, shaping: t.shaping, family: t.family, size: t.size, align: t.align, bold: t.bold, italic: t.italic, lineHeight: t.lineHeight, tracking: t.tracking, kerning: t.kerning, features: t.features, weight: t.weight, angle: t.angle, caps: t.caps, scaleX: t.scaleX, scaleY: t.scaleY, baselineShift: t.baselineShift, underline: t.underline, strike: t.strike, variations: t.variations, indentFirst: t.indentFirst, indentLeft: t.indentLeft, indentRight: t.indentRight, spaceBefore: t.spaceBefore, spaceAfter: t.spaceAfter, lastLine: t.lastLine, bidi: t.bidi, edge: t.edge };
    this.place();
  }

  /** Sets the box's font, colour and size to its text at the current zoom, then puts its first baseline on the anchor. */
  /** Placed on the drawing surfaces' space, then turned with the view about the stage's centre (Rotate View). */
  private place(): void {
    this.placeFlat();
    const v = this.engine.current?.viewport, box = this.box, deg = v?.rotation ?? 0;
    if (!deg) { box.style.transform = ''; return; }
    const host = box.parentElement as HTMLElement, x = parseFloat(box.style.getPropertyValue('--x')) || 0, y = parseFloat(box.style.getPropertyValue('--y')) || 0;
    box.style.transformOrigin = `${host.clientWidth / 2 - x}px ${host.clientHeight / 2 - y}px`;
    box.style.transform = `rotate(${deg}deg)`;
  }

  private placeFlat(): void {
    const s = this.session, v = this.engine.current?.viewport;
    if (!s || !v) return;
    const size = s.spec.size * v.zoom * s.scale, screen: TextSpec = { ...s.spec, size }, m = textMetrics(screen), line = size * s.spec.lineHeight;
    const box = this.box, c = s.spec.color;
    setStyleVar(box, '--font', fontCss(screen));
    setStyleVar(box, '--lh', `${line}px`);
    setStyleVar(box, '--ink', `rgb(${c.r},${c.g},${c.b})`);
    setStyleVar(box, '--align', s.spec.edge && (s.spec.align === 'left' || s.spec.align === 'right') ? (s.spec.edge === 'start' ? 'start' : 'end') : s.spec.align);
    // Tracking at the on-screen size, and kerning, so typed text is spaced as it will render.
    setStyleVar(box, '--ls', `${(s.spec.tracking / 1000) * size}px`);
    setStyleVar(box, '--kern', s.spec.kerning === 'none' ? 'none' : 'normal');
    const vertical = s.spec.direction === 'vertical', area = s.spec.box;
    box.classList.toggle('is-box', !!area);
    box.classList.toggle('is-vertical', vertical);
    box.classList.toggle('is-mask', !!s.mask);
    box.classList.toggle('is-bidi', !!s.spec.paras?.some((p) => p?.bidi));   // paragraphs of their own directions: each one's base follows its own text
    const dir = baseDirection(s.spec);
    if (box.dir !== dir) box.dir = dir;
    const lang = s.spec.language || shapingLang(s.spec);
    if (box.lang !== lang) box.lang = lang;
    box.setAttribute('wrap', area ? 'soft' : 'off');
    if (area) {   // paragraph text: the box itself, wrapping as typed
      setStyleVar(box, '--x', `${v.panX + s.at.x * v.zoom}px`); setStyleVar(box, '--y', `${v.panY + s.at.y * v.zoom}px`);
      setStyleVar(box, '--w', `${area.w * v.zoom}px`); setStyleVar(box, '--h', `${area.h * v.zoom}px`);
      return;
    }
    setStyleVar(box, '--w', '0px');
    setStyleVar(box, '--h', '0px');
    const w = Math.max(size * 0.6, box.scrollWidth + 2), h = Math.max(line, box.scrollHeight);
    setStyleVar(box, '--w', `${w}px`);
    setStyleVar(box, '--h', `${h}px`);
    const ax = v.panX + s.at.x * v.zoom, ay = v.panY + s.at.y * v.zoom, first = (line - (m.ascent + m.descent)) / 2 + m.ascent;
    if (vertical) {   // vertical type: its first column centred on the click, reading down
      setStyleVar(box, '--x', `${ax - w + line / 2}px`); setStyleVar(box, '--y', `${ay}px`);
      return;
    }
    setStyleVar(box, '--x', `${s.spec.align === 'center' ? ax - w / 2 : s.spec.align === 'right' ? ax - w : ax}px`);
    setStyleVar(box, '--y', `${ay - first}px`);
  }
}
