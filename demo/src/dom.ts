import type { ParamSpec } from '../../frontend/src/engine/adjust-params';
import type { Values } from './model';

export function h<T extends HTMLElement = HTMLElement>(html: string): T {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
}

export function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  return root.querySelector(selector) as T;
}

export const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

export function setText(node: Element, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

const hex = (c: { r: number; g: number; b: number }): string => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const rgb = (s: string): { r: number; g: number; b: number } => ({ r: parseInt(s.slice(1, 3), 16), g: parseInt(s.slice(3, 5), 16), b: parseInt(s.slice(5, 7), 16) });
export { hex, rgb };

export function decimals(step: number): number {
  const s = String(step);
  return s.includes('.') ? s.length - s.indexOf('.') - 1 : 0;
}

export interface Controls { root: HTMLElement; set: (values: Values) => void }

export function controls(specs: ParamSpec[], values: Values, onInput: (key: string, value: unknown) => void, onStart: () => void): Controls {
  const root = h('<div class="dv-controls"></div>');
  const setters: Array<(v: Values) => void> = [];
  let lastGroup = '';
  for (const spec of specs) {
    if (spec.group && spec.group !== lastGroup) {
      lastGroup = spec.group;
      root.appendChild(h(`<div class="dv-group-label">${esc(spec.group)}</div>`));
    }
    const current = values[spec.key] ?? spec.def;
    if (spec.kind === 'range') {
      const row = h(`<label class="cv-field cv-slider"><span>${esc(spec.label)}</span><div class="cv-slider-ctl"><input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}"><input class="cv-num cv-input" type="number" min="${spec.min}" max="${spec.max}" step="${spec.step}"></div></label>`);
      const range = q<HTMLInputElement>(row, 'input[type=range]'), number = q<HTMLInputElement>(row, 'input[type=number]');
      const d = decimals(spec.step);
      const show = (v: number): void => { range.value = String(v); number.value = v.toFixed(d); };
      show(Number(current));
      range.addEventListener('pointerdown', onStart);
      range.addEventListener('keydown', onStart);
      number.addEventListener('focus', onStart);
      range.addEventListener('input', () => { const v = Number(range.value); number.value = v.toFixed(d); onInput(spec.key, v); });
      number.addEventListener('input', () => { const v = Math.min(spec.max, Math.max(spec.min, Number(number.value))); if (Number.isFinite(v) && number.value !== '') { range.value = String(v); onInput(spec.key, v); } });
      number.addEventListener('blur', () => { const v = Number(range.value); number.value = v.toFixed(d); });
      setters.push((vals) => show(Number(vals[spec.key] ?? spec.def)));
      root.appendChild(row);
    } else if (spec.kind === 'check') {
      const row = h(`<label class="cv-field cv-toggle-row"><span>${esc(spec.label)}</span><input type="checkbox"></label>`);
      const box = q<HTMLInputElement>(row, 'input');
      box.checked = current === true;
      box.addEventListener('pointerdown', onStart);
      box.addEventListener('change', () => onInput(spec.key, box.checked));
      setters.push((vals) => { box.checked = (vals[spec.key] ?? spec.def) === true; });
      root.appendChild(row);
    } else if (spec.kind === 'color') {
      const row = h(`<label class="cv-field"><span>${esc(spec.label)}</span><input class="dv-color" type="color"></label>`);
      const input = q<HTMLInputElement>(row, 'input');
      input.value = hex(current as { r: number; g: number; b: number });
      input.addEventListener('pointerdown', onStart);
      input.addEventListener('input', () => onInput(spec.key, rgb(input.value)));
      setters.push((vals) => { input.value = hex((vals[spec.key] ?? spec.def) as { r: number; g: number; b: number }); });
      root.appendChild(row);
    } else if (spec.kind === 'select') {
      const row = h(`<label class="cv-field"><span>${esc(spec.label)}</span><select class="cv-select">${spec.options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label>`);
      const sel = q<HTMLSelectElement>(row, 'select');
      sel.value = String(current);
      sel.addEventListener('pointerdown', onStart);
      sel.addEventListener('change', () => onInput(spec.key, sel.value));
      setters.push((vals) => { sel.value = String(vals[spec.key] ?? spec.def); });
      root.appendChild(row);
    }
  }
  return { root, set: (vals) => { for (const s of setters) s(vals); } };
}
