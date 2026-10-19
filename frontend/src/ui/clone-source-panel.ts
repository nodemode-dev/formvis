import type { Engine } from '../engine';
import { clamp } from '../engine';
import { checkRow, numberRow } from './panels/controls';
import { q, setText } from './dom';
import { icon } from './icons';

const SLOTS = [0, 1, 2, 3, 4] as const;

/** The Clone Source panel (Window menu, DEV_PLAN 36.3): the five sources, the chosen one's point, its scale, angle and
 *  flips, Reset Transform, and the overlay's Show, Opacity, Clipped and Auto Hide. Built once; the engine's 'options' and
 *  'overlay' events patch values in place, and an input that has focus is never overwritten. */
export function createCloneSourcePanel(root: HTMLElement, engine: Engine): void {
  root.insertAdjacentHTML('beforeend',
    '<section class="cv-preset-panel cv-clone-source" aria-label="Clone Source">' +
    `<div class="cv-panel-head"><span class="cv-comps-title">${icon('tStamp', 14)}<span>Clone Source</span></span><span></span><span class="cv-comps-count"></span></div>` +
    `<div class="cv-clone-slots" role="group" aria-label="Clone Source">${SLOTS.map((i) => `<button class="cv-btn cv-clone-slot" type="button" data-slot="${i}" aria-pressed="false" title="Source ${i + 1}" aria-label="Source ${i + 1}">${i + 1}</button>`).join('')}</div>` +
    '<dl class="cv-clone-pos"><dt>X</dt><dd data-s="x"></dd><dt>Y</dt><dd data-s="y"></dd></dl>' +
    '<div class="cv-clone-rows"></div>' +
    '<div class="cv-clone-overlay"></div></section>');
  const sec = q(root, 'section.cv-clone-source');
  const slotBtns = Array.from(sec.querySelectorAll<HTMLButtonElement>('.cv-clone-slot'));
  const rows = q(sec, '.cv-clone-rows'), over = q(sec, '.cv-clone-overlay');
  const r = engine.retouch;
  const changed = (): void => { engine.emit('options', null); engine.emit('overlay', null); };

  const scale = numberRow('Scale (W, H %)', 1, 1000, 1, (v) => { r.cloneScale = clamp(v, 1, 1000); changed(); });
  const angle = numberRow('Angle', -180, 180, 1, (v) => { r.cloneAngle = clamp(v, -180, 180); changed(); });
  const flipH = checkRow('Flip Horizontal', (v) => { r.cloneFlipH = v; changed(); });
  const flipV = checkRow('Flip Vertical', (v) => { r.cloneFlipV = v; changed(); });
  rows.append(scale.el, angle.el, flipH.el, flipV.el);
  rows.insertAdjacentHTML('beforeend', '<button class="cv-btn" type="button" data-act="reset">Reset Transform</button>');
  const reset = q<HTMLButtonElement>(rows, '[data-act="reset"]');

  const show = checkRow('Show Overlay', (v) => engine.setCloneOverlay({ show: v }));
  const opacity = numberRow('Opacity (%)', 0, 100, 1, (v) => engine.setCloneOverlay({ opacity: clamp(v, 0, 100) / 100 }));
  const clipped = checkRow('Clipped', (v) => engine.setCloneOverlay({ clipped: v }));
  const autoHide = checkRow('Auto Hide', (v) => engine.setCloneOverlay({ autoHide: v }));
  const invert = checkRow('Invert', (v) => engine.setCloneOverlay({ invert: v }));
  over.append(show.el, opacity.el, clipped.el, invert.el, autoHide.el);

  const sync = (): void => {
    const rt = engine.retouch, ov = engine.cloneOverlay, src = engine.cloneSource;
    slotBtns.forEach((b, i) => {
      const on = i === engine.cloneSlot, empty = !engine.cloneSlots[i] && !(on && src);
      if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-active', on);
      b.classList.toggle('is-empty', empty);
      const t = empty ? `Source ${i + 1} (empty)` : `Source ${i + 1}`;
      if (b.title !== t) { b.title = t; b.setAttribute('aria-label', t); }
    });
    setText(q(sec, '[data-s="x"]'), src ? String(Math.round(src.x)) : 'Not set');
    setText(q(sec, '[data-s="y"]'), src ? String(Math.round(src.y)) : 'Not set');
    scale.set(rt.cloneScale); angle.set(rt.cloneAngle);
    flipH.set(rt.cloneFlipH); flipV.set(rt.cloneFlipV);
    show.set(ov.show); opacity.set(Math.round(ov.opacity * 100));
    clipped.set(ov.clipped); autoHide.set(ov.autoHide); invert.set(ov.invert);
    const off = !ov.show;
    for (const row of [opacity, clipped, invert, autoHide]) {
      const inp = row.el.querySelector('input');
      if (inp && inp.disabled !== off) inp.disabled = off;
    }
  };

  sec.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-slot]') : null;
    if (b?.dataset.slot) engine.selectCloneSlot(Number(b.dataset.slot));
  });
  reset.addEventListener('click', () => engine.resetCloneTransform());
  engine.on('options', () => sync());
  engine.on('overlay', () => sync());
  sync();
}
