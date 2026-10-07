import { clamp } from '../../engine';
import { el, q, setChecked, setText, setValue } from '../dom';

export interface Row<T> { el: HTMLElement; set(v: T): void }

export const fmt = (v: number): string => String(Math.round(v * 1000) / 1000);

export function sliderRow(label: string, min: number, max: number, step: number, onInput: (v: number) => void, limits: { min?: number; max?: number } = {}): Row<number> {
  const lo = limits.min ?? min, hi = limits.max ?? max;
  const node = el(`<div class="cv-field cv-slider"><span></span><div class="cv-slider-ctl"><input type="range" min="${min}" max="${max}" step="${step}"><input class="cv-num" type="number" min="${lo}" max="${hi}" step="${step}"></div></div>`);
  setText(q(node, 'span'), label);
  const range = q<HTMLInputElement>(node, 'input[type="range"]');
  const box = q<HTMLInputElement>(node, 'input[type="number"]');
  range.setAttribute('aria-label', label); box.setAttribute('aria-label', `${label} value`);   // named for assistive technology (1.53.4)
  range.addEventListener('input', () => { const v = Number(range.value); setValue(box, fmt(v)); onInput(v); });
  box.addEventListener('change', () => {
    const v = clamp(Number(box.value), lo, hi);
    if (!Number.isFinite(v)) return;
    box.value = fmt(v);
    setValue(range, String(v));
    onInput(v);
  });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); box.blur(); } });
  return { el: node, set: (v) => { setValue(range, String(v)); setValue(box, fmt(v)); } };
}

export function selectRow(label: string, options: ReadonlyArray<readonly [string, string]>, onChange: (v: string) => void): Row<string> {
  const node = el(`<label class="cv-field"><span></span><select class="cv-input">${options.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>`);
  setText(q(node, 'span'), label);
  const sel = q<HTMLSelectElement>(node, 'select');
  sel.addEventListener('change', () => onChange(sel.value));
  return { el: node, set: (v) => setValue(sel, v) };
}

export function checkRow(label: string, onChange: (v: boolean) => void): Row<boolean> {
  const node = el('<label class="cv-field cv-check"><span></span><input type="checkbox"></label>');
  setText(q(node, 'span'), label);
  const box = q<HTMLInputElement>(node, 'input');
  box.addEventListener('change', () => onChange(box.checked));
  return { el: node, set: (v) => setChecked(box, v) };
}

export function colorRow(label: string, onChange: (hex: string) => void): Row<string> {
  const node = el('<label class="cv-field"><span></span><input class="cv-input cv-color" type="color"></label>');
  setText(q(node, 'span'), label);
  const input = q<HTMLInputElement>(node, 'input');
  input.addEventListener('input', () => onChange(input.value));
  return { el: node, set: (v) => setValue(input, v) };
}

export function matrixRow(label: string, size: number, min: number, max: number, onInput: (v: number[]) => void): Row<number[]> {
  const node = el('<div class="cv-field"><span></span><div class="cv-matrix"></div></div>');
  setText(q(node, 'span'), label);
  const grid = q(node, '.cv-matrix');
  const cells = Array.from({ length: size * size }, (_, i) => {
    const input = el<HTMLInputElement>(`<input class="cv-input" type="number" min="${min}" max="${max}" step="1">`);
    input.setAttribute('aria-label', `${label} row ${Math.floor(i / size) + 1} column ${(i % size) + 1}`);
    grid.appendChild(input);
    return input;
  });
  const read = (): number[] => cells.map((c) => { const v = Math.round(Number(c.value)); return Number.isFinite(v) ? clamp(v, min, max) : 0; });
  for (const c of cells) c.addEventListener('input', () => onInput(read()));
  return { el: node, set: (v) => { cells.forEach((c, i) => setValue(c, String(v[i] ?? 0))); } };
}

export function numberRow(label: string, min: number, max: number, step: number, onChange: (v: number) => void): Row<number> & { input: HTMLInputElement } {
  const node = el(`<label class="cv-field"><span></span><input class="cv-input" type="number" min="${min}" max="${max}" step="${step}"></label>`);
  setText(q(node, 'span'), label);
  const input = q<HTMLInputElement>(node, 'input');
  input.addEventListener('input', () => { const v = Number(input.value); if (Number.isFinite(v)) onChange(v); });
  return { el: node, input, set: (v) => setValue(input, fmt(v)) };
}
