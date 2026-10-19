import { hexOf, type Engine, type RGB } from '../engine';
import type { Tool } from '../extensions/registry';
import { el, q, setClass, setHidden, setHtml, setText, setTitle, setValue } from './dom';
import { icon } from './icons';
import { onLanguage, t as tr } from './i18n';
import { rememberTool, resolveLayout, slotTool, TOOLBAR_EVENT, type ToolGroup } from './tool-groups';
import { loadPrefs } from './prefs';
import { openToolbarDialog } from './panels/toolbar-dialog';

/** One place on the rail: its dash, its button, and the group it shows now. */
interface RailSlot { group: ToolGroup; node: HTMLButtonElement; sep: HTMLElement }

/** Turns a '#rrggbb' string into its red, green and blue channels. */
function parseHex(v: string): RGB { return { r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16) }; }

/** How many entries a group's flyout lists: its tools, a tool with modes counting each mode. */
function entries(group: ToolGroup): number { return group.tools.reduce((n, t) => n + Math.max(1, (ENGINE && t.variants?.(ENGINE)?.length) || 0), 0); }
let ENGINE: Engine | null = null;

export class Rail {
  /** One slot per tool group (the tools sharing a key), showing the group's current tool. */
  private readonly slots: RailSlot[] = [];
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
    // Edit > Toolbar (the target's •••): tools can be kept in Extra Tools and stay one click away in this button's list.
    const more = el<HTMLButtonElement>(`<button class="cv-tool cv-rail-more" type="button" title="More tools and Edit Toolbar" aria-label="More tools">${icon('more3', 18)}</button>`);
    more.addEventListener('click', () => this.openMore(more));
    box.appendChild(more);
    this.box = box;
    this.more = more;
    this.applyLayout();
    document.addEventListener(TOOLBAR_EVENT, () => { this.applyLayout(); this.sync(); });
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
  private more: HTMLElement | null = null;
  /** The tools kept in Extra Tools, reachable from the ••• list. */
  private extra: Tool[] = [];

  /** One more slot (its dash and its button), placed before the ••• button. The group it shows is set by `applyLayout`. */
  private makeSlot(): RailSlot {
    const node = el<HTMLButtonElement>('<button class="cv-tool cv-rail-slot" type="button" aria-haspopup="false"></button>');
    const sep = el('<span class="cv-rail-sep" aria-hidden="true" hidden></span>');
    const slot: RailSlot = { group: { key: '', tools: [] }, node, sep };
    const engine = this.engine;
    node.addEventListener('click', () => {
      if (!this.suppressClick && slot.group.tools.length) { const t = slotTool(slot.group, engine.tool); engine.setTool(t.id); if (t.id === 'brush') engine.setBrushMode('paint'); }
      this.suppressClick = false;
    });
    // Press and hold, or right-click, shows the group.
    let hold = 0;
    node.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || entries(slot.group) < 2) return;
      hold = window.setTimeout(() => { this.suppressClick = true; this.openFlyout(slot.group, node); }, 350);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) node.addEventListener(ev, () => window.clearTimeout(hold));
    node.addEventListener('contextmenu', (e) => { if (entries(slot.group) < 2) return; e.preventDefault(); this.openFlyout(slot.group, node); });
    this.box?.insertBefore(sep, this.more);
    this.box?.insertBefore(node, this.more);
    return slot;
  }

  /** One button per tool, shown instead of the slots when the rail is expanded; built once, then moved and updated in place. */
  private readonly all = new Map<string, { tool: Tool; node: HTMLButtonElement }>();

  private makeAll(tool: Tool): { tool: Tool; node: HTMLButtonElement } {
    const node = el<HTMLButtonElement>('<button class="cv-tool cv-rail-all" type="button" aria-haspopup="false"></button>');
    const engine = this.engine;
    node.addEventListener('click', () => {
      if (!this.suppressClick) { engine.setTool(tool.id); if (tool.id === 'brush' && !tool.variants) engine.setBrushMode('paint'); }
      this.suppressClick = false;
    });
    const modes = (): boolean => entries({ key: tool.group ?? tool.key, tools: [tool] }) > 1;
    let hold = 0;
    node.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !modes()) return;
      hold = window.setTimeout(() => { this.suppressClick = true; this.openFlyout({ key: tool.group ?? tool.key, tools: [tool] }, node); }, 350);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) node.addEventListener(ev, () => window.clearTimeout(hold));
    node.addEventListener('contextmenu', (e) => { if (!modes()) return; e.preventDefault(); this.openFlyout({ key: tool.group ?? tool.key, tools: [tool] }, node); });
    const made = { tool, node };
    this.all.set(tool.id, made);
    return made;
  }

  /** Puts the saved layout on the rail in place: the slots (kept, never rebuilt) take the groups in order, surplus slots are
   *  hidden, and a short dash sits between tool families (selection and crop, painting and retouching, vector and type, then
   *  eyedropper and navigation, by the tools' order). */
  private applyLayout(): void {
    const layout = resolveLayout(loadPrefs().toolbar);
    this.extra = layout.hidden;
    while (this.slots.length < layout.groups.length) this.slots.push(this.makeSlot());
    const family = (order: number): number => (order <= 45 ? 0 : order <= 72 ? 1 : order <= 79 ? 2 : 3);
    let lastFamily = -1;
    const used = new Set<string>();
    this.slots.forEach((slot, i) => {
      const group = layout.groups[i];
      if (!group) { setHidden(slot.node, true); setHidden(slot.sep, true); return; }
      slot.group = group;
      let prev: Node = slot.node;
      for (const t of group.tools) {
        const made = this.all.get(t.id) ?? this.makeAll(t);
        if (prev.nextSibling !== made.node) this.box?.insertBefore(made.node, prev.nextSibling);
        prev = made.node;
        used.add(t.id);
        setClass(made.node, 'has-group', entries({ key: group.key, tools: [t] }) > 1);
        made.node.setAttribute('aria-haspopup', entries({ key: group.key, tools: [t] }) > 1 ? 'menu' : 'false');
      }
      const fam = family(group.tools[0].order), multi = entries(group) > 1;
      setHidden(slot.sep, lastFamily === -1 || fam === lastFamily);
      lastFamily = fam;
      setHidden(slot.node, false);
      setClass(slot.node, 'has-group', multi);
      slot.node.setAttribute('aria-haspopup', multi ? 'menu' : 'false');
    });
    for (const [id, made] of this.all) setHidden(made.node, !used.has(id));
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
    for (const t of this.extra) {
      const vs = t.variants?.(this.engine);
      if (vs?.length) for (const v of vs) row(v.icon, v.label, t.key, () => { this.engine.setTool(t.id); v.pick(); this.engine.emit('tool', null); });
      else row(t.icon(this.engine), t.label, t.key, () => this.engine.setTool(t.id));
    }
    if (this.flyout.childElementCount) this.flyout.appendChild(el('<div class="cv-menu-sep"></div>'));
    row('sliders', 'Toolbar...', '', () => openToolbarDialog(this.engine));
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
      if (node.hidden || !group.tools.length) continue;
      const t = slotTool(group, this.engine.tool), key = t.icon(this.engine);
      setHtml(node, icon(key, 20), `${t.id}:${key}`);
      node.setAttribute('aria-label', tr(t.label));
      const own = t.key ? ` (${t.key})` : '';   // each tool its own key (Rotate View's R in the Hand's slot; Smear has none)
      setTitle(node, entries(group) > 1 ? `${tr(t.label)}${own} · ${tr('hold or right-click for more tools')}${group.key ? ` · Shift+${group.key} ${tr('cycles')}` : ''}` : `${tr(t.label)}${own}`);
      setClass(node, 'is-active', group.tools.some((x) => x.id === this.engine.tool));
    }
    for (const { tool, node } of this.all.values()) {
      if (node.hidden) continue;
      const key = tool.icon(this.engine), own = tool.key ? ` (${tool.key})` : '';
      setHtml(node, icon(key, 20), `${tool.id}:${key}`);
      node.setAttribute('aria-label', tr(tool.label));
      setTitle(node, `${tr(tool.label)}${own}`);
      setClass(node, 'is-active', tool.id === this.engine.tool);
    }
  }

  /** The group's tools beside its slot, each with its key; the one chosen becomes the slot's tool. */
  private openFlyout(group: ToolGroup, slot: HTMLElement): void {
    // One entry per tool, or per mode for a tool that lists its modes (the Elliptical Marquee, the Polygonal Lasso...),
    // as a flyout; rebuilt as it opens, so it always shows what is in use.
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
