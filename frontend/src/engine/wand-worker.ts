/// <reference lib="webworker" />
import { findRegion, growRegion } from './wand-jobs';
import type { WandJob } from './wand-jobs';

onmessage = (e: MessageEvent<WandJob>) => {
  const j = e.data, pixels = new Uint8ClampedArray(j.pixels);
  const mask = j.grow ? growRegion(pixels, j.width, j.height, new Uint8Array(j.grow.on), j.grow.lo, j.grow.hi, j.tolerance, j.contiguous, j.anti) : findRegion(pixels, j.width, j.height, j.x, j.y, j.tolerance, j.contiguous, j.soft, j.sample, j.anti);
  const buffer = mask.buffer as ArrayBuffer;
  postMessage({ id: j.id, mask: buffer }, [buffer]);
};
