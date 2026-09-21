/// <reference lib="webworker" />
import { addNoise, gaussianBlur, lensDistort, motionBlur, unsharpMask } from './filters';
import { developImage } from './develop';
import type { FilterJob } from './filter-jobs';

/** runs its filters off the main thread (Core Image on the GPU). sonny's kernels are JavaScript, so the
 *  interactive preview runs here instead, leaving the interface responsive while a slider is dragged. The pixels
 *  arrive and leave as transferred buffers, so nothing is copied. */
onmessage = (e: MessageEvent<FilterJob>) => {
  const job = e.data;
  const src = new ImageData(new Uint8ClampedArray(job.pixels), job.width, job.height);
  const s = job.settings;
  let out = src;
  if (job.kind === 'gaussianBlur') out = gaussianBlur(src, s.radius * job.scale);
  else if (job.kind === 'motionBlur') out = motionBlur(src, s.angle, s.distance * job.scale);
  else if (job.kind === 'addNoise') out = addNoise(src, s.amount, s.gaussian, s.monochromatic, job.seed);
  else if (job.kind === 'lensCorrection') out = lensDistort(src, s.distortion);
  else if (job.kind === 'unsharpMask') out = unsharpMask(src, s.usmAmount, s.usmRadius * job.scale, s.threshold);
  else if (job.kind === 'develop') out = developImage(src, s.develop, job.scale);
  const pixels = out.data.buffer as ArrayBuffer;
  postMessage({ id: job.id, width: out.width, height: out.height, pixels }, [pixels]);
};
