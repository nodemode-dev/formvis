import { hexOf, type Engine, type RGB, type ToolId } from '../engine';
import { toolList } from '../extensions/registry';
import { el, q, setClass, setHtml, setTitle, setValue } from './dom';
import { icon } from './icons';

const parseHex = (v: string): RGB => ({ r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16) });

export class Rail {
  private readonly buttons = new Map<ToolId, HTMLButtonElement>();
  private readonly fg: HTMLButtonElement;
  private readonly bg: HTMLButtonElement;
  private readonly fgInput: HTMLInputElement;
  private readonly bgInput: HTMLInputElement;

  constructor(root: HTMLElement, private readonly engine: Engine) {
    const box = q(root, '.cv-rail-tools');
    for (const t of toolList()) {
      const b = el<HTMLButtonElement>('<button class="cv-tool" type="button"></button>');
      b.setAttribute('aria-label', t.label);
      setTitle(b, t.id === 'brush' ? 'Brush (B) · Eraser (E)' : `${t.label} (${t.key})`);
      b.addEventListener('click', () => { engine.setTool(t.id); if (t.id === 'brush') engine.setBrushMode('paint'); });
      box.appendChild(b);
      this.buttons.set(t.id, b);
    }
    const colors = q(root, '.cv-colors');
    colors.insertAdjacentHTML('beforeend',
      '<button class="cv-swatch cv-swatch-fg" type="button" title="Foreground color" aria-label="Foreground color"></button>' +
      '<button class="cv-swatch cv-swatch-bg" type="button" title="Background color" aria-label="Background color"></button>' +
      `<button class="cv-swap" type="button" title="Swap colors (X)" aria-label="Swap colors">${icon('refresh', 12)}</button>` +
      `<button class="cv-reset" type="button" title="Default colors (D)" aria-label="Default colors">${icon('theme', 12)}</button>` +
      '<input class="cv-color-input cv-fg-input" type="color" tabindex="-1" aria-hidden="true"><input class="cv-color-input cv-bg-input" type="color" tabindex="-1" aria-hidden="true">');
    this.fg = q<HTMLButtonElement>(colors, '.cv-swatch-fg');
    this.bg = q<HTMLButtonElement>(colors, '.cv-swatch-bg');
    this.fgInput = q<HTMLInputElement>(colors, '.cv-fg-input');
    this.bgInput = q<HTMLInputElement>(colors, '.cv-bg-input');
    this.fg.addEventListener('click', () => this.fgInput.click());
    this.bg.addEventListener('click', () => this.bgInput.click());
    this.fgInput.addEventListener('input', () => engine.setColors(parseHex(this.fgInput.value)));
    this.bgInput.addEventListener('input', () => engine.setColors(undefined, parseHex(this.bgInput.value)));
    q(colors, '.cv-swap').addEventListener('click', () => engine.swapColors());
    q(colors, '.cv-reset').addEventListener('click', () => engine.defaultColors());
    engine.on('tool', () => this.sync());
    engine.on('options', () => this.sync());
    engine.on('colors', () => this.syncColors());
    this.sync();
    this.syncColors();
  }

  private sync(): void {
    for (const t of toolList()) {
      const b = this.buttons.get(t.id);
      if (!b) continue;
      const key = t.icon(this.engine);
      setHtml(b, icon(key, 20), key);
      setClass(b, 'is-active', this.engine.tool === t.id);
    }
  }

  private syncColors(): void {
    const fg = hexOf(this.engine.fg), bg = hexOf(this.engine.bg);
    if (this.fg.style.backgroundColor !== this.fgRgb()) this.fg.style.backgroundColor = fg;
    if (this.bg.style.backgroundColor !== this.bgRgb()) this.bg.style.backgroundColor = bg;
    setValue(this.fgInput, fg);
    setValue(this.bgInput, bg);
  }

  private fgRgb(): string { const c = this.engine.fg; return `rgb(${c.r}, ${c.g}, ${c.b})`; }
  private bgRgb(): string { const c = this.engine.bg; return `rgb(${c.r}, ${c.g}, ${c.b})`; }
}
