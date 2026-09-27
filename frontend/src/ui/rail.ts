import { hexOf, type Engine, type RGB } from '../engine';
import type { Tool } from '../extensions/registry';
import { el, q, setClass, setHtml, setText, setTitle, setValue } from './dom';
import { icon } from './icons';
import { rememberTool, slotTool, toolGroups, type ToolGroup } from './tool-groups';

const parseHex = (v: string): RGB => ({ r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16) });

/** How many entries a group's flyout lists: its tools, a tool with modes counting each mode. */
function entries(group: ToolGroup): number { return group.tools.reduce((n, t) => n + Math.max(1, (ENGINE && t.variants?.(ENGINE)?.length) || 0), 0); }
let ENGINE: Engine | null = null;

export class Rail {
  /** One slot per tool group (the tools sharing a key), showing the group's current tool. */
  private readonly slots: Array<{ group: ToolGroup; node: HTMLButtonElement }> = [];
  private readonly flyout: HTMLElement;
  private flyoutFor: ToolGroup | null = null;
  private readonly fg: HTMLButtonElement;
  private readonly bg: HTMLButtonElement;
  private readonly fgInput: HTMLInputElement;
  private readonly bgInput: HTMLInputElement;

  constructor(root: HTMLElement, private readonly engine: Engine) {
    ENGINE = engine;   // variants are listed from the engine's state
    const box = q(root, '.cv-rail-tools');
    this.flyout = el('<div class="cv-flyout" role="menu" hidden></div>');
    document.getElementById('overlay-root')?.appendChild(this.flyout);
    // Short dashes between Photoshop's tool families, as the target's column (Phase 21): selection and crop, painting and
    // retouching, vector and type, then eyedropper and navigation (by the tools' order).
    const family = (order: number): number => (order <= 45 ? 0 : order <= 72 ? 1 : order <= 79 ? 2 : 3);
    let lastFamily = -1;
    for (const group of toolGroups()) {
      const fam = family(group.tools[0].order);
      if (lastFamily !== -1 && fam !== lastFamily) box.appendChild(el('<span class="cv-rail-sep" aria-hidden="true"></span>'));
      lastFamily = fam;
      const b = el<HTMLButtonElement>(`<button class="cv-tool${entries(group) > 1 ? ' has-group' : ''}" type="button" aria-haspopup="${entries(group) > 1 ? 'menu' : 'false'}"></button>`);
      const pick = (t: Tool): void => { engine.setTool(t.id); if (t.id === 'brush') engine.setBrushMode('paint'); };
      b.addEventListener('click', () => { if (!this.suppressClick) pick(slotTool(group, engine.tool)); this.suppressClick = false; });
      if (entries(group) > 1) {
        // Press and hold, or right-click, shows the group, as Photoshop's toolbar does.
        let hold = 0;
        b.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          hold = window.setTimeout(() => { this.suppressClick = true; this.openFlyout(group, b); }, 350);
        });
        for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => window.clearTimeout(hold));
        b.addEventListener('contextmenu', (e) => { e.preventDefault(); this.openFlyout(group, b); });
      }
      box.appendChild(b);
      this.slots.push({ group, node: b });
    }
    document.addEventListener('pointerdown', (e) => { if (!this.flyout.hidden && !this.flyout.contains(e.target as Node)) this.closeFlyout(); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.flyout.hidden) { e.preventDefault(); this.closeFlyout(); } }, true);
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
    this.fg.addEventListener('click', () => this.fg.dispatchEvent(new CustomEvent('cv-pick-color', { bubbles: true, detail: 'fg' })));
    this.bg.addEventListener('click', () => this.bg.dispatchEvent(new CustomEvent('cv-pick-color', { bubbles: true, detail: 'bg' })));
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

  private suppressClick = false;

  private sync(): void {
    rememberTool(this.engine);
    for (const { group, node } of this.slots) {
      const t = slotTool(group, this.engine.tool), key = t.icon(this.engine);
      setHtml(node, icon(key, 20), `${t.id}:${key}`);
      node.setAttribute('aria-label', t.label);
      setTitle(node, t.id === 'brush' ? 'Brush (B) · Eraser (E)' : entries(group) > 1 ? `${t.label} (${group.key}) · hold or right-click for ${group.tools.length} tools · Shift+${group.key} cycles` : `${t.label} (${group.key})`);
      setClass(node, 'is-active', group.tools.some((x) => x.id === this.engine.tool));
    }
  }

  /** The group's tools beside its slot, each with its key; the one chosen becomes the slot's tool. */
  private openFlyout(group: ToolGroup, slot: HTMLElement): void {
    // One entry per tool, or per mode for a tool that lists its modes (the Elliptical Marquee, the Polygonal Lasso...),
    // as Photoshop's flyouts; rebuilt as it opens, so it always shows what is in use.
    this.flyout.textContent = '';
    const add = (iconName: string, label: string, active: boolean, pick: () => void): void => {
      const row = el<HTMLButtonElement>(`<button class="cv-flyout-item" role="menuitem" type="button">${icon(iconName, 18)}<span class="cv-flyout-label"></span><span class="cv-flyout-key"></span></button>`);
      setText(q(row, '.cv-flyout-label'), label);
      setText(q(row, '.cv-flyout-key'), group.key);
      setClass(row, 'is-active', active);
      row.addEventListener('click', () => { this.closeFlyout(); pick(); });
      this.flyout.appendChild(row);
    };
    for (const t of group.tools) {
      const choose = (): void => { this.engine.setTool(t.id); if (t.id === 'brush' && !t.variants) this.engine.setBrushMode('paint'); };
      const vs = t.variants?.(this.engine);
      if (vs?.length) for (const v of vs) add(v.icon, v.label, this.engine.tool === t.id && v.active(), () => { this.engine.setTool(t.id); v.pick(); this.engine.emit('tool', null); });
      else add(t.icon(this.engine), t.label, this.engine.tool === t.id, choose);
    }
    this.flyoutFor = group;
    const r = slot.getBoundingClientRect();
    this.flyout.style.visibility = 'hidden';
    this.flyout.hidden = false;
    const h = this.flyout.offsetHeight;
    this.flyout.style.left = `${Math.round(r.right + 4)}px`;
    this.flyout.style.top = `${Math.round(Math.max(4, Math.min(r.top, window.innerHeight - h - 4)))}px`;
    this.flyout.style.visibility = '';
  }

  private closeFlyout(): void { this.flyout.hidden = true; }

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
