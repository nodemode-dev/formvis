export interface TextSpec {
  text: string;
  size: number;
  color: string;
  tracking: number;
  weight: number;
  family: string;
  x: number;
  y: number;
  align: 'left' | 'center' | 'right';
}

export const TEXT_FAMILIES = ['Inter', 'JetBrains Mono'];
export const LINE_HEIGHT = 1.08;

const fontOf = (s: TextSpec): string => `${s.weight} ${s.size}px "${s.family}"`;

export async function ensureFont(s: TextSpec): Promise<void> {
  try { await document.fonts.load(fontOf(s), s.text || 'A'); } catch { return; }
}

export function renderText(s: TextSpec, into: HTMLCanvasElement): void {
  const g = into.getContext('2d')!;
  g.clearRect(0, 0, into.width, into.height);
  g.font = fontOf(s);
  g.fillStyle = s.color;
  g.textBaseline = 'top';
  g.textAlign = s.align;
  (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${s.tracking}px`;
  s.text.split('\n').forEach((line, i) => g.fillText(line, s.x, s.y + i * s.size * LINE_HEIGHT));
}

export const defaultText = (): TextSpec => ({ text: 'Your text', size: 96, color: '#fff6ea', tracking: 2, weight: 600, family: 'Inter', x: 80, y: 120, align: 'left' });
