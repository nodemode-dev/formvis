import { describe, expect, it } from 'vitest';
import { headerSize } from './image-size';

const blob = (bytes: number[]): Blob => new Blob([new Uint8Array(bytes)]);
const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n: number): number[] => [n & 255, (n >>> 8) & 255];
const le32 = (n: number): number[] => [...le16(n & 0xffff), ...le16(n >>> 16)];
const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

describe('picture sizes from headers (1.52.7)', () => {
  it('reads PNG, GIF, BMP and WebP', async () => {
    expect(await headerSize(blob([0x89, ...ascii('PNG\r\n\x1a\n'), 0, 0, 0, 13, ...ascii('IHDR'), ...u32(40000), ...u32(25000)]))).toEqual({ width: 40000, height: 25000 });
    expect(await headerSize(blob([...ascii('GIF89a'), ...le16(640), ...le16(480)]))).toEqual({ width: 640, height: 480 });
    expect(await headerSize(blob([...ascii('BM'), ...new Array(16).fill(0), ...le32(1200), ...le32(-800 >>> 0)]))).toEqual({ width: 1200, height: 800 });
    const vp8x = [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBPVP8X'), 10, 0, 0, 0, 0, 0, 0, 0, ...[(35000 - 1) & 255, ((35000 - 1) >> 8) & 255, 0], ...[(20000 - 1) & 255, ((20000 - 1) >> 8) & 255, 0]];
    expect(await headerSize(blob(vp8x))).toEqual({ width: 35000, height: 20000 });
  });

  it('finds a JPEG frame after other segments, and knows nothing else', async () => {
    const app0 = [0xff, 0xe0, 0, 16, ...ascii('JFIF\0'), ...new Array(9).fill(0)];
    const sof0 = [0xff, 0xc0, 0, 17, 8, ...[(33000 >> 8) & 255, 33000 & 255], ...[(1000 >> 8) & 255, 1000 & 255], 3, ...new Array(9).fill(0)];
    expect(await headerSize(blob([0xff, 0xd8, ...app0, ...sof0]))).toEqual({ width: 1000, height: 33000 });
    expect(await headerSize(blob(ascii('not a picture at all')))).toBeNull();
  });
});
