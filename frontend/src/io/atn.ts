import type { Action, ActionStep } from '../ui/actions';

/** Photoshop .atn action files: a big-endian stream of actions, each a list of events with an optional descriptor.
 *  Only events with a formvis equivalent become steps; the rest are named in `unsupported`. */

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
  if (r.u32() !== 16) throw new Error('not a Photoshop actions file');
  r.unicode();
  r.u8();
  const count = r.u32();
  try {
    for (let a = 0; a < count; a++) {
      r.u16(); r.u8(); r.u8(); r.u16();
      const name = r.unicode();
      r.u8();
      const items = r.u32(), steps: ActionStep[] = [];
      actions.push({ name: name || `Action ${a + 1}`, steps });
      for (let i = 0; i < items; i++) {
        const it = readItem(r);
        if (!it.enabled) continue;
        const step = stepFor(it);
        if (step) steps.push(step);
        else unsupported.push(it.name || it.event);
      }
    }
  } catch {
    unsupported.push('data formvis could not read');
  }
  return { actions, unsupported };
}
