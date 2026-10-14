import { Raster, type Engine } from '../../engine';
import { api } from '../../io/api';

/** Layer > Video Layers > New Video Layer from File (DEV_PLAN 33.4a): chooses a clip with a one-shot file input, has the
 *  engine's ffmpeg decode the whole of it (300 frames at most) and gives the frames to the engine as a video layer. */
export function videoLayerFromFile(engine: Engine, say: (message: string) => void, replace = false): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'video/*,.mp4,.mov,.m4v,.webm,.mkv,.avi';
  input.style.display = 'none';
  input.addEventListener('cancel', () => input.remove());
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.remove();
    if (file) void load(engine, file, say, replace);
  });
  document.body.append(input);
  input.click();
}

/** Layer > Video Layers > Replace Footage (DEV_PLAN 33.4b): the chosen clip becomes the active video layer's footage. */
export function replaceFootageFromFile(engine: Engine, say: (message: string) => void): void {
  videoLayerFromFile(engine, say, true);
}

async function load(engine: Engine, file: File, say: (message: string) => void, replace: boolean): Promise<void> {
  say('Reading the video...');
  try {
    const r = await api.videoFrames(file, 0, 0, 1);
    const rasters: Raster[] = [];
    for (const blob of r.frames.slice(0, 300)) {
      const bmp = await createImageBitmap(blob), ras = new Raster(bmp.width, bmp.height);
      ras.ctx.drawImage(bmp, 0, 0); bmp.close(); ras.touch(); rasters.push(ras);
    }
    if (replace) { say(engine.replaceFootage(rasters) ? `Footage replaced, ${rasters.length} frames.` : 'The footage could not be replaced.'); return; }
    say(engine.addVideoLayer(file.name.replace(/\.[^.]+$/, ''), rasters) ? `Video layer added, ${rasters.length} frames.` : 'The video layer could not be added.');
  } catch (err) { say(err instanceof Error ? err.message : 'The frames could not be read.'); }
}
