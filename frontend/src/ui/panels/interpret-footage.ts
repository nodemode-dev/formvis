import type { Engine } from '../../engine';
import type { FootageInterpretation } from '../../engine/types';
import { Dialog } from '../dialogs';

/** Layer > Video Layers > Interpret Footage (DEV_PLAN 33.4): the active video layer's own frame rate, how many times
 *  it loops, and how its alpha is read. Built hidden, filled from the layer, then opened once. False when the active
 *  layer is not a video layer on the timeline. */
export function openInterpretFootage(engine: Engine): boolean {
  const l = engine.current?.activeLayer, vt = engine.video;
  if (!l?.video || !vt || !vt.tracks[l.id]) return false;
  const it = l.video.interpret ?? {};
  const dlg = new Dialog('Interpret Footage', 420);
  const num = (value: number, min: number, max: number, step: string): HTMLInputElement => {
    const i = document.createElement('input');
    i.type = 'number'; i.min = String(min); i.max = String(max); i.step = step; i.value = String(value); i.className = 'cv-input';
    return i;
  };
  const fps = num(it.fps ?? vt.fps, 1, 240, '0.001'), loop = num(it.loop ?? 1, 1, 100, '1');
  const alpha = document.createElement('select');
  alpha.className = 'cv-input';
  for (const [v, label] of [['straight', 'Straight'], ['ignore', 'Ignore'], ['premultiplied', 'Premultiplied with matte']] as const) {
    const o = document.createElement('option'); o.value = v; o.textContent = label; alpha.append(o);
  }
  alpha.value = it.alpha ?? 'straight';
  const matte = document.createElement('input');
  matte.type = 'color'; matte.className = 'cv-input';
  const m = it.matte ?? { r: 0, g: 0, b: 0 }, hex = (n: number): string => n.toString(16).padStart(2, '0');
  matte.value = `#${hex(m.r)}${hex(m.g)}${hex(m.b)}`;
  dlg.field('Frame rate', fps);
  dlg.field('Loop', loop);
  dlg.field('Alpha', alpha);
  const matteRow = dlg.field('Matte', matte);
  const sync = (): void => { matteRow.classList.toggle('is-off', alpha.value !== 'premultiplied'); matte.disabled = alpha.value !== 'premultiplied'; };
  alpha.addEventListener('change', sync);
  sync();
  dlg.button('Cancel', 'ghost', () => dlg.close());
  dlg.onClose = () => dlg.scrim.remove();
  dlg.button('OK', 'primary', () => {
    const a = alpha.value === 'ignore' || alpha.value === 'premultiplied' ? alpha.value : 'straight';
    const c = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(matte.value);
    const next: FootageInterpretation = {
      fps: Number.isFinite(fps.valueAsNumber) ? fps.valueAsNumber : vt.fps,
      loop: Number.isFinite(loop.valueAsNumber) ? loop.valueAsNumber : 1,
      alpha: a,
      ...(c ? { matte: { r: parseInt(c[1], 16), g: parseInt(c[2], 16), b: parseInt(c[3], 16) } } : {}),
    };
    engine.interpretFootage(next);
    dlg.close();
  });
  dlg.open(fps);
  return true;
}
