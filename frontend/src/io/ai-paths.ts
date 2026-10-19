import type { ID } from '../engine/types';
import type { Anchor, PathSet, SubPath } from '../engine/paths';

const num = (v: number): string => String(Math.round(v * 1000) / 1000);

/** Paths as a version 3 .ai PostScript file: one group per named path, points in document pixels read as points with
 *  y flipped to the format's upward axis. Shape and mask entries are skipped. `which` is 'all' or the id of the one
 *  path to write. */
export function pathsToAi(set: PathSet, width: number, height: number, which: 'all' | ID): string {
  const W = Math.round(width), H = Math.round(height);
  const fy = (y: number): number => H - y;
  const out: string[] = [
    '%!PS-Adobe-2.0 EPSF-1.2',
    '%%Creator: formvis',
    `%%BoundingBox: 0 0 ${W} ${H}`,
    '%%HiResBoundingBox: 0 0 ' + num(width) + ' ' + num(height),
    '%%AI3_Margin: 0 0 0 0',
    '%%EndComments',
    '%%EndProlog',
    '%%BeginSetup',
    '%%EndSetup',
  ];
  const segment = (p: Anchor, q: Anchor): string => {
    const flat = p.outX === p.x && p.outY === p.y && q.inX === q.x && q.inY === q.y;
    if (flat) return `${num(q.x)} ${num(fy(q.y))} l`;
    return `${num(p.outX)} ${num(fy(p.outY))} ${num(q.inX)} ${num(fy(q.inY))} ${num(q.x)} ${num(fy(q.y))} c`;
  };
  const sub = (sp: SubPath): void => {
    const a = sp.anchors;
    if (!a.length) return;
    out.push(`${num(a[0].x)} ${num(fy(a[0].y))} m`);
    for (let i = 1; i < a.length; i++) out.push(segment(a[i - 1], a[i]));
    if (sp.closed && a.length > 1) out.push(segment(a[a.length - 1], a[0]));
    out.push('0 O', '0 R', sp.closed ? 'N' : 'n');
  };
  for (const np of set.list) {
    if (np.shape || np.mask) continue;
    if (which !== 'all' && np.id !== which) continue;
    out.push(`%%Note: ${np.name.replace(/[\r\n]+/g, ' ')}`, 'u');
    for (const sp of np.path.subpaths) sub(sp);
    out.push('U');
  }
  out.push('%%Trailer', '%%EOF', '');
  return out.join('\n');
}
