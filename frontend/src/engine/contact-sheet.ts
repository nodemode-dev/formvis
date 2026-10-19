/** Contact Sheet II layout (DEV_PLAN 30.3): pure arithmetic, no canvas and no DOM. */

export interface SheetSettings {
  width: number; height: number;
  columns: number; rows: number;
  /** Auto-spacing: a small even gap by default; otherwise `vertical` and `horizontal` pixels. */
  auto: boolean; vertical: number; horizontal: number;
  /** Room kept under each cell for its caption (0 when there are none). */
  caption: number;
}

export interface Cell { x: number; y: number; w: number; h: number }
export interface Placement { cell: Cell; x: number; y: number; w: number; h: number; rotate: boolean }

/** The gap auto-spacing uses: about 1% of the shorter side, at least 1 pixel. */
export const autoGap = (s: Pick<SheetSettings, 'width' | 'height'>): number => Math.max(1, Math.round(Math.min(s.width, s.height) * 0.01));

/** The image area of every cell on one page, row by row; the cells fill the page evenly, each with its caption strip kept below. */
export function sheetCells(s: SheetSettings): Cell[] {
  const cols = Math.max(1, Math.floor(s.columns)), rows = Math.max(1, Math.floor(s.rows));
  const gx = s.auto ? autoGap(s) : Math.max(0, s.horizontal), gy = s.auto ? autoGap(s) : Math.max(0, s.vertical);
  const cw = (s.width - gx * (cols + 1)) / cols, ch = (s.height - gy * (rows + 1)) / rows;
  const out: Cell[] = [];
  if (!(cw >= 1) || !(ch - s.caption >= 1)) return out;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: Math.round(gx + c * (cw + gx)), y: Math.round(gy + r * (ch + gy)), w: Math.floor(cw), h: Math.floor(ch - s.caption) });
  return out;
}

/** An image of iw by ih scaled to fit the cell, aspect kept, centred; turned a quarter when that makes it larger and `rotate` allows it. */
export function fitInCell(cell: Cell, iw: number, ih: number, rotate: boolean): Placement {
  const plain = Math.min(cell.w / iw, cell.h / ih), turned = Math.min(cell.w / ih, cell.h / iw);
  const turn = rotate && turned > plain * 1.0001, k = turn ? turned : plain;
  const w = Math.max(1, Math.round((turn ? ih : iw) * k)), h = Math.max(1, Math.round((turn ? iw : ih) * k));
  return { cell, x: Math.round(cell.x + (cell.w - w) / 2), y: Math.round(cell.y + (cell.h - h) / 2), w, h, rotate: turn };
}

/** How many pages `count` images need. */
export const sheetPages = (count: number, s: SheetSettings): number => {
  const per = Math.max(1, Math.floor(s.columns)) * Math.max(1, Math.floor(s.rows));
  return Math.max(1, Math.ceil(count / per));
};

/** "ContactSheet-001" and so on. */
export const sheetName = (page: number): string => `ContactSheet-${String(page).padStart(3, '0')}`;
