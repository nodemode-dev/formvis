import type { LibFilter } from '../filter-library';
import { gaussianMargin } from '../filters';
import { unsharpExact } from './shared';

/** Filter > Sharpen's three fixed sharpenings, each an unsharp mask: Sharpen a light one, Sharpen More a strong one,
 *  Sharpen Edges one that leaves areas of even colour alone (a threshold of a few levels). */
const fixed = (id: 'sharpen' | 'sharpenMore' | 'sharpenEdges', label: string, amount: number, sigma: number, threshold: number): LibFilter => ({
  id, label, group: 'Sharpen', params: [], grows: false,
  reach: (_v, scale) => gaussianMargin(sigma * scale) + 1,
  run: (src, _v, ctx) => unsharpExact(src, amount, sigma * ctx.scale, threshold),
});

export const SHARPEN_FILTERS: LibFilter[] = [
  fixed('sharpen', 'Sharpen', 50, 0.6, 0),
  fixed('sharpenMore', 'Sharpen More', 120, 0.7, 0),
  fixed('sharpenEdges', 'Sharpen Edges', 100, 1, 8),
];
