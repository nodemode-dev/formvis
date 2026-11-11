/** Save for Web's HTML output: a page that lays the slice images out in a table, one cell for each slice (user and auto),
 *  with the slice's link around the image and its alt text. Cells are spans of a grid cut along every slice edge. */
export interface HtmlCell { x: number; y: number; w: number; h: number; file: string; url?: string; alt?: string; name?: string; target?: string; message?: string; bg?: string; noImage?: boolean; cellText?: string }

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function slicesHtml(title: string, width: number, height: number, cells: readonly HtmlCell[]): string {
  const xs = [...new Set([0, width, ...cells.flatMap((c) => [c.x, c.x + c.w])])].sort((a, b) => a - b);
  const ys = [...new Set([0, height, ...cells.flatMap((c) => [c.y, c.y + c.h])])].sort((a, b) => a - b);
  const col = (v: number): number => xs.indexOf(v), row = (v: number): number => ys.indexOf(v);
  const at = new Map<string, HtmlCell>();
  for (const c of cells) at.set(`${row(c.y)},${col(c.x)}`, c);
  const rows: string[] = [];
  for (let j = 0; j < ys.length - 1; j++) {
    const tds: string[] = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const c = at.get(`${j},${i}`);
      if (!c) continue;
      const span = `${col(c.x + c.w) - i > 1 ? ` colspan="${col(c.x + c.w) - i}"` : ''}${row(c.y + c.h) - j > 1 ? ` rowspan="${row(c.y + c.h) - j}"` : ''}`;
      const bg = c.bg ? ` bgcolor="${esc(c.bg)}"` : '';
      const link = (inner: string): string => (c.url ? `<a href="${esc(c.url)}"${c.target ? ` target="${esc(c.target)}"` : ''}${c.message ? ` title="${esc(c.message)}" onmouseover="window.status='${esc(c.message.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n\u2028\u2029]/g, ' '))}';return true" onmouseout="window.status='';return true"` : ''}>${inner}</a>` : inner);
      if (c.noImage) { tds.push(`<td${span}${bg} width="${c.w}" height="${c.h}">${link(esc(c.cellText ?? ''))}</td>`); continue; }
      const img = `<img src="${esc(c.file)}" width="${c.w}" height="${c.h}" alt="${esc(c.alt ?? '')}" style="display:block;border:0"${c.name ? ` name="${esc(c.name)}"` : ''}>`;
      tds.push(`<td${span}${bg}>${link(img)}</td>`);
    }
    if (tds.length) rows.push(`<tr>\n${tds.join('\n')}\n</tr>`);
  }
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${esc(title)}</title>\n</head>\n<body style="margin:0;background:#fff">\n<table width="${width}" height="${height}" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse">\n${rows.join('\n')}\n</table>\n</body>\n</html>\n`;
}
