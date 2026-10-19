import type { Engine } from '../engine';
import { allBrushPresets, brushGroupOf } from '../engine/brush-dynamics';
import { el, setHidden, setText } from './dom';

/** The Brush Preset picker: a popup at the pointer with Size, Hardness, a search and every preset by folder, opened by
 *  a plain right-click on a painting tool when Right-click is set to Preset picker. Built once; shown and filled in place. */
export class BrushPicker {
  private readonly root = el(`<div class="cv-brush-picker" role="dialog" aria-label="Brush Preset picker" hidden>
    <label>Size <input type="range" min="1" max="500" step="1" data-k="size"><output data-o="size"></output></label>
    <label>Hardness <input type="range" min="0" max="100" step="1" data-k="hardness"><output data-o="hardness"></output></label>
    <input type="search" placeholder="Search brushes" aria-label="Search brushes" data-k="find">
    <div class="cv-bp-list"></div></div>`);
  private readonly list = this.root.querySelector('.cv-bp-list') as HTMLElement;
  private readonly find = this.root.querySelector('[data-k="find"]') as HTMLInputElement;
  private readonly size = this.root.querySelector('[data-k="size"]') as HTMLInputElement;
  private readonly hard = this.root.querySelector('[data-k="hardness"]') as HTMLInputElement;

  constructor(private readonly engine: Engine) {
    document.body.appendChild(this.root);
    this.size.addEventListener('input', () => { engine.setBrush({ diameter: Number(this.size.value) }); this.sync(); });
    this.hard.addEventListener('input', () => { engine.setBrush({ hardness: Number(this.hard.value) / 100 }); this.sync(); });
    this.find.addEventListener('input', () => this.fill());
    document.addEventListener('pointerdown', (e) => { if (this.isOpen && !this.root.contains(e.target as Node)) this.close(); }, true);
    document.addEventListener('keydown', (e) => { if (this.isOpen && e.key === 'Escape') this.close(); });
  }

  get isOpen(): boolean { return !this.root.hidden; }
  close(): void { setHidden(this.root, true); }

  show(x: number, y: number): void {
    this.find.value = '';
    this.fill();
    this.sync();
    setHidden(this.root, false);
    const r = this.root.getBoundingClientRect();
    this.root.style.left = `${Math.max(4, Math.min(x, window.innerWidth - r.width - 4))}px`;
    this.root.style.top = `${Math.max(4, Math.min(y, window.innerHeight - r.height - 4))}px`;
    this.find.focus();
  }

  private sync(): void {
    const b = this.engine.brush;
    this.size.value = String(Math.min(500, b.diameter));
    this.hard.value = String(Math.round(b.hardness * 100));
    setText(this.root.querySelector('[data-o="size"]') as HTMLElement, `${b.diameter} px`);
    setText(this.root.querySelector('[data-o="hardness"]') as HTMLElement, `${Math.round(b.hardness * 100)}%`);
  }

  private fill(): void {
    const q = this.find.value.trim().toLowerCase();
    this.list.textContent = '';
    const order: string[] = [];
    for (const p of allBrushPresets()) if (!order.includes(brushGroupOf(p))) order.push(brushGroupOf(p));
    const sorted = [...allBrushPresets()].sort((a, b) => order.indexOf(brushGroupOf(a)) - order.indexOf(brushGroupOf(b)));
    let group = '';
    for (const p of sorted) {
      if (q && !p.name.toLowerCase().includes(q)) continue;
      const g = brushGroupOf(p);
      if (g !== group) { group = g; const h = el('<div class="cv-bp-group"></div>'); setText(h, g); this.list.appendChild(h); }
      const b = el<HTMLButtonElement>('<button type="button" class="cv-bp-item"><span></span><em></em></button>');
      setText(b.querySelector('span') as HTMLElement, p.name);
      setText(b.querySelector('em') as HTMLElement, `${p.diameter} px`);
      b.classList.toggle('is-on', this.engine.brushPresetId === p.id);
      b.addEventListener('click', () => { this.engine.applyBrushPreset(p); this.close(); });
      this.list.appendChild(b);
    }
  }
}
