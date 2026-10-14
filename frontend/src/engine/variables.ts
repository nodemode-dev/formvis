import type { DataSet, Doc, DocVariable, ID } from './types';

/** Variables and Data Sets (DEV_PLAN 29.9): the parsing of Photoshop's CSV or tab-separated data sets and the plan of
 *  changes one data set makes to a document. No DOM, no engine: the engine applies the plan. */

/** Rows of fields from CSV or tab-separated text: quoted fields, doubled quotes, newlines inside quotes, a BOM dropped. */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r\n|\n|\r/, 1)[0] ?? '';
  const sep = firstLine.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, any = false;
  const endRow = (): void => { row.push(field); field = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; any = false; };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"' && field === '') { quoted = true; any = true; }
    else if (c === sep) { row.push(field); field = ''; any = true; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; endRow(); }
    else { field += c; any = true; }
  }
  if (any || field !== '' || row.length) endRow();
  return rows;
}

/** Data sets from text whose first row names the variables; each later row is a data set, named by its first value. */
export function buildDataSets(text: string): { names: string[]; dataSets: DataSet[] } {
  const rows = parseDelimited(text);
  if (rows.length < 2) return { names: [], dataSets: [] };
  const names = rows[0].map((n) => n.trim());
  const dataSets: DataSet[] = [];
  const taken = new Set<string>();
  for (const r of rows.slice(1, 1001)) {
    const values: Record<string, string> = {};
    names.forEach((n, i) => { if (n) values[n] = r[i] ?? ''; });
    let name = (r[0] ?? '').trim() || `Data Set ${dataSets.length + 1}`;
    for (let k = 2; taken.has(name); k++) name = `${(r[0] ?? '').trim() || 'Data Set'} ${k}`;
    taken.add(name);
    dataSets.push({ name, values });
  }
  return { names, dataSets };
}

export type VariableChange =
  | { kind: 'visibility'; layer: ID; visible: boolean }
  | { kind: 'text'; layer: ID; content: string }
  | { kind: 'pixels'; layer: ID; file: string; method: NonNullable<DocVariable['method']> };

const TRUE = new Set(['true', '1', 'yes', 'on', 'visible', 'show']);

/** What a data set changes: one entry per variable that has a value in the set and a layer that can take it. */
export function planFor(doc: Doc, set: DataSet): VariableChange[] {
  const out: VariableChange[] = [];
  for (const v of doc.variables ?? []) {
    if (!(v.name in set.values)) continue;
    const l = doc.layers.find((x) => x.id === v.layer);
    if (!l) continue;
    const value = set.values[v.name];
    if (v.kind === 'visibility') out.push({ kind: 'visibility', layer: l.id, visible: TRUE.has(value.trim().toLowerCase()) });
    else if (v.kind === 'text') { if (l.text && !l.isGroup) out.push({ kind: 'text', layer: l.id, content: value }); }
    else if (!l.isGroup && !l.text && !l.adjustment && !l.shape && value.trim()) out.push({ kind: 'pixels', layer: l.id, file: value.trim(), method: v.method ?? 'fit' });
  }
  return out;
}

/** Where an image of w x h lands inside the box (bx, by, bw, bh) by a placement method; `clip` is true when it overflows. */
export function placeInBox(w: number, h: number, bx: number, by: number, bw: number, bh: number, method: NonNullable<DocVariable['method']>): { x: number; y: number; w: number; h: number } {
  if (method === 'conform') return { x: bx, y: by, w: bw, h: bh };
  if (method === 'asis') return { x: bx + (bw - w) / 2, y: by + (bh - h) / 2, w, h };
  const s = method === 'fill' ? Math.max(bw / w, bh / h) : Math.min(bw / w, bh / h);
  return { x: bx + (bw - w * s) / 2, y: by + (bh - h * s) / 2, w: w * s, h: h * s };
}
