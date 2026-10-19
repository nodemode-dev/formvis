import { el, q, setDisabled } from '../dom';
import { checkRow, sliderRow } from './controls';

export interface DepthLimit { near: number; far: number; feather: number; detail: boolean }

/** The Limit by depth rows of a dialog that edits through the selection: off until ticked, then the edit stays inside
 *  the shared depth map between far and near, softened by feather. The rows are built once and only enable or disable. */
export function depthLimitRows(): { el: HTMLElement; value(): DepthLimit | null } {
  const s = { on: false, near: 100, far: 60, feather: 10, detail: false };
  const root = el('<div class="cv-panel-section"></div>');
  const sliders = [
    sliderRow('Near (%)', 0, 100, 1, (v) => { s.near = v; }),
    sliderRow('Far (%)', 0, 100, 1, (v) => { s.far = v; }),
    sliderRow('Feather (%)', 0, 50, 1, (v) => { s.feather = v; }),
  ];
  const detail = checkRow('Fine depth detail (slower)', (v) => { s.detail = v; });
  const fields = [...sliders.map((r) => q<HTMLInputElement>(r.el, 'input[type="range"]')), ...sliders.map((r) => q<HTMLInputElement>(r.el, 'input.cv-num')), q<HTMLInputElement>(detail.el, 'input')];
  const apply = (): void => { for (const f of fields) setDisabled(f, !s.on); };
  const on = checkRow('Limit by depth', (v) => { s.on = v; apply(); });
  sliders[0].set(s.near); sliders[1].set(s.far); sliders[2].set(s.feather);
  apply();
  root.append(on.el, ...sliders.map((r) => r.el), detail.el);
  return { el: root, value: () => (s.on ? { near: s.near, far: s.far, feather: s.feather, detail: s.detail } : null) };
}
