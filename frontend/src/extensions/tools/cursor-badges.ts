const MARKS = {
  bucket: 'M22 17.500c-2.500 3-3.500 4.500-3.500 6a3.500 3.500 0 0 0 7 0c0-1.500-1-3-3.500-6z',
  count: 'M20 20l2.500-1.500v7M20.500 26h4',
  redEye: 'M18.500 22a3.500 3.500 0 1 0 7 0a3.500 3.500 0 1 0-7 0M22 22h.100',
  pen: 'M18.500 26.500l1.500-5 4-3 2.500 2.500-3 4z',
  curvaturePen: 'M18 26c1-7 6-7 8 0',
  freeformPen: 'M18 23.500q1.500-3 3 0t3 0t3 0',
  convertPoint: 'M19 26l3-6 3 6'
} as const;

export type BadgeKind = keyof typeof MARKS;

const cache = new Map<BadgeKind, string>();

/** The crosshair with a small badge in its lower right that says which tool is held: a drop for the bucket, a 1 for Count, an eye for Red Eye, a nib for the pens. */
export function badgeCursor(kind: BadgeKind): string {
  let url = cache.get(kind);
  if (!url) {
    const cross = 'M14 4v20M4 14h20', mark = MARKS[kind];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><path d="${cross}" stroke="#fff" stroke-width="3" fill="none"/><path d="${cross}" stroke="#000" stroke-width="1" fill="none"/><path d="${mark}" stroke="#fff" stroke-width="3.500" stroke-linejoin="round" stroke-linecap="round" fill="none"/><path d="${mark}" stroke="#000" stroke-width="1.500" stroke-linejoin="round" stroke-linecap="round" fill="none"/></svg>`;
    url = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 14 14, crosshair`;
    cache.set(kind, url);
  }
  return url;
}
