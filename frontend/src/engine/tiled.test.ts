import { describe, expect, it } from 'vitest';
import { TILE, tilesIn } from './tiled';

// The tile arithmetic of TiledRaster (1.62.2, DEV_PLAN 26.6a); its drawing is checked in the browser (e2e/test_tiled_raster.py).
describe('tilesIn', () => {
  it('finds one tile for a rectangle inside it', () => {
    expect(tilesIn(10, 10, 20, 20, 64, 5, 4)).toEqual([[0, 0]]);
  });
  it('finds every tile a rectangle crosses, row by row', () => {
    expect(tilesIn(60, 60, 10, 10, 64, 5, 4)).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]]);
  });
  it('treats a rectangle ending on a tile edge as not entering the next tile', () => {
    expect(tilesIn(0, 0, 64, 64, 64, 5, 4)).toEqual([[0, 0]]);
    expect(tilesIn(0, 0, 65, 64, 64, 5, 4)).toEqual([[0, 0], [1, 0]]);
  });
  it('keeps to the grid when a rectangle runs past the layer', () => {
    expect(tilesIn(-50, -50, 100, 60, 64, 2, 2)).toEqual([[0, 0]]);
    expect(tilesIn(100, 100, 500, 500, 64, 2, 2)).toEqual([[1, 1]]);
  });
  it('finds nothing for an empty rectangle', () => {
    expect(tilesIn(5, 5, 0, 10, 64, 5, 4)).toEqual([]);
    expect(tilesIn(5, 5, 10, -1, 64, 5, 4)).toEqual([]);
  });
  it('covers a 600 MP document in 150 tiles of the default size (15 by 10)', () => {
    const cols = Math.ceil(30000 / TILE), rows = Math.ceil(20000 / TILE);
    expect(tilesIn(0, 0, 30000, 20000, TILE, cols, rows).length).toBe(cols * rows);
    expect(cols * rows).toBe(150);
  });
});
