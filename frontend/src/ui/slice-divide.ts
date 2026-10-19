import type { Engine } from '../engine';
import { Dialog } from './dialogs';

/** Slice Select > Divide Slice: the active slice cut into equal slices across and down. Returns false when no slice is active. */
export function openDivideSlice(engine: Engine): boolean {
  const slice = engine.current?.doc.slices?.find((s) => s.id === engine.activeSlice);
  if (!slice) return false;
  const dlg = new Dialog('Divide Slice', 360);
  const num = (value: number): HTMLInputElement => { const i = document.createElement('input'); i.type = 'number'; i.step = '1'; i.min = '1'; i.max = '64'; i.value = String(value); i.className = 'cv-input'; return i; };
  const across = num(2), down = num(1);
  dlg.field('Slices across', across);
  dlg.field('Slices down', down);
  dlg.button('Cancel', 'ghost', () => dlg.close());
  dlg.button('OK', 'primary', () => {
    if (engine.divideSlice(slice.id, across.valueAsNumber || 1, down.valueAsNumber || 1)) dlg.close();
  });
  dlg.open(across);
  return true;
}
