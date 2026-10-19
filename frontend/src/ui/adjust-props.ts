import { ADJUSTMENT_LABELS, hexOf, type Engine, type ID } from '../engine';
import { PARAM_ADJUSTMENTS, isParamKind, paramValues, type ParamKind } from '../engine/adjust-params';
import { el, setHidden } from './dom';
import { icon } from './icons';
import { checkRow, colorRow, selectRow, sliderRow, type Row } from './panels/controls';

type Json = Record<string, unknown>;
interface Built { node: HTMLElement; sync: (v: Json) => void; groupBy: string | undefined }

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** The Properties column's Adjustment section: the active adjustment layer's own controls, the rows of the Adjustment dialog
 *  (the same specs and row builders), built once per kind and shown or hidden as the layer changes, so nothing is rebuilt
 *  when a value does. A run of edits (a drag, a typed value) is one undo step, committed on release, on change or after a
 *  short rest. Kinds with their own editors (Levels, Curves, Hue/Saturation, Exposure, Gradient Map, Grain) get the button
 *  that opens the dialog. */
export function adjustSection(e: Engine, run: (cmd: string) => void): { head: HTMLButtonElement; body: HTMLElement; refresh: () => void } {
  const head = el<HTMLButtonElement>(`<button class="cv-props-section cv-props-adj-head" type="button" aria-expanded="true" hidden>${icon('chevronDown', 12)}<span>Adjustment</span></button>`);
  const body = el('<div class="cv-props-adj" hidden></div>');
  const host = el('<div class="cv-panel-section"></div>');
  const open = el<HTMLButtonElement>('<button class="cv-btn" type="button">Edit in Dialog...</button>');
  body.append(host, open);
  open.addEventListener('click', () => run('layer-content-options'));
  head.addEventListener('click', () => { head.setAttribute('aria-expanded', String(head.getAttribute('aria-expanded') !== 'true')); refresh(); });

  const built = new Map<ParamKind, Built>();
  let shown: ParamKind | null = null, seen = '', session: ID | null = null, timer = 0;

  const params = (id: ID): Json | null => {
    const l = e.current?.layer(id);
    return l?.adjustment && isParamKind(l.adjustment.kind) ? (paramValues(l.adjustment.kind, l.adjustment.data.params) as Json) : null;
  };
  const finish = (): void => {
    window.clearTimeout(timer);
    timer = 0;
    if (session) { session = null; e.commitLive(); }
  };
  const put = (kind: ParamKind, key: string, value: unknown): void => {
    const id = e.activeLayer?.id, l = id ? e.current?.layer(id) : null;
    if (!id || !l?.adjustment || l.adjustment.kind !== kind) return;
    if (!session) {
      if (!e.beginLive(`Edit ${ADJUSTMENT_LABELS[kind]}`)) return;
      session = id;
    }
    const next = { ...(params(id) ?? {}), [key]: value }, data = { ...l.adjustment.data, params: next };
    e.updateLive((p) => p.updateLayer(id, { adjustment: { kind, data } }));
    window.clearTimeout(timer);
    timer = window.setTimeout(finish, 600);
  };
  body.addEventListener('change', finish);
  body.addEventListener('pointerup', () => { if (timer) { window.clearTimeout(timer); timer = window.setTimeout(finish, 120); } });

  const build = (kind: ParamKind): Built => {
    const spec = PARAM_ADJUSTMENTS[kind], node = el('<div class="cv-panel-section" hidden></div>');
    const rows = spec.params.flatMap((s) => {
      let row: Row<never> | null = null, set: (v: Json) => void = () => undefined;
      if (s.kind === 'range') { const r = sliderRow(s.label, s.min, s.max, s.step, (v) => put(kind, s.key, v), { def: s.def }); row = r as unknown as Row<never>; set = (v) => r.set(num(v[s.key], s.def)); }
      else if (s.kind === 'check') { const r = checkRow(s.label, (v) => put(kind, s.key, v)); row = r as unknown as Row<never>; set = (v) => r.set(v[s.key] === true); }
      else if (s.kind === 'select') { const r = selectRow(s.label, s.options, (v) => put(kind, s.key, v)); row = r as unknown as Row<never>; set = (v) => r.set(String(v[s.key] ?? s.def)); }
      else if (s.kind === 'color') {
        const r = colorRow(s.label, (hex) => put(kind, s.key, { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) }));
        row = r as unknown as Row<never>;
        set = (v) => { const c = (v[s.key] ?? {}) as Json; r.set(hexOf({ r: num(c.r, 0), g: num(c.g, 0), b: num(c.b, 0) })); };
      }
      if (!row) return [];
      node.appendChild(row.el);
      return [{ s, el: row.el, set }];
    });
    if (!rows.length) node.appendChild(el('<p class="cv-note">No settings: the layer inverts the colours beneath it.</p>'));
    host.appendChild(node);
    return { node, groupBy: spec.groupBy, sync: (v) => {
      const g = spec.groupBy ? String(v[spec.groupBy]) : null;
      for (const r of rows) { r.set(v); setHidden(r.el, !!r.s.group && r.s.group !== g); }
    } };
  };

  function refresh(): void {
    const a = e.activeLayer, kind = a?.adjustment && a.adjustment.kind !== 'filter' ? a.adjustment.kind : null;
    if (session && session !== a?.id) finish();
    setHidden(head, !kind);
    const fold = head.getAttribute('aria-expanded') === 'true';
    setHidden(body, !kind || !fold);
    if (!kind || !a || !fold) return;
    const pk = isParamKind(kind) ? kind : null;
    if (shown !== pk) {
      if (shown) setHidden(built.get(shown)!.node, true);
      shown = pk;
      seen = '';
      if (pk) { if (!built.has(pk)) built.set(pk, build(pk)); setHidden(built.get(pk)!.node, false); }
    }
    setHidden(host, !pk);
    if (!pk || session) return;
    const v = params(a.id), key = `${a.id}|${JSON.stringify(v)}`;
    if (!v || key === seen) return;
    seen = key;
    built.get(pk)!.sync(v);
  }

  return { head, body, refresh };
}
