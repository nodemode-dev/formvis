import { hexOf, type Engine, type RGB } from '../engine';
import type { Tool } from '../extensions/registry';
import { el, q, setClass, setHidden, setHtml, setText, setTitle, setValue } from './dom';
import { Dialog } from './dialogs';
import { icon } from './icons';
import { onLanguage, t as tr } from './i18n';
import { rememberTool, slotTool, toolGroups, type ToolGroup } from './tool-groups';

/** Turns a '#rrggbb' string into its red, green and blue channels. */
function parseHex(v: string): RGB { return { r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16) }; }

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
    // Edit Toolbar (the target's •••): tools can be hidden from the rail and stay one click away in this button's list.
    const more = el<HTMLButtonElement>(`<button class="cv-tool cv-rail-more" type="button" title="More tools and Edit Toolbar" aria-label="More tools">${icon('more3', 18)}</button>`);
    more.addEventListener('click', () => this.openMore(more));
    box.appendChild(more);
    this.box = box;
    this.applyHidden();
    document.addEventListener('pointerdown', (e) => { if (!this.flyout.hidden && !this.flyout.contains(e.target as Node)) this.closeFlyout(); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.flyout.hidden) { e.preventDefault(); this.closeFlyout(); } }, true);
    // The colour well: foreground and background swatches, swap and reset, and two hidden native colour inputs.
    const well = q(root, '.cv-colors');
    well.insertAdjacentHTML('beforeend',
      '<button class="cv-swatch cv-swatch-fg" type="button" title="Foreground color" aria-label="Foreground color"></button>'
      + '<button class="cv-swatch cv-swatch-bg" type="button" title="Background color" aria-label="Background color"></button>'
      + `<button class="cv-swap" type="button" title="Swap colors (X)" aria-label="Swap colors">${icon('refresh', 12)}</button>`
      + `<button class="cv-reset" type="button" title="Default colors (D)" aria-label="Default colors">${icon('theme', 12)}</button>`
      + '<input class="cv-color-input cv-fg-input" type="color" tabindex="-1" aria-hidden="true">'
      + '<input class="cv-color-input cv-bg-input" type="color" tabindex="-1" aria-hidden="true">');
    this.fg = q<HTMLButtonElement>(well, '.cv-swatch-fg');
    this.bg = q<HTMLButtonElement>(well, '.cv-swatch-bg');
    this.fgInput = q<HTMLInputElement>(well, '.cv-fg-input');
    this.bgInput = q<HTMLInputElement>(well, '.cv-bg-input');
    for (const [sw, which] of [[this.fg, 'fg'], [this.bg, 'bg']] as const) {
      sw.addEventListener('click', () => sw.dispatchEvent(new CustomEvent('cv-pick-color', { bubbles: true, detail: which })));
    }
    this.fgInput.addEventListener('input', () => engine.setColors(parseHex(this.fgInput.value)));
    this.bgInput.addEventListener('input', () => engine.setColors(undefined, parseHex(this.bgInput.value)));
    q(well, '.cv-swap').addEventListener('click', () => engine.swapColors());
    q(well, '.cv-reset').addEventListener('click', () => engine.defaultColors());
    onLanguage(() => this.sync());
    engine.on('tool', () => this.sync());
    engine.on('options', () => this.sync());
    engine.on('colors', () => this.syncColors());
    this.sync();
    this.syncColors();
  }

  private suppressClick = false;

  private box: HTMLElement | null = null;
  private hidden = new Set<string>((() => { try { const v = JSON.parse(localStorage.getItem('formvis.railHidden') ?? '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; } })());
  private editor: EditToolbar | null = null;

  /** Hidden groups leave the rail; a dash shows only between two shown tools, never leading, trailing or doubled. */
  private applyHidden(): void {
    for (const { group, node } of this.slots) setHidden(node, this.hidden.has(group.key));
    let prevTool = false, pendingSep: HTMLElement | null = null;
    for (const child of Array.from(this.box?.children ?? []) as HTMLElement[]) {
      if (child.classList.contains('cv-rail-sep')) { setHidden(child, true); if (prevTool) pendingSep = child; prevTool = false; continue; }
      if (child.classList.contains('cv-rail-more') || child.hidden) continue;
      if (pendingSep) { setHidden(pendingSep, false); pendingSep = null; }
      prevTool = true;
    }
  }

  setHiddenGroups(keys: Iterable<string>): void {
    this.hidden = new Set(keys);
    try { localStorage.setItem('formvis.railHidden', JSON.stringify([...this.hidden])); } catch { /* this session only */ }
    this.applyHidden();
  }

  /** The ••• list: the hidden tools (their modes too), then Edit Toolbar. */
  private openMore(anchor: HTMLElement): void {
    this.flyout.textContent = '';
    const row = (iconName: string, label: string, key: string, pick: () => void): void => {
      const r = el<HTMLButtonElement>(`<button class="cv-flyout-item" role="menuitem" type="button">${icon(iconName, 18)}<span class="cv-flyout-label"></span><span class="cv-flyout-key"></span></button>`);
      setText(q(r, '.cv-flyout-label'), tr(label));
      setText(q(r, '.cv-flyout-key'), key);
      r.addEventListener('click', () => { this.closeFlyout(); pick(); });
      this.flyout.appendChild(r);
    };
    for (const { group } of this.slots.filter((s) => this.hidden.has(s.group.key))) {
      for (const t of group.tools) {
        const vs = t.variants?.(this.engine);
        if (vs?.length) for (const v of vs) row(v.icon, v.label, group.key, () => { this.engine.setTool(t.id); v.pick(); this.engine.emit('tool', null); });
        else row(t.icon(this.engine), t.label, group.key, () => this.engine.setTool(t.id));
      }
    }
    if (this.flyout.childElementCount) this.flyout.appendChild(el('<div class="cv-menu-sep"></div>'));
    row('sliders', 'Edit Toolbar...', '', () => { this.editor ??= new EditToolbar(); this.editor.show(this.slots.map((s) => s.group), this.hidden, (keys) => this.setHiddenGroups(keys)); });
    this.flyoutFor = null;
    const r = anchor.getBoundingClientRect();
    this.flyout.style.visibility = 'hidden';
    this.flyout.hidden = false;
    const h = this.flyout.offsetHeight;
    this.flyout.style.left = `${Math.round(r.right + 4)}px`;
    this.flyout.style.top = `${Math.round(Math.max(4, Math.min(r.top, window.innerHeight - h - 4)))}px`;
    this.flyout.style.visibility = '';
  }

  private sync(): void {
    rememberTool(this.engine);
    for (const { group, node } of this.slots) {
      const t = slotTool(group, this.engine.tool), key = t.icon(this.engine);
      setHtml(node, icon(key, 20), `${t.id}:${key}`);
      node.setAttribute('aria-label', tr(t.label));
      const own = t.key ? ` (${t.key})` : '';   // each tool its own key (Rotate View's R in the Hand's slot; Smear has none)
      setTitle(node, entries(group) > 1 ? `${tr(t.label)}${own} · ${tr('hold or right-click for more tools')}${group.key ? ` · Shift+${group.key} ${tr('cycles')}` : ''}` : `${tr(t.label)}${own}`);
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
      setText(q(row, '.cv-flyout-label'), tr(label));
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

  /** Repaints both swatches and the hidden inputs from the engine's colours. */
  private syncColors(): void {
    const e = this.engine;
    const pairs: Array<[HTMLButtonElement, HTMLInputElement, RGB, string]> = [[this.fg, this.fgInput, e.fg, this.fgRgb()], [this.bg, this.bgInput, e.bg, this.bgRgb()]];
    for (const [sw, inp, c, rgb] of pairs) {
      if (sw.style.backgroundColor !== rgb) sw.style.backgroundColor = hexOf(c);
      setValue(inp, hexOf(c));
    }
  }

  private fgRgb(): string { const c = this.engine.fg; return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`; }
  private bgRgb(): string { const c = this.engine.bg; return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`; }
}

/** Edit Toolbar, as Photoshop's: which tool groups the rail shows; hidden ones stay in its ••• list. */
class EditToolbar extends Dialog {
  private readonly list = el('<div class="cv-edit-toolbar"></div>');
  private onChange: ((keys: Set<string>) => void) | null = null;
  constructor() {
    super('Edit Toolbar', 420);
    this.body.append(el('<p class="cv-note">Tools you hide stay one click away in the toolbar\'s ••• list.</p>'), this.list);
    this.button('Done', 'primary', () => this.close());
  }
  show(groups: ToolGroup[], hidden: Set<string>, onChange: (keys: Set<string>) => void): void {
    this.onChange = onChange;
    this.list.textContent = '';
    const now = new Set(hidden);
    for (const g of groups) {
      const r = el(`<label class="cv-edit-tool"><input type="checkbox"><span class="cv-edit-tool-name"></span><span class="cv-flyout-key"></span></label>`);
      const box = r.querySelector('input') as HTMLInputElement;
      box.checked = !now.has(g.key);
      setText(r.querySelector('.cv-edit-tool-name') as HTMLElement, g.tools.map((t) => t.label).join(', '));
      setText(r.querySelector('.cv-flyout-key') as HTMLElement, g.key);
      box.addEventListener('change', () => { if (box.checked) now.delete(g.key); else now.add(g.key); this.onChange?.(new Set(now)); });
      this.list.appendChild(r);
    }
    this.open();
  }
}
