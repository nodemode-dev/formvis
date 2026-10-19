/// <reference lib="webworker" />
import { addNoise, defaultLensFix, gaussianBlur, lensCorrect, motionBlur, unsharpMask } from './filters';
import { developImage } from './develop';
import { lensBlur, shakeReduce, smartSharpen } from './filters-more';
import { isGalleryKind, runGallery } from './blur-gallery';
import { isLibKind, runLib } from './filter-library';
import type { FilterJob } from './filter-jobs';

/** Filters run here, off the main thread: formvis's kernels are JavaScript, so the
 *  live preview would stall the page if it ran there; working here keeps it responsive,
 *  and pixels move as transferred buffers rather than copies. */
onmessage = (e: MessageEvent<FilterJob>) => {
  const job = e.data;
  const src = new ImageData(new Uint8ClampedArray(job.pixels), job.width, job.height);
  const s = job.settings;
  let out = src;
  if (isGalleryKind(job.kind)) out = runGallery(job.kind, s.gallery, src, job.scale);
  else if (isLibKind(job.kind)) out = runLib(job.kind, s.lib?.[job.kind], job.seed, src, job.scale, job.frame, s.colors);
  else if (job.kind === 'gaussianBlur') out = gaussianBlur(src, s.radius * job.scale);
  else if (job.kind === 'motionBlur') out = motionBlur(src, s.angle, s.distance * job.scale);
  else if (job.kind === 'addNoise') out = addNoise(src, s.amount, s.gaussian, s.monochromatic, job.seed);
  else if (job.kind === 'lensCorrection') out = lensCorrect(src, s.distortion, s.lensFix ?? defaultLensFix());
  else if (job.kind === 'unsharpMask') out = unsharpMask(src, s.usmAmount, s.usmRadius * job.scale, s.threshold);
  else if (job.kind === 'develop') out = developImage(src, s.develop, job.scale);
  else if (job.kind === 'lensBlur') out = lensBlur(src, s.lensRadius * job.scale, s.lensBrightness, s.lensThreshold);
  else if (job.kind === 'smartSharpen') out = smartSharpen(src, s.smart, job.scale);
  else if (job.kind === 'shakeReduction') out = shakeReduce(src, s.shake, job.scale);
  const pixels = out.data.buffer as ArrayBuffer;
  postMessage({ id: job.id, width: out.width, height: out.height, pixels }, [pixels]);
};
