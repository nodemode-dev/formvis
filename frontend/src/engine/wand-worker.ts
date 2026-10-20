/// <reference lib="webworker" />
import { findRegion } from './wand-jobs';
import type { WandJob } from './wand-jobs';

onmessage = (e: MessageEvent<WandJob>) => {
  const j = e.data, mask = findRegion(new Uint8ClampedArray(j.pixels), j.width, j.height, j.x, j.y, j.tolerance, j.contiguous, j.soft);
  const buffer = mask.buffer as ArrayBuffer;
  postMessage({ id: j.id, mask: buffer }, [buffer]);
};
