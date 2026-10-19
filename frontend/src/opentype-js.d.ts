declare module 'opentype.js' {
  export interface PathCommand { type: 'M' | 'L' | 'C' | 'Q' | 'Z'; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }
  export interface BoundingBox { x1: number; y1: number; x2: number; y2: number }
  export interface Path { commands: PathCommand[]; getBoundingBox(): BoundingBox }
  export interface Glyph { advanceWidth?: number; getPath(x: number, y: number, fontSize: number): Path }
  export interface Font {
    glyphs: { get(index: number): Glyph };
    getKerningValue(left: number, right: number): number;
    unitsPerEm: number;
    ascender: number;
    descender: number;
    numGlyphs: number;
    tables: { cmap?: { glyphIndexMap?: Record<number, number> } };
    names: Record<string, Record<string, string> | undefined>;
    charToGlyphIndex(ch: string): number;
  }
  export function parse(buffer: ArrayBuffer): Font;
}
