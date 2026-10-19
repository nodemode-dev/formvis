/** Every number field in the window, built or not yet built: typed arithmetic (100+20, 50%*2), a draggable label and
 *  unit, and a pop-up slider. One set of delegated listeners on the document, installed once; no field is rebuilt.
 *  While a field has focus it is a text box (a number box would refuse the operators); on leaving it is a number box
 *  again and the tools' own change handlers hear one ordinary value. */

const NUM = 'input[type="number"], input[data-numtext]';
const originals = new WeakMap<HTMLInputElement, string>();
const SYNTHETIC = '__numfield';

/** Evaluates + - * / ( ) with unary signs and a trailing % (a percentage of `pct`). Null when the text is not arithmetic. */
export function evalExpr(text: string, pct = 100): number | null {
  const s = text.replace(/\s+/g, '').replace(/,/g, '.');
  if (!s || !/^[0-9.+\-*/()%x×÷]+$/.test(s)) return null;
  const src = s.replace(/[x×]/g, '*').replace(/÷/g, '/');
  let i = 0;
  const num = (): number | null => {
    if (src[i] === '(') {
      i++;
      const v = sum();
      if (v === null || src[i] !== ')') return null;
      i++;
      return v;
    }
    const m = /^(?:\d+\.?\d*|\.\d+)/.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  };
  const unary = (): number | null => {
    if (src[i] === '-') { i++; const v = unary(); return v === null ? null : -v; }
    if (src[i] === '+') { i++; return unary(); }
    let v = num();
    while (v !== null && src[i] === '%') { i++; v = (v / 100) * pct; }
    return v;
  };
  const prod = (): number | null => {
    let v = unary();
    while (v !== null && (src[i] === '*' || src[i] === '/')) {
      const op = src[i++], r = unary();
      if (r === null) return null;
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const sum = (): number | null => {
    let v = prod();
    while (v !== null && (src[i] === '+' || src[i] === '-')) {
      const op = src[i++], r = prod();
      if (r === null) return null;
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const out = sum();
  return out !== null && i === src.length && Number.isFinite(out) ? out : null;
}

const isNum = (t: EventTarget | null): t is HTMLInputElement => t instanceof HTMLInputElement && (t.type === 'number' || t.hasAttribute('data-numtext')) && !t.hasAttribute('data-plain');
const bound = (a: string | null): number | null => { if (a === null || a === '') return null; const n = Number(a); return Number.isFinite(n) ? n : null; };
const limits = (f: HTMLInputElement): { lo: number | null; hi: number | null; step: number } => ({ lo: bound(f.getAttribute('min')), hi: bound(f.getAttribute('max')), step: bound(f.getAttribute('step')) || 1 });
const clampTo = (v: number, lo: number | null, hi: number | null): number => Math.min(hi ?? Infinity, Math.max(lo ?? -Infinity, v));
const tidy = (v: number): string => String(Number(v.toFixed(6)));

function fire(f: HTMLInputElement, types: Array<'input' | 'change'>): void {
  for (const t of types) { const ev = new Event(t, { bubbles: true }); (ev as unknown as Record<string, boolean>)[SYNTHETIC] = true; f.dispatchEvent(ev); }
}

/** Puts a value in the field as a number box and tells its owner. `back` keeps the text box for further typing. */
function put(f: HTMLInputElement, v: number, types: Array<'input' | 'change'>, back: boolean, snap = false): void {
  const { lo, hi, step } = limits(f);
  const r = clampTo(v, lo, hi), shown = snap ? Number((Math.round(r / step) * step).toFixed(6)) : r;
  const wasText = f.type === 'text';
  if (wasText) f.type = 'number';
  f.value = tidy(shown);
  fire(f, types);
  if (wasText && back) { originals.set(f, f.value); f.type = 'text'; f.setAttribute('data-numtext', ''); }
}

/** Reads what the text box holds as a number; a plain number, an expression, or null. */
function parse(f: HTMLInputElement): number | null {
  const raw = f.value.trim();
  if (raw === '') return null;
  const plain = Number(raw);
  if (Number.isFinite(plain) && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(raw)) return plain;
  // A % is a hundredth of 100 in a field that is itself a percentage, else a hundredth of the value the field held.
  const percent = !!f.closest('label, .cv-field, .cv-opt, .cv-dialog-row')?.textContent?.includes('%') || (f.getAttribute('aria-label') ?? '').includes('%');
  const held = Number(originals.get(f));
  return evalExpr(raw, percent || !Number.isFinite(held) || held === 0 ? 100 : held);
}

function leave(f: HTMLInputElement, keep: boolean): void {
  if (f.type !== 'text') return;
  const before = originals.get(f) ?? '', v = keep ? parse(f) : null;
  f.type = 'number';
  f.removeAttribute('data-numtext');
  if (v === null) { f.value = before; return; }
  const { lo, hi } = limits(f);
  const text = tidy(clampTo(v, lo, hi));
  if (text === before) { f.value = before; return; }
  f.value = text;
  fire(f, ['input', 'change']);
}

let pop: HTMLElement | null = null, popFor: HTMLInputElement | null = null;
const popParts = (): { box: HTMLElement; fill: HTMLElement; thumb: HTMLElement } => {
  if (!pop) {
    pop = document.createElement('div');
    pop.className = 'cv-numpop';
    pop.hidden = true;
    pop.innerHTML = '<div class="cv-numpop-track"><div class="cv-numpop-fill"></div><div class="cv-numpop-thumb"></div></div>';
    (document.getElementById('overlay-root') ?? document.body).appendChild(pop);
    const track = pop.firstElementChild as HTMLElement;
    let drag = false;
    const move = (e: PointerEvent): void => {
      const f = popFor;
      if (!f || !drag) return;
      const { lo, hi } = limits(f), r = track.getBoundingClientRect();
      if (lo === null || hi === null) return;
      put(f, lo + clampTo((e.clientX - r.left) / Math.max(1, r.width), 0, 1) * (hi - lo), ['input', 'change'], true);
      paintPop(f);
    };
    pop.addEventListener('pointerdown', (e) => { e.preventDefault(); drag = true; track.setPointerCapture(e.pointerId); move(e); });
    pop.addEventListener('pointermove', move);
    pop.addEventListener('pointerup', () => { drag = false; });
    pop.addEventListener('pointercancel', () => { drag = false; });
  }
  const p = pop;
  return { box: p, fill: p.querySelector('.cv-numpop-fill') as HTMLElement, thumb: p.querySelector('.cv-numpop-thumb') as HTMLElement };
};

function paintPop(f: HTMLInputElement): void {
  const { lo, hi } = limits(f);
  if (lo === null || hi === null || hi <= lo) return;
  const v = parse(f) ?? Number(originals.get(f) ?? lo), at = clampTo((v - lo) / (hi - lo), 0, 1) * 100, { fill, thumb } = popParts();
  fill.style.width = `${at}%`;
  thumb.style.left = `${at}%`;
}

function showPop(f: HTMLInputElement): void {
  const { lo, hi } = limits(f);
  if (lo === null || hi === null || hi <= lo || f.closest('[data-nopop]') || f.parentElement?.querySelector('input[type="range"]')) return;
  const { box } = popParts(), r = f.getBoundingClientRect(), w = 150;
  popFor = f;
  paintPop(f);
  box.style.width = `${w}px`;
  box.style.left = `${Math.round(Math.max(4, Math.min(r.left, window.innerWidth - w - 4)))}px`;
  box.style.top = `${Math.round(Math.min(r.bottom + 4, window.innerHeight - 30))}px`;
  box.hidden = false;
}

function hidePop(): void { if (pop && !pop.hidden) pop.hidden = true; popFor = null; }

let pointerFocus = false;

export function installNumberFields(): void {
  const w = window as unknown as Record<string, boolean>;
  if (w.__numFieldsInstalled) return;
  w.__numFieldsInstalled = true;

  document.addEventListener('pointerdown', () => { pointerFocus = true; }, true);
  document.addEventListener('keydown', () => { pointerFocus = false; }, true);

  document.addEventListener('focusin', (e) => {
    const f = e.target;
    if (!isNum(f) || f.type !== 'number') return;
    originals.set(f, f.value);
    f.type = 'text';
    f.setAttribute('data-numtext', '');
    if (!pointerFocus) f.select();
    showPop(f);
  });
  document.addEventListener('focusout', (e) => {
    const f = e.target;
    if (!isNum(f)) return;
    hidePop();
    leave(f, true);
  });

  // Native input and change events from a box in text mode carry text a tool cannot read; the settled value is sent instead.
  for (const t of ['input', 'change'] as const) {
    document.addEventListener(t, (e) => {
      if (!isNum(e.target) || e.target.type !== 'text' || (e as unknown as Record<string, boolean>)[SYNTHETIC]) return;
      e.stopImmediatePropagation();
      if (t === 'input' && popFor === e.target) paintPop(e.target);
    }, true);
  }

  document.addEventListener('keydown', (e) => {
    const f = e.target;
    if (!isNum(f) || f.type !== 'text' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') {
      const v = parse(f);
      if (v !== null) put(f, v, ['input', 'change'], true);
      else f.value = originals.get(f) ?? f.value;
      originals.set(f, f.value);
      f.select();
      const frame = f.closest<HTMLElement>('.cv-dialog');
      if (frame) setTimeout(() => { if (!frame.contains(document.activeElement)) frame.focus(); }, 0);
    } else if (e.key === 'Escape') {
      f.value = originals.get(f) ?? f.value;
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const { step } = limits(f), now = parse(f) ?? Number(originals.get(f) ?? 0);
      put(f, (Number.isFinite(now) ? now : 0) + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1), ['input', 'change'], true, true);
      originals.set(f, f.value);
      f.select();
      paintPop(f);
    }
  }, true);
  document.addEventListener('keydown', (e) => {
    const f = e.target;
    if (!isNum(f) || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (e.key !== 'Enter' && e.key !== 'Escape')) return;
    // In a dialog the focus stays inside it, so its keys (Mod+Z, Tab, Escape) still reach it.
    const frame = f.closest<HTMLElement>('.cv-dialog');
    if (frame) frame.focus(); else f.blur();
  });

  // A drag on a field's label or unit moves its value; Shift ten times faster, Alt ten times finer.
  const labelOf = (t: EventTarget | null): { span: HTMLElement; f: HTMLInputElement } | null => {
    const span = t instanceof Element ? t.closest<HTMLElement>('.cv-field > span:first-child, .cv-opt > span, .cv-dialog-row > span:first-child, .cv-prop-row > span:first-child') : null;
    const host = span?.parentElement;
    if (!span || !host || span.classList.contains('cv-scrub') && !span.classList.contains('cv-scrubnum')) return null;
    const fields = host.querySelectorAll(NUM);
    if (fields.length !== 1 || host.querySelector('input[type="range"]') || !isNum(fields[0])) return null;
    return { span, f: fields[0] as HTMLInputElement };
  };
  document.addEventListener('pointerover', (e) => {
    const l = labelOf(e.target);
    if (l && !l.span.classList.contains('cv-scrubnum')) l.span.classList.add('cv-scrubnum');
  }, true);
  let scrub: { f: HTMLInputElement; x: number; v: number; id: number; on: boolean; span: HTMLElement } | null = null;
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const l = labelOf(e.target);
    if (!l || l.f.disabled) return;
    const v = Number(l.f.value);
    scrub = { f: l.f, x: e.clientX, v: Number.isFinite(v) ? v : 0, id: e.pointerId, on: false, span: l.span };
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (!scrub || e.pointerId !== scrub.id) return;
    const dx = e.clientX - scrub.x;
    if (!scrub.on) {
      if (Math.abs(dx) < 3) return;
      scrub.on = true;
      scrub.span.setPointerCapture(e.pointerId);
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
    const { lo, hi, step } = limits(scrub.f), per = (lo !== null && hi !== null ? Math.max((hi - lo) / 250, step / 4) : step * 0.5) * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);
    put(scrub.f, scrub.v + dx * per, ['input', 'change'], false, true);
  }, true);
  const end = (e: PointerEvent): void => {
    if (!scrub || e.pointerId !== scrub.id) return;
    if (scrub.on) {
      if (scrub.span.hasPointerCapture(e.pointerId)) scrub.span.releasePointerCapture(e.pointerId);
      document.addEventListener('click', (c) => c.stopPropagation(), { capture: true, once: true });
    }
    scrub = null;
  };
  document.addEventListener('pointerup', end, true);
  document.addEventListener('pointercancel', end, true);
  window.addEventListener('blur', hidePop);
}
