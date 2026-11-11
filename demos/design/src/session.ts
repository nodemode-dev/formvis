import type { Engine } from '../../../frontend/src/engine';
import { buildDesignDemo } from '../../../frontend/src/demos/design';
import { packMedia } from '../../../demo/src/media';

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

/** The session is the app's own design demo (frontend/src/demos/design.ts, also Home > Demos in the app), built from
 *  the data packs while html[data-demo] keeps the window hidden, then shown once. */
export async function openSession(): Promise<void> {
  try {
    const e = await ready();
    await buildDesignDemo(e, packMedia);
  } finally {
    await frame();
    await frame();
    document.documentElement.removeAttribute('data-demo');
  }
}
