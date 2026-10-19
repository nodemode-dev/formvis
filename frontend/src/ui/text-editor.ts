import { fontCss, liveText, textMetrics, type Engine, type ID, type Pt, type TextSpec } from '../engine';
import type { Project } from '../engine/project';
import { el, setHidden, setStyleVar } from './dom';
import { loadPrefs } from './prefs';

const PLACEHOLDER = 'Lorem ipsum dolor sit amet';

/** Typing on the canvas: one kept text box over the stage, set in the text's own font, size, colour and line spacing
 *  at the current zoom, with its first baseline on the click (or on an existing layer's first baseline, the layer
 *  hidden meanwhile). The engine renders the text when it commits. Ctrl or Cmd with Enter, a click elsewhere with the
 *  Type tool, or a change of tool commits; Escape cancels. The Type tool's options restyle it as you type. */
export class TextEditor {
  private readonly box = el<HTMLTextAreaElement>('<textarea class="cv-type-editor" wrap="off" spellcheck="true" aria-label="Text" hidden></textarea>');
  private session: { project: Project; at: Pt; layerId: ID | null; spec: TextSpec; scale: number; mask?: boolean; shift?: Pt } | null = null;

  constructor(host: HTMLElement, private readonly engine: Engine) {
    host.appendChild(this.box);
    this.box.addEventListener('input', (e) => { this.curl(e as InputEvent); this.place(); });
    this.box.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); if (loadPrefs().escCommit) void this.commit(); else this.cancel(); }
      else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void this.commit(); }
      else if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.code === 'Period' || e.code === 'Comma')) { e.preventDefault(); this.nudgeSize(e.code === 'Period' ? 1 : -1, e.altKey ? 10 : 2); }
      else if (e.altKey && !e.metaKey && !e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); this.nudgeSpacing('tracking', e.key === 'ArrowRight' ? 1 : -1, e.shiftKey ? 100 : 20); }
      else if (e.altKey && !e.metaKey && !e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); this.nudgeSpacing('lineHeight', e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 0.25 : 0.05); }
    });
    engine.on('viewport', () => this.place());
    engine.on('tool', () => { if (engine.tool !== 'type') void this.commit(); });
    engine.on('active', () => { if (this.session && this.session.project !== engine.current) this.cancel(); });
    document.addEventListener('cv:type-settings', () => this.restyle());
    document.addEventListener('cv:type-move', (e) => { const d = (e as CustomEvent<Pt>).detail; if (d) this.moveBy(d.x, d.y); });
  }

  get editing(): boolean { return this.session !== null; }

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
      e.textSettings = { ...l.text, content: '', rendered: undefined };
      e.emit('options', null);
      e.setTextEditing(l.id);
      this.box.value = l.text.content;
    } else {
      // A dragged box makes paragraph text; the tool's kind makes it vertical, or a mask (a selection, not a layer).
      this.session = { project: p, at: { x: target.x, y: target.y }, layerId: null, spec: { ...e.textSettings, content: '', color: e.fg, rendered: undefined, box: target.box ?? null }, scale: 1, mask: e.typeMask };
      this.box.value = loadPrefs().placeholderText ? PLACEHOLDER : '';
    }
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
    const before = at > 1 ? b.value[at - 2] : '', open = before === '' || /[\s(\[{—–]/.test(before) || before === '“' || before === '‘';
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
    s.spec = { ...s.spec, antialias: t.antialias, hyphenate: t.hyphenate, language: t.language, shaping: t.shaping, family: t.family, size: t.size, align: t.align, bold: t.bold, italic: t.italic, lineHeight: t.lineHeight, tracking: t.tracking, kerning: t.kerning, features: t.features, weight: t.weight, caps: t.caps, scaleX: t.scaleX, scaleY: t.scaleY, baselineShift: t.baselineShift, underline: t.underline, strike: t.strike, variations: t.variations, indentFirst: t.indentFirst, indentLeft: t.indentLeft, indentRight: t.indentRight, spaceBefore: t.spaceBefore, spaceAfter: t.spaceAfter, lastLine: t.lastLine };
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
    setStyleVar(box, '--align', s.spec.align);
    // Tracking at the on-screen size, and kerning, so typed text is spaced as it will render.
    setStyleVar(box, '--ls', `${(s.spec.tracking / 1000) * size}px`);
    setStyleVar(box, '--kern', s.spec.kerning === 'none' ? 'none' : 'normal');
    const vertical = s.spec.direction === 'vertical', area = s.spec.box;
    box.classList.toggle('is-box', !!area);
    box.classList.toggle('is-vertical', vertical);
    box.classList.toggle('is-mask', !!s.mask);
    const dir = s.spec.shaping === 'middleEastern' ? 'rtl' : 'ltr';
    if (box.dir !== dir) box.dir = dir;
    const lang = s.spec.language || (s.spec.shaping === 'eastAsian' ? 'ja' : s.spec.shaping === 'middleEastern' ? 'ar' : '');
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
