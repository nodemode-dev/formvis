import { el } from './dom';
import { icon } from './icons';
import { loadPrefs } from './prefs';

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

export interface NoticeAction { label: string; run: () => void }
export interface NoticeOptions { actions?: NoticeAction[]; /** Milliseconds shown; 0 keeps it until it is dismissed. */ ms?: number }
export interface NoticeRecord { id: number; text: string; kind: 'info' | 'error'; at: number; count: number }

const HISTORY_MAX = 100;
const history: NoticeRecord[] = [];
const watchers = new Set<() => void>();
const actionsOf = new WeakMap<Element, NoticeAction[]>();
let nextId = 1;

/** Every notice shown, oldest first, the last 100; the same text twice in a row is one entry with a count. */
export const noticeHistory = (): readonly NoticeRecord[] => history;
export function clearNoticeHistory(): void { history.length = 0; for (const w of watchers) w(); }
export function onNoticeHistory(fn: () => void): () => void { watchers.add(fn); return () => watchers.delete(fn); }

function record(text: string, kind: 'info' | 'error'): void {
  const last = history[history.length - 1];
  if (last && last.text === text && last.kind === kind) { last.count++; last.at = Date.now(); }
  else { history.push({ id: nextId++, text, kind, at: Date.now(), count: 1 }); if (history.length > HISTORY_MAX) history.shift(); }
  for (const w of watchers) w();
}

function watchPointer(root: HTMLElement): void {
  if (pointer.watching) return;
  pointer.watching = true;
  root.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null, node = target?.closest<HTMLElement>('.cv-toast');
    if (!node) return;
    if (target?.closest('.cv-toast-close')) { window.clearTimeout(timers.get(node)); node.remove(); return; }
    const act = target?.closest<HTMLElement>('.cv-toast-action');
    if (!act) return;
    const run = actionsOf.get(node)?.[Number(act.dataset.at)];
    window.clearTimeout(timers.get(node));
    node.remove();
    run?.run();
  });
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.onStage = e.target instanceof Element && !!e.target.closest('.cv-stage');
    if (!pointer.frame) pointer.frame = requestAnimationFrame(() => clearOfPointer(root));
  }, { passive: true });
}

/** A notice. The same text already showing is kept where it is and shown for its full time again, rather than stacked
 *  a second time, which would push the others up the screen. */
export function toast(text: string, kind: 'info' | 'error' = 'info', opts: NoticeOptions = {}): () => void {
  record(text, kind);
  const root = document.getElementById('toast-root');
  if (!root) return () => undefined;
  watchPointer(root);
  const actions = opts.actions ?? [], ms = opts.ms ?? (actions.length ? 10000 : loadPrefs().noticeSeconds * 1000 || (kind === 'error' ? 6000 : 3600)), cls = `cv-toast${kind === 'error' ? ' is-error' : ''}`;
  const arm = (n: Element): void => { window.clearTimeout(timers.get(n)); if (ms > 0) timers.set(n, window.setTimeout(() => n.remove(), ms)); };
  const same = Array.from(root.children).find((n) => (n as HTMLElement).dataset.text === text && n.className === cls && !actions.length && !actionsOf.has(n));
  if (same) { arm(same); return () => { window.clearTimeout(timers.get(same)); same.remove(); }; }
  const node = el(`<div class="${cls}" role="status"><span class="cv-toast-text"></span><span class="cv-toast-actions"></span><button class="cv-toast-close" type="button" title="Dismiss" aria-label="Dismiss notice">${icon('close', 12)}</button></div>`);
  node.dataset.text = text;
  node.firstElementChild!.textContent = text;
  if (actions.length) {
    actionsOf.set(node, actions);
    const bar = node.querySelector('.cv-toast-actions')!;
    actions.forEach((a, i) => { const b = el(`<button class="cv-toast-action" type="button" data-at="${i}"></button>`); b.textContent = a.label; bar.append(b); });
  }
  root.append(node);
  while (root.children.length > 4) root.firstElementChild?.remove();
  clearOfPointer(root);
  arm(node);
  return () => { window.clearTimeout(timers.get(node)); node.remove(); };
}
