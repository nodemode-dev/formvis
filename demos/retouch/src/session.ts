import type { Engine } from '../../../frontend/src/engine';
import { buildRetouchDemo } from '../../../frontend/src/demos/retouch';
import { packMedia } from '../../../demo/src/media';
import { addLinks } from './links';

interface Hook { engine: Engine }

const hook = (): Hook | null => (window as unknown as { formvis?: Hook }).formvis ?? null;
const frame = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => done()));
const wait = (ms: number): Promise<void> => new Promise((done) => window.setTimeout(done, ms));

async function ready(): Promise<Engine> {
  for (let i = 0; i < 400; i++) {
    const h = hook();
    if (h?.engine && document.body.classList.contains('app-ready')) return h.engine;
    await wait(50);
  }
  throw new Error('The demo window did not start.');
}

/** The session is the app's own retouching demo (frontend/src/demos/retouch.ts, also Home > Demos in the app), built
 *  from the data packs while html[data-demo] keeps the window hidden, then shown once. */
export async function openSession(): Promise<void> {
  try {
    const e = await ready();
    await buildRetouchDemo(e, packMedia);
    addLinks();
  } finally {
    await frame();
    await frame();
    document.documentElement.removeAttribute('data-demo');
  }
}
