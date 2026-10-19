import { ACTION_COLOURS, type Action, type ActionStep } from '../ui/actions';
import { fromBase64, toBase64 } from './icc-read';

/** .atn action files: a big-endian stream of actions, each a list of events with an optional descriptor.
 *  Events with a formvis equivalent become steps; the rest are kept as greyed steps holding their original bytes, so
 *  writing the file back returns them untouched, and are named in `unsupported`. */

interface Enum { kind: 'enum'; type: string; value: string }
interface Unit { kind: 'unit'; unit: string; value: number }
export interface Desc { cls: string; classId: string; items: Map<string, Val> }
export type Val =number | string | boolean | Val[] | Desc | Enum | Unit | null;

const isEnum = (v: Val | undefined): v is Enum => !!v && typeof v === 'object' && !Array.isArray(v) && 'kind' in v && v.kind === 'enum';
const isUnit = (v: Val | undefined): v is Unit => !!v && typeof v === 'object' && !Array.isArray(v) && 'kind' in v && v.kind === 'unit';

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

function readReference(r: Reader): void {
  const count = r.u32();
  for (let i = 0; i < count; i++) {
    const form = r.ascii(4);
    if (form === 'Clss') { r.unicode(); r.id(); }
    else if (form === 'Enmr') { r.unicode(); r.id(); r.id(); r.id(); }
    else if (form === 'name') { r.unicode(); r.id(); r.unicode(); }
    else if (form === 'Idnt' || form === 'indx' || form === 'rele') { r.unicode(); r.id(); r.i32(); }
    else if (form === 'prop') { r.unicode(); r.id(); r.id(); }
    else throw new Error(`unknown reference form ${form}`);
  }
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
    case 'obj ': readReference(r); return null;
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

const SIMPLE: Record<string, string> = { Invr: 'invert', Dstt: 'desaturate', Fltn: 'flatten', MrgV: 'merge-visible', Mrg2: 'merge-down', Dplc: 'duplicate', Dslc: 'deselect' };

/** The step an item stands for, or null when formvis has no equivalent. */
function stepFor(it: Item): ActionStep | null {
  const label = it.name || it.event;
  const cmd = (id: string): ActionStep => ({ kind: 'command', id, label });
  const simple = SIMPLE[it.event];
  if (simple) return cmd(simple);
  const get = (k: string): Val | undefined => it.desc?.items.get(k);
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

type Field = ['enum', string, string] | ['TEXT', string] | ['bool', boolean] | ['UntF', string, number] | ['sel'];

function descriptor(o: Out, classId: string, fields: Array<[string, Field]>): void {
  o.unicode('').id(classId).u32(fields.length);
  for (const [key, f] of fields) {
    o.id(key);
    if (f[0] === 'enum') o.ascii('enum').id(f[1]).id(f[2]);
    else if (f[0] === 'TEXT') o.ascii('TEXT').unicode(f[1]);
    else if (f[0] === 'bool') o.ascii('bool').u8(f[1] ? 1 : 0);
    else if (f[0] === 'UntF') o.ascii('UntF').ascii(f[1]).f64(f[2]);
    else o.ascii('obj ').u32(1).ascii('Enmr').unicode('').id('Chnl').id('Chnl').id('fsel');
  }
}

const SIMPLE_BACK: Record<string, string> = { invert: 'Invr', desaturate: 'Dstt', flatten: 'Fltn', 'merge-visible': 'MrgV', 'merge-down': 'Mrg2', duplicate: 'Dplc', deselect: 'Dslc' };

/** The bytes of one event item for `s`, or null when .atn has no event formvis can write for it. */
function itemFor(s: ActionStep): Uint8Array | null {
  if (s.kind === 'unsupported') return fromBase64(s.raw);
  const o = new Out(), name = s.label.slice(0, 120);
  const head = (event: string, withDesc: boolean): void => { o.u8(0).u8(s.off ? 0 : 1).u8(0).u8(0).ascii('long').ascii(event).text(name).u32(withDesc ? 0xffffffff : 0); };
  if (s.kind === 'command' && SIMPLE_BACK[s.id]) { head(SIMPLE_BACK[s.id], false); return o.bytes(); }
  if (s.kind === 'command' && s.id === 'select-all') { head('setd', true); descriptor(o, 'null', [['null', ['sel']], ['T   ', ['enum', 'Ordn', 'Al  ']]]); return o.bytes(); }
  if (s.kind === 'command' && (s.id === 'flip-canvas-h' || s.id === 'flip-canvas-v')) { head('Flip', true); descriptor(o, 'null', [['Axis', ['enum', 'Ornt', s.id === 'flip-canvas-h' ? 'Hrzn' : 'Vrtc']]]); return o.bytes(); }
  if (s.kind === 'stop') { head('Stop', true); descriptor(o, 'null', [['Msge', ['TEXT', s.message]], ['Cntn', ['bool', s.allowContinue]]]); return o.bytes(); }
  if (s.kind === 'filter' && s.filter === 'gaussianBlur' && typeof s.settings.radius === 'number') { head('GsnB', true); descriptor(o, 'null', [['Rds ', ['UntF', '#Pxl', s.settings.radius]]]); return o.bytes(); }
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
