import { describe, expect, it } from 'vitest';
import { lutFileToCube } from './lut-read';
import { parseCube } from './adjust-params';

const hexFloat = (v: number): string => {
  const b = new Uint8Array(new Float32Array([v]).buffer);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};

/** A 2-point .look whose node n (red fastest) maps to (blue, red, green) of its own input, so the order shows. */
function rotateLook(): string {
  let hex = '';
  for (let n = 0; n < 8; n++) { const r = n & 1, g = (n >> 1) & 1, b = n >> 2; hex += hexFloat(b) + hexFloat(r) + hexFloat(g); }
  return `<?xml version="1.0" ?>\n<look>\n  <shaders>\n    <base>\n      <visible>"1"</visible>\n      <sublayer0>\n        <opacity>"1"</opacity>\n        <parameters>\n          <LUT>\n            <size>"2"</size>\n            <data>"${hex.toUpperCase()}"</data>\n          </LUT>\n        </parameters>\n      </sublayer0>\n    </base>\n  </shaders>\n  <LUT>\n    <size>"2"</size>\n    <data>"${hex.toUpperCase()}"</data>\n  </LUT>\n</look>\n`;
}

describe('lutFileToCube: .look', () => {
  it('reads the size and the little-endian float data with red changing fastest', () => {
    const cube = parseCube(lutFileToCube('rot.look', rotateLook()) ?? '');
    expect(cube?.size).toBe(2);
    const node = (r: number, g: number, b: number): number[] => Array.from(cube!.data.slice((b * 4 + g * 2 + r) * 3, (b * 4 + g * 2 + r) * 3 + 3));
    expect(node(1, 0, 0)).toEqual([0, 1, 0]);
    expect(node(0, 1, 0)).toEqual([0, 0, 1]);
    expect(node(0, 0, 1)).toEqual([1, 0, 0]);
  });

  it('is found by its XML even under another name, and a short data string is refused', () => {
    expect(lutFileToCube('look.txt', rotateLook())).toMatch(/^LUT_3D_SIZE 2\n/);
    expect(lutFileToCube('bad.look', '<look><LUT><size>"2"</size><data>"00ff"</data></LUT></look>')).toBeNull();
  });
});
