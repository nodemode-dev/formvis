import type { Engine } from '../../engine';
import { DUOTONE_COUNT, DUOTONE_STOPS, defaultDuotone, duotoneLut, straightCurve, type Duotone } from '../../engine/duotone';
import { Dialog } from '../dialogs';
import { selectRow, type Row } from './controls';

const hex = (c: { r: number; g: number; b: number }): string => '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string): { r: number; g: number; b: number } => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });

/** Image > Mode > Duotone... (DEV_PLAN 31.3 part a): type, four ink rows (colour, name, 13-point curve) and a live ramp. */
export class DuotoneDialog extends Dialog {
  private d: Duotone = defaultDuotone();
  private readonly typeRow: Row<string>;
  private readonly okBtn: HTMLButtonElement;
  private readonly ramp: HTMLCanvasElement;
  private readonly rows: { box: HTMLElement; color: HTMLInputElement; name: HTMLInputElement; curve: HTMLInputElement[]; reset: HTMLButtonElement }[] = [];

  constructor(private readonly engine: Engine) {
    super('Duotone Options', 560);
    this.typeRow = selectRow('Type', [['mono', 'Monotone'], ['duo', 'Duotone'], ['tri', 'Tritone'], ['quad', 'Quadtone']], (v) => { this.d.type = v as Duotone['type']; this.sync(); });
    this.body.append(this.typeRow.el);
    for (let i = 0; i < 4; i++) {
      const box = document.createElement('div');
      box.style.cssText = 'display:grid;grid-template-columns:36px 1fr auto;gap:6px;align-items:center;margin:6px 0 2px';
      const color = document.createElement('input'); color.type = 'color'; color.className = 'cv-input cv-color'; color.setAttribute('aria-label', `Ink ${i + 1} color`);
      const name = document.createElement('input'); name.type = 'text'; name.className = 'cv-input'; name.maxLength = 40; name.setAttribute('aria-label', `Ink ${i + 1} name`);
      const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'btn ghost'; reset.textContent = 'Straight';
      color.addEventListener('input', () => { this.d.inks[i].color = fromHex(color.value); this.draw(); });
      name.addEventListener('input', () => { this.d.inks[i].name = name.value; });
      reset.addEventListener('click', () => { this.d.inks[i].curve = straightCurve(); this.fill(); this.draw(); });
      box.append(color, name, reset);
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(13,1fr);gap:2px;margin:0 0 4px';
      const curve = DUOTONE_STOPS.map((s, k) => {
        const f = document.createElement('input'); f.type = 'number'; f.min = '0'; f.max = '100'; f.step = '1'; f.className = 'cv-input cv-num';
        f.style.cssText = 'width:100%;min-width:0;padding:2px;text-align:center';
        f.title = `Ink ${i + 1} output at ${s} percent input`; f.setAttribute('aria-label', f.title);
        f.addEventListener('change', () => { const v = Number(f.value); if (Number.isFinite(v)) this.d.inks[i].curve[k] = Math.max(0, Math.min(100, v)); f.value = String(this.d.inks[i].curve[k]); this.draw(); });
        grid.append(f);
        return f;
      });
      this.rows.push({ box, color, name, curve, reset });
      this.body.append(box, grid);
    }
    this.ramp = document.createElement('canvas'); this.ramp.width = 256; this.ramp.height = 16;
    this.ramp.style.cssText = 'display:block;width:100%;height:16px;margin-top:6px';
    this.body.append(this.ramp);
    this.button('Cancel', 'ghost', () => this.close());
    this.okBtn = this.button('OK', 'primary', () => { const d = this.d; this.close(); this.engine.setDuotone(d); });
  }

  show(): void {
    if (this.isOpen) return;
    const cur = this.engine.current?.doc.duotone;
    this.d = cur ? { type: cur.type, inks: cur.inks.map((k) => ({ name: k.name, color: { ...k.color }, curve: k.curve.slice() })) } : defaultDuotone();
    while (this.d.inks.length < 4) this.d.inks.push(defaultDuotone().inks[this.d.inks.length]);
    this.typeRow.set(this.d.type);
    this.fill();
    this.sync();
    this.open(this.okBtn);
  }

  private fill(): void {
    this.rows.forEach((r, i) => { const k = this.d.inks[i]; r.color.value = hex(k.color); r.name.value = k.name; r.curve.forEach((f, j) => { f.value = String(k.curve[j]); }); });
  }

  /** Rows past the type are disabled, never hidden, so nothing moves. */
  private sync(): void {
    const n = DUOTONE_COUNT[this.d.type];
    this.rows.forEach((r, i) => { const off = i >= n; r.color.disabled = off; r.name.disabled = off; r.reset.disabled = off; r.curve.forEach((f) => { f.disabled = off; }); r.box.style.opacity = off ? '0.5' : '1'; });
    this.draw();
  }

  private draw(): void {
    const c = this.ramp.getContext('2d');
    if (!c) return;
    const lut = duotoneLut(this.d), img = c.createImageData(256, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 256; x++) { const o = (y * 256 + x) * 4; img.data[o] = lut[x * 3]; img.data[o + 1] = lut[x * 3 + 1]; img.data[o + 2] = lut[x * 3 + 2]; img.data[o + 3] = 255; }
    c.putImageData(img, 0, 0);
  }
}
