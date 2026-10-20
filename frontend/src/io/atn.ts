import { ACTION_COLOURS, type Action, type ActionStep } from '../ui/actions';
import { hsvFromData } from '../engine/adjust';
import type { BlendMode } from '../engine/types';
import { fromBase64, toBase64 } from './icc-read';

/** .atn action files: a big-endian stream of actions, each a list of events with an optional descriptor.
 *  Events with a formvis equivalent become steps; the rest are kept as greyed steps holding their original bytes, so
 *  writing the file back returns them untouched, and are named in `unsupported`. */

interface Enum { kind: 'enum'; type: string; value: string; cls?: string }
interface Unit { kind: 'unit'; unit: string; value: number }
export interface Desc { cls: string; classId: string; items: Map<string, Val> }
export type Val =number | string | boolean | Val[] | Desc | Enum | Unit | null;

const isEnum = (v: Val | undefined): v is Enum => !!v && typeof v === 'object' && !Array.isArray(v) && 'kind' in v && v.kind === 'enum';
const isUnit = (v: Val | undefined): v is Unit => !!v && typeof v === 'object' && !Array.isArray(v) && 'kind' in v && v.kind === 'unit';
const isDesc = (v: Val | undefined): v is Desc => !!v && typeof v === 'object' && !Array.isArray(v) && 'items' in v;
const CHANNEL_SLOT = ['Cmps', 'Rd  ', 'Grn ', 'Bl  ', 'Blck'];
const unitOrNumber = (v: Val | undefined): number | null => (isUnit(v) ? v.value : typeof v === 'number' ? v : null);

interface FilterField { key: string; set: string; unit?: string; min: number; max: number; whole?: boolean; positive?: boolean }
interface FilterEvent { filter: string; fields: FilterField[]; keep?: Record<string, string> }
const pixels = (key: string, set: string, min: number, max: number, whole = false): FilterField => ({ key, set, unit: '#Pxl', min, max, positive: true, ...(whole ? { whole } : {}) });
const count = (key: string, set: string, min: number, max: number): FilterField => ({ key, set, min, max, whole: true });
/** Library filters whose .atn event holds plain numbers. The values sit under settings.lib as the Filter dialog keeps them;
 *  `keep` names the choices the event cannot carry, which must stay at their default for the step to be written. */
const LIB_EVENTS: Record<string, FilterEvent> = {
  'Mdn ': { filter: 'median', fields: [pixels('Rds ', 'radius', 1, 100, true)] },
  HghP: { filter: 'highPass', fields: [pixels('Rds ', 'radius', 0.1, 250)] },
  'Mxm ': { filter: 'maximum', fields: [pixels('Rds ', 'radius', 0.2, 100)], keep: { preserve: 'squareness' } },
  'Mnm ': { filter: 'minimum', fields: [pixels('Rds ', 'radius', 0.2, 100)], keep: { preserve: 'squareness' } },
  DstS: { filter: 'dustAndScratches', fields: [pixels('Rds ', 'radius', 1, 100, true), count('Thsh', 'threshold', 0, 255)] },
  Embs: { filter: 'emboss', fields: [count('Angl', 'angle', -180, 180), count('Hght', 'height', 1, 100), count('Amnt', 'amount', 1, 500)] },
  'Msc ': { filter: 'mosaic', fields: [pixels('ClSz', 'cellSize', 2, 200, true)] },
  Twrl: { filter: 'twirl', fields: [count('Angl', 'angle', -999, 999)] },
  Pnch: { filter: 'pinch', fields: [count('Amnt', 'amount', -100, 100)] },
  Sphr: { filter: 'spherize', fields: [count('Amnt', 'amount', -100, 100)], keep: { mode: 'normal' } },
};
const PLAIN_FILTERS: Record<string, string> = { 'Blr ': 'blur', BlrM: 'blurMore', Shrp: 'sharpen', ShrM: 'sharpenMore', ShrE: 'sharpenEdges', Dspc: 'despeckle', FndE: 'findEdges', Slrz: 'solarize' };
const PLAIN_BACK: Record<string, string> = Object.fromEntries(Object.entries(PLAIN_FILTERS).map(([event, filter]) => [filter, event]));

export class Reader {
  private readonly view: DataView;
  pos = 0;
  constructor(buf: ArrayBuffer) { this.view = new DataView(buf); }
  u8(): number { const v = this.view.getUint8(this.pos); this.pos += 1; return v; }
  u16(): number { const v = this.view.getUint16(this.pos, false); this.pos += 2; return v; }
  u32(): number { const v = this.view.getUint32(this.pos, false); this.pos += 4; return v; }
  i32(): number { const v = this.view.getInt32(this.pos, false); this.pos += 4; return v; }
  f64(): number { const v = this.view.getFloat64(this.pos, false); this.pos += 8; return v; }
  ascii(n: number): string {
    if (n < 0 || this.pos + n > this.view.byteLength) throw new RangeError('string past the end of the file');
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.view.getUint8(this.pos + i));
    this.pos += n;
    return s;
  }
  skip(n: number): void {
    if (n < 0 || this.pos + n > this.view.byteLength) throw new RangeError('data past the end of the file');
    this.pos += n;
  }
  /** The bytes from `from` up to `to`, copied. */
  bytes(from: number, to: number): Uint8Array { return new Uint8Array(this.view.buffer.slice(this.view.byteOffset + from, this.view.byteOffset + to)); }
  /** A Unicode string: a count of UTF-16 units including a trailing NUL, then the units. */
  unicode(): string {
    const n = this.u32();
    if (this.pos + n * 2 > this.view.byteLength) throw new RangeError('string past the end of the file');
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.u16());
    return s.replace(/\0+$/, '');
  }
  /** A length-prefixed ASCII string. */
  text(): string { return this.ascii(this.u32()); }
  /** An ID: length zero means a 4-character code follows, otherwise that many ASCII bytes. */
  id(): string { const n = this.u32(); return this.ascii(n === 0 ? 4 : n); }
}

function readReference(r: Reader): Enum | null {
  const count = r.u32();
  let found: Enum | null = null;
  for (let i = 0; i < count; i++) {
    const form = r.ascii(4);
    if (form === 'Clss') { r.unicode(); found = { kind: 'enum', type: 'Clss', value: r.id(), cls: 'Clss' }; }
    else if (form === 'Enmr') { r.unicode(); const cls = r.id(), type = r.id(); found = { kind: 'enum', type, value: r.id(), cls }; }
    else if (form === 'name') { r.unicode(); const cls = r.id(), nm = r.unicode(); if (cls === 'Lyr ') found = { kind: 'enum', type: 'name', value: nm, cls }; }
    else if (form === 'Idnt' || form === 'indx' || form === 'rele') { r.unicode(); r.id(); r.i32(); }
    else if (form === 'prop') { r.unicode(); r.id(); r.id(); }
    else throw new Error(`unknown reference form ${form}`);
  }
  return found;
}

function readValue(r: Reader, type: string): Val {
  switch (type) {
    case 'long': return r.i32();
    case 'doub': return r.f64();
    case 'UntF': { const unit = r.ascii(4); return { kind: 'unit', unit, value: r.f64() }; }
    case 'bool': return r.u8() !== 0;
    case 'TEXT': return r.unicode();
    case 'enum': { const t = r.id(); return { kind: 'enum', type: t, value: r.id() }; }
    case 'Objc': case 'GlbO': return readDescriptor(r);
    case 'VlLs': {
      const n = r.u32(), list: Val[] = [];
      for (let i = 0; i < n; i++) list.push(readValue(r, r.ascii(4)));
      return list;
    }
    case 'type': case 'GlbC': { r.unicode(); return r.id(); }
    case 'obj ': return readReference(r);
    case 'alis': case 'tdta': r.skip(r.u32()); return null;
    default: throw new Error(`unknown descriptor type ${type}`);
  }
}

export function readDescriptor(r: Reader): Desc {
  const cls = r.unicode(), classId = r.id();   // the display name (often empty) and the class ID ('RGBC', 'Grdn')
  const n = r.u32(), items = new Map<string, Val>();
  for (let i = 0; i < n; i++) {
    const key = r.id();
    items.set(key, readValue(r, r.ascii(4)));
  }
  return { cls, classId, items };
}

interface Item { enabled: boolean; event: string; name: string; desc: Desc | null }

function readItem(r: Reader): Item {
  r.u8();
  const enabled = r.u8() !== 0;
  r.u8(); r.u8();
  const tag = r.ascii(4);
  let event: string;
  if (tag === 'TEXT') event = r.text();
  else if (tag === 'long') event = r.ascii(4);
  else throw new Error(`unknown event tag ${tag}`);
  const name = r.text();
  const desc = r.i32() === -1 ? readDescriptor(r) : null;
  return { enabled, event, name, desc };
}

const LAYER_SELECT: Record<string, string> = { Frwr: 'select-layer-up', Bckw: 'select-layer-down', Frnt: 'select-layer-top', Back: 'select-layer-bottom' };
const LAYER_SELECT_BACK: Record<string, string> = Object.fromEntries(Object.entries(LAYER_SELECT).map(([ord, id]) => [id, ord]));
const BLEND_ATN: Record<string, BlendMode> = {
  Nrml: 'normal', Dslv: 'dissolve', Drkn: 'darken', Mltp: 'multiply', CBrn: 'color-burn', linearBurn: 'linear-burn', darkerColor: 'darker-color',
  Lghn: 'lighten', Scrn: 'screen', CDdg: 'color-dodge', linearDodge: 'linear-dodge', lighterColor: 'lighter-color',
  Ovrl: 'overlay', SftL: 'soft-light', HrdL: 'hard-light', vividLight: 'vivid-light', linearLight: 'linear-light', pinLight: 'pin-light', hardMix: 'hard-mix',
  Dfrn: 'difference', Xclu: 'exclusion', blendSubtraction: 'subtract', blendDivide: 'divide', H: 'hue', Strt: 'saturation', Clr: 'color', Lmns: 'luminosity',
};
const BLEND_ATN_BACK: Record<string, string> = Object.fromEntries(Object.entries(BLEND_ATN).map(([id, mode]) => [mode, id]));
const SIMPLE: Record<string, string> = { Invr: 'invert', Dstt: 'desaturate', Fltn: 'flatten', MrgV: 'merge-visible', Mrg2: 'merge-down', Dplc: 'duplicate', Dslc: 'deselect', Invs: 'inverse', Eqlz: 'equalize' };

/** A layer descriptor (the To of a Set, the Using of a Make) as a layerProps step; null when it holds anything else. */
function layerPropsFrom(to: Val | undefined, label: string, create: boolean): ActionStep | null {
  if (!isDesc(to) || to.classId !== 'Lyr ' || ![...to.items.keys()].every((k) => k === 'Nm  ' || k === 'Opct' || k === 'Vsbl' || k === 'Md  ' || k === 'fillOpacity')) return null;
  const nm = to.items.get('Nm  '), op = unitOrNumber(to.items.get('Opct')), vs = to.items.get('Vsbl'), md = to.items.get('Md  '), fl = to.items.get('fillOpacity');
  const blend = isEnum(md) && md.type === 'BlnM' ? BLEND_ATN[md.value.trim()] : undefined, fillRaw = isUnit(fl) ? fl.value : typeof fl === 'number' ? (fl / 255) * 100 : null;
  if (to.items.has('Md  ') && blend === undefined) return null;
  if (fl !== undefined && fillRaw === null) return null;
  if (!(typeof nm === 'string' && nm.trim()) && op === null && typeof vs !== 'boolean' && blend === undefined && fillRaw === null) return null;
  return { kind: 'layerProps', label, ...(create ? { create: true } : {}), ...(typeof nm === 'string' && nm.trim() ? { name: nm.trim().slice(0, 200) } : {}), ...(op !== null ? { opacity: Math.min(100, Math.max(0, op)) } : {}), ...(typeof vs === 'boolean' ? { visible: vs } : {}), ...(blend !== undefined ? { blend } : {}), ...(fillRaw !== null ? { fill: Math.min(100, Math.max(0, Math.round(fillRaw))) } : {}) };
}

/** The step an item stands for, or null when formvis has no equivalent. */
function stepFor(it: Item): ActionStep | null {
  const label = it.name || it.event;
  const cmd = (id: string): ActionStep => ({ kind: 'command', id, label });
  const simple = SIMPLE[it.event];
  const get = (k: string): Val | undefined => it.desc?.items.get(k);
  const target = get('null'), onLayer = isEnum(target) && target.cls === 'Lyr ' && target.type === 'Ordn' ? target.value.trim() : null;
  if (simple && !(it.event === 'Dplc' && isEnum(target) && onLayer === null)) return cmd(simple);
  if (it.event === 'Mk  ' && isEnum(target) && target.type === 'Clss' && target.value === 'Lyr ' && it.desc?.items.size === 1) return cmd('new-layer');
  if (it.event === 'Dlt ' && onLayer === 'Trgt') return cmd('delete-layer');
  if (it.event === 'slct' && onLayer) {
    const to = LAYER_SELECT[onLayer];
    return to ? cmd(to) : null;
  }
  if (it.event === 'slct' && isEnum(target) && target.cls === 'Lyr ' && target.type === 'name' && target.value.trim() && it.desc?.items.size === 1) return { kind: 'selectLayer', label, name: target.value.slice(0, 200) };
  if (it.event === 'setd' && onLayer === 'Trgt') return layerPropsFrom(get('T   '), label, false);
  if (it.event === 'Mk  ' && isEnum(target) && target.type === 'Clss' && target.value === 'Lyr ' && it.desc?.items.size === 2) return layerPropsFrom(get('Usng'), label, true);
  if (it.event === 'setd') {
    const to = get('T   ');
    if (isEnum(to) && to.type.trim() === 'Ordn') {
      const v = to.value.trim();
      if (v === 'Al') return cmd('select-all');
      if (v === 'None') return cmd('deselect');
    }
    return null;
  }
  if (it.event === 'Flip') {
    const axis = get('Axis') ?? get('Axs ');
    if (isEnum(axis)) {
      if (axis.value === 'Hrzn') return cmd('flip-canvas-h');
      if (axis.value === 'Vrtc') return cmd('flip-canvas-v');
    }
    return null;
  }
  if (it.event === 'Stop') {
    const msg = get('Msge'), go = get('Cntn');
    return { kind: 'stop', label, message: typeof msg === 'string' ? msg.slice(0, 500) : '', allowContinue: go !== false };
  }
  if (it.event === 'GsnB') {
    const rds = get('Rds ');
    const radius = isUnit(rds) ? rds.value : typeof rds === 'number' ? rds : null;
    if (radius === null || !(radius > 0)) return null;
    return { kind: 'filter', filter: 'gaussianBlur', label, settings: { radius: Math.min(250, Math.max(0.1, radius)) } };
  }
  if (it.event === 'UnsM') {
    const num = (v: Val | undefined): number | null => (isUnit(v) ? v.value : typeof v === 'number' ? v : null);
    const amount = num(get('Amnt')), radius = num(get('Rds ')), threshold = num(get('Thsh')) ?? 0;
    if (amount === null || radius === null || !(amount > 0) || !(radius > 0)) return null;
    return { kind: 'filter', filter: 'unsharpMask', label, settings: { usmAmount: Math.min(500, Math.max(1, amount)), usmRadius: Math.min(1000, Math.max(0.1, radius)), threshold: Math.min(255, Math.max(0, Math.round(threshold))) } };
  }
  if (it.event === 'MtnB') {
    const num = (v: Val | undefined): number | null => (isUnit(v) ? v.value : typeof v === 'number' ? v : null);
    const angle = num(get('Angl')), dist = num(get('Dstn'));
    if (angle === null || dist === null || !(dist >= 1)) return null;
    return { kind: 'filter', filter: 'motionBlur', label, settings: { angle: Math.min(180, Math.max(-180, angle)), distance: Math.min(2000, dist) } };
  }
  const lib = LIB_EVENTS[it.event];
  if (lib) {
    const values: Record<string, number> = {};
    for (const f of lib.fields) {
      const n = unitOrNumber(get(f.key));
      if (n === null || !Number.isFinite(n) || (f.positive && !(n > 0))) return null;
      const c = Math.min(f.max, Math.max(f.min, n));
      values[f.set] = f.whole ? Math.round(c) : c;
    }
    return { kind: 'filter', filter: lib.filter, label, settings: { lib: { [lib.filter]: values } } };
  }
  if (PLAIN_FILTERS[it.event]) return { kind: 'filter', filter: PLAIN_FILTERS[it.event], label, settings: {} };
  if (it.event === 'AdNs') {
    const amount = unitOrNumber(get('Nose')), spread = get('Dstr'), mono = get('Mnch');
    if (amount === null || !(amount > 0)) return null;
    return { kind: 'filter', filter: 'addNoise', label, settings: { amount: Math.min(400, Math.max(0.1, amount)), gaussian: isEnum(spread) && spread.value.trim() === 'Gsn', monochromatic: mono === true } };
  }
  const adjust = (adj: string, data: Record<string, unknown>): ActionStep => ({ kind: 'adjustment', adj, label, data, layer: false });
  if (it.event === 'BrgC') {
    const brightness = unitOrNumber(get('Brgh')), contrast = unitOrNumber(get('Cntr'));
    if (brightness === null || contrast === null) return null;
    return adjust('brightnessContrast', { brightness: Math.min(150, Math.max(-150, Math.round(brightness))), contrast: Math.min(100, Math.max(-50, Math.round(contrast))), legacy: get('useLegacy') === true });
  }
  if (it.event === 'Pstr' || it.event === 'Thrs') {
    const n = unitOrNumber(get(it.event === 'Pstr' ? 'Lvls' : 'Lvl '));
    if (n === null || !Number.isFinite(n)) return null;
    return it.event === 'Pstr' ? adjust('posterize', { levels: Math.min(255, Math.max(2, Math.round(n))) }) : adjust('threshold', { level: Math.min(255, Math.max(1, Math.round(n))) });
  }
  if (it.event === 'Lvls' || it.event === 'Crvs') {
    const adjs = get('Adjs');
    if (!Array.isArray(adjs) || !adjs.length) return null;
    const slot = (d: Val): number => { const ch = isDesc(d) ? d.items.get('Chnl') : undefined; return isEnum(ch) ? CHANNEL_SLOT.indexOf(ch.value) : -1; };
    if (it.event === 'Lvls') {
      const ranges = [0, 1, 2, 3, 4].map(() => ({ black: 0, gamma: 1, white: 255, outputBlack: 0, outputWhite: 255 }));
      for (const d of adjs) {
        const at = isDesc(d) ? slot(d) : -1;
        if (!isDesc(d) || at < 0 || at > 3) return null;
        const inp = d.items.get('Inpt'), out = d.items.get('Otpt'), gm = d.items.get('Gmm ');
        const pair = (v: Val | undefined, lo: number, hi: number): [number, number] | null => (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number' && v[0] >= lo && v[1] <= hi ? [v[0], v[1]] : null);
        const i = pair(inp, 0, 255) ?? [0, 255], o = pair(out, 0, 255) ?? [0, 255];
        const gamma = typeof gm === 'number' ? (Number.isInteger(gm) ? gm / 100 : gm) : 1;
        if (!(i[0] < i[1]) || !(gamma >= 0.1 && gamma <= 9.99)) return null;
        ranges[at] = { black: i[0], gamma, white: i[1], outputBlack: o[0], outputWhite: o[1] };
      }
      return adjust('levels', { levels: { channel: 'RGB', ranges } });
    }
    const channels = [0, 1, 2, 3, 4].map(() => [{ x: 0, y: 0 }, { x: 255, y: 255 }]);
    for (const d of adjs) {
      const at = isDesc(d) ? slot(d) : -1;
      const pts = isDesc(d) ? d.items.get('Crv ') : undefined;
      if (!isDesc(d) || at < 0 || at > 3 || !Array.isArray(pts) || pts.length < 2 || pts.length > 16) return null;
      const knots: Array<{ x: number; y: number }> = [];
      for (const p of pts) {
        const x = isDesc(p) ? unitOrNumber(p.items.get('Hrzn')) : null, y = isDesc(p) ? unitOrNumber(p.items.get('Vrtc')) : null;
        if (x === null || y === null || !(x >= 0 && x <= 255 && y >= 0 && y <= 255)) return null;
        knots.push({ x, y });
      }
      channels[at] = knots;
    }
    return adjust('curves', { curves: { channel: 'RGB', channels } });
  }
  if (it.event === 'HStr') {
    const adjs = get('Adjs'), first = Array.isArray(adjs) && adjs.length === 1 ? adjs[0] : null;
    if (!isDesc(first)) return null;
    const h = unitOrNumber(first.items.get('H   ')), s = unitOrNumber(first.items.get('Strt')), l = unitOrNumber(first.items.get('Lght'));
    if (h === null || s === null || l === null) return null;
    const colorize = get('Clrz') === true;
    return adjust('hsv', { hue: Math.min(colorize ? 360 : 180, Math.max(colorize ? 0 : -180, Math.round(h))), saturation: Math.min(100, Math.max(colorize ? 0 : -100, Math.round(s))), lightness: Math.min(100, Math.max(-100, Math.round(l))), colorize });
  }
  if (it.event === 'ImgS') {
    const w = get('Wdth'), h = get('Hght'), res = get('Rslt');
    const px = (v: Val | undefined): number | null => (isUnit(v) ? v.value : typeof v === 'number' ? v : null);
    const wv = px(w), hv = px(h), rv = px(res);
    if (wv === null || hv === null || !(wv >= 1) || !(hv >= 1) || (isUnit(w) && w.unit !== '#Pxl') || (isUnit(h) && h.unit !== '#Pxl')) return null;
    return { kind: 'imageSize', label, w: Math.round(wv), h: Math.round(hv), sampling: 'bicubic', res: rv !== null && rv >= 1 ? rv : 72 };
  }
  return null;
}

export function parseAtn(buf: ArrayBuffer): { actions: Action[]; unsupported: string[] } {
  const r = new Reader(buf);
  const actions: Action[] = [], unsupported: string[] = [];
  if (r.u32() !== 16) throw new Error('not an .atn actions file');
  const setName = r.unicode().trim().slice(0, 80);
  r.u8();
  const count = r.u32();
  try {
    for (let a = 0; a < count; a++) {
      const fn = r.u16(), shift = r.u8() !== 0, ctrl = r.u8() !== 0, colour = ACTION_COLOURS[r.u16()] ?? 'none';
      const name = r.unicode();
      r.u8();
      const items = r.u32(), steps: ActionStep[] = [];
      const key = fn >= 1 && fn <= 12 ? `${shift ? 'Shift+' : ''}${ctrl ? 'Mod+' : ''}F${fn}` : '';
      actions.push({ name: name || `Action ${a + 1}`, steps, ...(setName ? { set: setName } : {}), ...(colour !== 'none' ? { colour } : {}), ...(key ? { key } : {}) });
      for (let i = 0; i < items; i++) {
        const at = r.pos, it = readItem(r);
        const step = stepFor(it) ?? { kind: 'unsupported' as const, label: it.name || it.event, event: it.event, raw: toBase64(r.bytes(at, r.pos)) };
        if (step.kind === 'unsupported' && it.enabled) unsupported.push(it.name || it.event);
        steps.push(it.enabled ? step : { ...step, off: true });
      }
    }
  } catch {
    unsupported.push('data formvis could not read');
  }
  return { actions, unsupported };
}

class Out {
  private readonly parts: number[] = [];
  u8(v: number): this { this.parts.push(v & 255); return this; }
  u16(v: number): this { return this.u8(v >> 8).u8(v); }
  u32(v: number): this { return this.u8(v >>> 24).u8(v >>> 16).u8(v >>> 8).u8(v); }
  raw(b: ArrayLike<number>): this { for (let i = 0; i < b.length; i++) this.parts.push(b[i]); return this; }
  ascii(s: string): this { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i) < 128 ? s.charCodeAt(i) : 63); return this; }
  text(s: string): this { return this.u32(s.length).ascii(s); }
  unicode(s: string): this { this.u32(s.length + 1); for (let i = 0; i < s.length; i++) this.u16(s.charCodeAt(i)); return this.u16(0); }
  id(s: string): this { return s.length === 4 ? this.u32(0).ascii(s) : this.u32(s.length).ascii(s); }
  f64(v: number): this { const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, v, false); for (let i = 0; i < 8; i++) this.u8(d.getUint8(i)); return this; }
  bytes(): Uint8Array { return Uint8Array.from(this.parts); }
}

type Field = ['ref', string, string, string] | ['clss', string] | ['refName', string, string] | ['enum', string, string] |['TEXT', string] | ['bool', boolean] | ['UntF', string, number] | ['long', number] | ['doub', number] | ['sel'] | ['chan', string] | ['list', Field[]] | ['Objc', string, Array<[string, Field]>];

function writeField(o: Out, f: Field): void {
  if (f[0] === 'ref') o.ascii('obj ').u32(1).ascii('Enmr').unicode('').id(f[1]).id(f[2]).id(f[3]);
  else if (f[0] === 'clss') o.ascii('obj ').u32(1).ascii('Clss').unicode('').id(f[1]);
  else if (f[0] === 'refName') o.ascii('obj ').u32(1).ascii('name').unicode('').id(f[1]).unicode(f[2]);
  else if (f[0] === 'enum') o.ascii('enum').id(f[1]).id(f[2]);
  else if (f[0] === 'TEXT') o.ascii('TEXT').unicode(f[1]);
  else if (f[0] === 'bool') o.ascii('bool').u8(f[1] ? 1 : 0);
  else if (f[0] === 'UntF') o.ascii('UntF').ascii(f[1]).f64(f[2]);
  else if (f[0] === 'long') o.ascii('long').u32(f[1]);
  else if (f[0] === 'doub') o.ascii('doub').f64(f[1]);
  else if (f[0] === 'chan') o.ascii('obj ').u32(1).ascii('Enmr').unicode('').id('Chnl').id('Chnl').id(f[1]);
  else if (f[0] === 'list') { o.ascii('VlLs').u32(f[1].length); for (const item of f[1]) writeField(o, item); }
  else if (f[0] === 'Objc') { o.ascii('Objc'); descriptor(o, f[1], f[2]); }
  else o.ascii('obj ').u32(1).ascii('Enmr').unicode('').id('Chnl').id('Chnl').id('fsel');
}

function descriptor(o: Out, classId: string, fields: Array<[string, Field]>): void {
  o.unicode('').id(classId).u32(fields.length);
  for (const [key, f] of fields) { o.id(key); writeField(o, f); }
}

const isIdentityRange = (r: Record<string, unknown>): boolean => r.black === 0 && r.gamma === 1 && r.white === 255 && r.outputBlack === 0 && r.outputWhite === 255;
const isIdentityCurve = (k: Array<{ x: number; y: number }>): boolean => k.length === 2 && k[0].x === 0 && k[0].y === 0 && k[1].x === 255 && k[1].y === 255;
const CHANNEL_NAME = ['Cmps', 'Rd  ', 'Grn ', 'Bl  '];

const SIMPLE_BACK: Record<string, string> = { invert: 'Invr', desaturate: 'Dstt', flatten: 'Fltn', 'merge-visible': 'MrgV', 'merge-down': 'Mrg2', duplicate: 'Dplc', deselect: 'Dslc', inverse: 'Invs', equalize: 'Eqlz' };

/** The bytes of one event item for `s`, or null when .atn has no event formvis can write for it. */
function itemFor(s: ActionStep): Uint8Array | null {
  if (s.kind === 'unsupported') return fromBase64(s.raw);
  const o = new Out(), name = s.label.slice(0, 120);
  const head = (event: string, withDesc: boolean): void => { o.u8(0).u8(s.off ? 0 : 1).u8(0).u8(0).ascii('long').ascii(event).text(name).u32(withDesc ? 0xffffffff : 0); };
  if (s.kind === 'command' && SIMPLE_BACK[s.id]) { head(SIMPLE_BACK[s.id], false); return o.bytes(); }
  const trgt: [string, Field] = ['null', ['ref', 'Lyr ', 'Ordn', 'Trgt']];
  if (s.kind === 'command' && s.id === 'new-layer') { head('Mk  ', true); descriptor(o, 'null', [['null', ['clss', 'Lyr ']]]); return o.bytes(); }
  if (s.kind === 'command' && s.id === 'delete-layer') { head('Dlt ', true); descriptor(o, 'null', [trgt]); return o.bytes(); }
  if (s.kind === 'command' && LAYER_SELECT_BACK[s.id]) { head('slct', true); descriptor(o, 'null', [['null', ['ref', 'Lyr ', 'Ordn', LAYER_SELECT_BACK[s.id]]]]); return o.bytes(); }
  if (s.kind === 'selectLayer') { head('slct', true); descriptor(o, 'null', [['null', ['refName', 'Lyr ', s.name]]]); return o.bytes(); }
  if (s.kind === 'layerProps') {
    const props: Array<[string, Field]> = [];
    if (s.name !== undefined) props.push(['Nm  ', ['TEXT', s.name]]);
    if (s.opacity !== undefined) props.push(['Opct', ['UntF', '#Prc', s.opacity]]);
    if (s.visible !== undefined) props.push(['Vsbl', ['bool', s.visible]]);
    if (s.blend !== undefined && BLEND_ATN_BACK[s.blend]) props.push(['Md  ', ['enum', 'BlnM', BLEND_ATN_BACK[s.blend].padEnd(4)]]);
    if (s.fill !== undefined) props.push(['fillOpacity', ['long', Math.round((s.fill / 100) * 255)]]);
    head(s.create ? 'Mk  ' : 'setd', true);
    descriptor(o, 'null', s.create ? [['null', ['clss', 'Lyr ']], ['Usng', ['Objc', 'Lyr ', props]]] : [trgt, ['T   ', ['Objc', 'Lyr ', props]]]);
    return o.bytes();
  }
  if (s.kind === 'command' && s.id === 'select-all') { head('setd', true); descriptor(o, 'null', [['null', ['sel']], ['T   ', ['enum', 'Ordn', 'Al  ']]]); return o.bytes(); }
  if (s.kind === 'command' && (s.id === 'flip-canvas-h' || s.id === 'flip-canvas-v')) { head('Flip', true); descriptor(o, 'null', [['Axis', ['enum', 'Ornt', s.id === 'flip-canvas-h' ? 'Hrzn' : 'Vrtc']]]); return o.bytes(); }
  if (s.kind === 'stop') { head('Stop', true); descriptor(o, 'null', [['Msge', ['TEXT', s.message]], ['Cntn', ['bool', s.allowContinue]]]); return o.bytes(); }
  if (s.kind === 'filter' && s.filter === 'gaussianBlur' && typeof s.settings.radius === 'number') { head('GsnB', true); descriptor(o, 'null', [['Rds ', ['UntF', '#Pxl', s.settings.radius]]]); return o.bytes(); }
  if (s.kind === 'filter' && s.filter === 'unsharpMask' && typeof s.settings.usmAmount === 'number' && typeof s.settings.usmRadius === 'number') {
    head('UnsM', true);
    descriptor(o, 'null', [['Amnt', ['UntF', '#Prc', s.settings.usmAmount]], ['Rds ', ['UntF', '#Pxl', s.settings.usmRadius]], ['Thsh', ['long', Math.round(Number(s.settings.threshold) || 0)]]]);
    return o.bytes();
  }
  if (s.kind === 'filter' && s.filter === 'motionBlur' && typeof s.settings.angle === 'number' && typeof s.settings.distance === 'number') { head('MtnB', true); descriptor(o, 'null', [['Angl', ['UntF', '#Ang', s.settings.angle]], ['Dstn', ['UntF', '#Pxl', s.settings.distance]]]); return o.bytes(); }
  const libEntry = s.kind === 'filter' ? Object.entries(LIB_EVENTS).find(([, e]) => e.filter === s.filter) : undefined;
  if (s.kind === 'filter' && libEntry) {
    const [event, spec] = libEntry, stored = (s.settings.lib as Record<string, unknown> | undefined)?.[spec.filter], v = (stored && typeof stored === 'object' ? stored : s.settings) as Record<string, unknown>;
    if (!spec.fields.every((f) => typeof v[f.set] === 'number') || !Object.entries(spec.keep ?? {}).every(([k, d]) => v[k] === undefined || v[k] === d)) return null;
    head(event, true);
    descriptor(o, 'null', spec.fields.map((f): [string, Field] => [f.key, f.unit ? ['UntF', f.unit, v[f.set] as number] : ['long', Math.round(v[f.set] as number)]]));
    return o.bytes();
  }
  if (s.kind === 'filter' && PLAIN_BACK[s.filter]) { head(PLAIN_BACK[s.filter], false); return o.bytes(); }
  if (s.kind === 'filter' && s.filter === 'addNoise' && typeof s.settings.amount === 'number') {
    head('AdNs', true);
    descriptor(o, 'null', [['Nose', ['UntF', '#Prc', s.settings.amount]], ['Dstr', ['enum', 'Dstr', s.settings.gaussian === true ? 'Gsn ' : 'Unfr']], ['Mnch', ['bool', s.settings.monochromatic === true]]]);
    return o.bytes();
  }
  if (s.kind === 'adjustment' && !s.layer && s.adj === 'brightnessContrast' && typeof s.data.brightness === 'number' && typeof s.data.contrast === 'number') {
    head('BrgC', true);
    descriptor(o, 'null', [['Brgh', ['long', Math.round(s.data.brightness)]], ['Cntr', ['long', Math.round(s.data.contrast)]], ['useLegacy', ['bool', s.data.legacy === true]]]);
    return o.bytes();
  }
  if (s.kind === 'adjustment' && !s.layer && s.adj === 'posterize' && typeof s.data.levels === 'number') { head('Pstr', true); descriptor(o, 'null', [['Lvls', ['long', Math.round(s.data.levels)]]]); return o.bytes(); }
  if (s.kind === 'adjustment' && !s.layer && s.adj === 'threshold' && typeof s.data.level === 'number') { head('Thrs', true); descriptor(o, 'null', [['Lvl ', ['long', Math.round(s.data.level)]]]); return o.bytes(); }
  if (s.kind === 'adjustment' && !s.layer && s.adj === 'levels') {
    const ranges = (s.data.levels as { ranges?: Array<Record<string, number>> } | undefined)?.ranges;
    if (!Array.isArray(ranges) || ranges.length < 4 || (ranges[4] && !isIdentityRange(ranges[4]))) return null;
    const adjs: Field[] = [];
    for (let c = 0; c < 4; c++) {
      const g = ranges[c];
      if (!g || !['black', 'gamma', 'white', 'outputBlack', 'outputWhite'].every((k) => Number.isFinite(g[k]))) return null;
      if (c === 0 || !isIdentityRange(g)) adjs.push(['Objc', 'LvlsA', [['Chnl', ['chan', CHANNEL_NAME[c]]], ['Inpt', ['list', [['long', g.black], ['long', g.white]]]], ['Gmm ', ['long', Math.round(g.gamma * 100)]], ['Otpt', ['list', [['long', g.outputBlack], ['long', g.outputWhite]]]]]]);
    }
    head('Lvls', true);
    descriptor(o, 'null', [['Adjs', ['list', adjs]]]);
    return o.bytes();
  }
  if (s.kind === 'adjustment' && !s.layer && s.adj === 'curves') {
    const channels = (s.data.curves as { channels?: Array<Array<{ x: number; y: number }>> } | undefined)?.channels;
    if (!Array.isArray(channels) || channels.length < 4 || (channels[4] && !isIdentityCurve(channels[4]))) return null;
    const adjs: Field[] = [];
    for (let c = 0; c < 4; c++) {
      const k = channels[c];
      if (!Array.isArray(k) || k.length < 2 || k.length > 16 || !k.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return null;
      if (c === 0 || !isIdentityCurve(k)) adjs.push(['Objc', 'CrvA', [['Chnl', ['chan', CHANNEL_NAME[c]]], ['Crv ', ['list', k.map((p): Field => ['Objc', 'CrPt', [['Hrzn', ['doub', p.x]], ['Vrtc', ['doub', p.y]]]])]]]]);
    }
    head('Crvs', true);
    descriptor(o, 'null', [['Adjs', ['list', adjs]]]);
    return o.bytes();
  }
  if (s.kind === 'adjustment' && !s.layer && s.adj === 'hsv') {
    const hsv = hsvFromData(s.data), m = hsv.adjustments.Master;
    if (!m || hsv.range !== 'Master' || hsv.invertRange || Object.entries(hsv.adjustments).some(([k, a]) => k !== 'Master' && a && (a.hue || a.saturation || a.lightness))) return null;
    head('HStr', true);
    descriptor(o, 'null', [['Clrz', ['bool', hsv.colorize]], ['Adjs', ['list', [['Objc', 'Hst2', [['H   ', ['long', Math.round(m.hue)]], ['Strt', ['long', Math.round(m.saturation)]], ['Lght', ['long', Math.round(m.lightness)]]]]]]]]);
    return o.bytes();
  }
  if (s.kind === 'imageSize') { head('ImgS', true); descriptor(o, 'null', [['Wdth', ['UntF', '#Pxl', s.w]], ['Hght', ['UntF', '#Pxl', s.h]], ['Rslt', ['UntF', '#Rsl', s.res]]]); return o.bytes(); }
  return null;
}

/** A set of actions as an .atn file. Steps with no .atn event are left out and named in `left`; steps that came from an
 *  .atn file as unsupported are written back byte for byte. */
export function writeAtn(actions: readonly Action[], setName: string): { bytes: Uint8Array; left: string[] } {
  const o = new Out(), left: string[] = [];
  o.u32(16).unicode(setName.slice(0, 80)).u8(0).u32(actions.length);
  for (const a of actions) {
    const m = /^(Shift\+)?(Mod\+)?F(\d+)$/.exec(a.key ?? '');
    o.u16(m ? Number(m[3]) : 0).u8(m?.[1] ? 1 : 0).u8(m?.[2] ? 1 : 0).u16(Math.max(0, ACTION_COLOURS.indexOf(a.colour ?? 'none')));
    const items = a.steps.flatMap((s) => { const b = itemFor(s); if (!b) left.push(`${a.name}: ${s.label}`); return b ? [b] : []; });
    o.unicode(a.name).u8(0).u32(items.length);
    for (const b of items) o.raw(b);
  }
  return { bytes: o.bytes(), left };
}
