import { el } from './dom';

const timers = new WeakMap<Element, number>();

/** DEV_PLAN 35.1, nothing floats over the picture: a notice sits in the bottom corner, lets every click through, and
 *  clears away (opacity only, nothing moves) from a pointer that is over the canvas area within a short reach of it, so
 *  it never covers the document under the pointer. */
const pointer = { x: -1e4, y: -1e4, onStage: false, frame: 0, watching: false };

function clearOfPointer(root: HTMLElement): void {
  pointer.frame = 0;
  for (const n of Array.from(root.children)) {
    const r = n.getBoundingClientRect(), near = pointer.onStage && pointer.x >= r.left - 24 && pointer.x <= r.right + 24 && pointer.y >= r.top - 24 && pointer.y <= r.bottom + 24;
    if (n.classList.contains('is-away') !== near) n.classList.toggle('is-away', near);
  }
}

function watchPointer(root: HTMLElement): void {
  if (pointer.watching) return;
  pointer.watching = true;
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.onStage = e.target instanceof Element && !!e.target.closest('.cv-stage');
    if (!pointer.frame) pointer.frame = requestAnimationFrame(() => clearOfPointer(root));
  }, { passive: true });
}

/** A notice. The same text already showing is kept where it is and shown for its full time again, rather than stacked
 *  a second time, which would push the others up the screen. */
export function toast(text: string, kind: 'info' | 'error' = 'info'): void {
  const root = document.getElementById('toast-root');
  if (!root) return;
  watchPointer(root);
  const ms = kind === 'error' ? 6000 : 3600, cls = `cv-toast${kind === 'error' ? ' is-error' : ''}`;
  const same = Array.from(root.children).find((n) => n.textContent === text && n.className === cls);
  if (same) {
    window.clearTimeout(timers.get(same));
    timers.set(same, window.setTimeout(() => same.remove(), ms));
    return;
  }
  const node = el(`<div class="${cls}" role="status"></div>`);
  node.textContent = text;
  root.append(node);
  while (root.children.length > 4) root.firstElementChild?.remove();
  clearOfPointer(root);
  timers.set(node, window.setTimeout(() => node.remove(), ms));
}
