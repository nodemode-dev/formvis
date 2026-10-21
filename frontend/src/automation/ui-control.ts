import type { Engine } from '../engine';
import type { Commands } from '../ui/commands';
import { trimMenu, type MenuDef, type MenuItem } from '../ui/menu';
import { getTool, toolList } from '../extensions/registry';
import type { McpResult } from './agent-bridge';

/** The window's own controls for outside agents: its state, a picture of a part of it, the menus by path, named
 *  settings, open dialogs, synthetic pointer and key input, and the window itself. Everything goes through the
 *  elements and commands a person uses. */
export interface UiEnv {
  engine: Engine; commands: Commands;
  menus(): MenuDef[];
  capture(): HTMLCanvasElement | null;
  docPoint(clientX: number, clientY: number): { x: number; y: number } | null;
}

const text = (t: string, data?: Record<string, unknown>): McpResult => ({ content: [{ type: 'text', text: t }], ...(data ? { structuredContent: data } : {}) });
const fail = (t: string): McpResult => ({ content: [{ type: 'text', text: t }], isError: true });
const sleep = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms));
const clean = (s: string | null | undefined, n = 80): string => (s ?? '').trim().replace(/\s+/g, ' ').slice(0, n);
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const SYNTHETIC_PEN = 4242;

interface MenuNode { label: string; id?: string; enabled?: boolean; checked?: boolean; keys?: string; items?: MenuNode[]; count?: number }

export class UiControl {
  constructor(private readonly env: UiEnv) {}

  private dialogs(): HTMLElement[] { return Array.from(document.querySelectorAll<HTMLElement>('.cv-scrim:not([hidden])')); }

  private async fps(): Promise<number> {
    let n = 0;
    const t0 = performance.now();
    await new Promise<void>((done) => { const tick = (): void => { n++; if (performance.now() - t0 >= 300) done(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    return Math.round((n * 1000) / (performance.now() - t0));
  }

  async state(): Promise<McpResult> {
    const e = this.env.engine, p = e.current, v = p?.viewport, stage = document.querySelector('.cv-stage')?.getBoundingClientRect();
    const panels = this.env.commands.get('toggle-panels'), full = this.env.commands.get('os-full-screen');
    const data = {
      tool: e.tool, document: p ? { id: p.id, name: p.name, width: p.doc.width, height: p.doc.height, activeLayerId: p.activeId, maskTarget: !!p.maskTarget } : null,
      view: v ? { zoom: v.zoom, rotation: v.rotation, fitted: v.fitted, centre: this.env.docPoint((stage?.left ?? 0) + (stage?.width ?? 0) / 2, (stage?.top ?? 0) + (stage?.height ?? 0) / 2) } : null,
      foreground: this.hex(e.fg), background: this.hex(e.bg),
      window: { width: window.innerWidth, height: window.innerHeight, pixelRatio: window.devicePixelRatio, stage: stage ? { width: Math.round(stage.width), height: Math.round(stage.height) } : null, focused: document.hasFocus(), fullscreen: full?.checked?.() ?? !!document.fullscreenElement },
      theme: document.body.classList.contains('theme-light') ? 'light' : 'dark', panelsShown: panels?.checked ? panels.checked() : true,
      dialogs: this.dialogs().map((d) => clean(d.querySelector('.cv-dialog-title')?.textContent)), menuOpen: !!document.querySelector('.cv-menu-btn.is-open'),
      busy: e.busyWith, fps: await this.fps(),
    };
    return text(JSON.stringify(data), data);
  }

  private hex(c: { r: number; g: number; b: number }): string { return `#${[c.r, c.g, c.b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`; }

  /** A picture of the stage canvas, or of the part of the window a selector names, drawn from a copy of its elements. */
  async screenshot(selector: string, maxSize: number, jpeg: boolean, quality: number): Promise<McpResult> {
    let src: CanvasImageSource, w: number, h: number, what: string;
    if (!selector) {
      const c = this.env.capture();
      if (!c) return fail('The canvas cannot be captured now: no document is open. Open one, or give a selector for a part of the window.');
      [src, w, h, what] = [c, c.width, c.height, 'the canvas'];
    } else {
      let node: Element | null;
      try { node = document.querySelector(selector); } catch { return fail('selector is not a valid CSS selector.'); }
      if (!node) return fail(`Nothing matches ${selector}: ui_inspect finds elements by selector.`);
      const r = node.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return fail(`${selector} is not visible, so there is nothing to draw.`);
      const shot = await this.drawElement(node as HTMLElement, r.width, r.height);
      if (!shot) return fail(`${selector} could not be drawn: the window refused to render it.`);
      [src, w, h, what] = [shot, shot.width, shot.height, selector];
    }
    const k = Math.min(1, maxSize / Math.max(w, h)), out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(w * k)); out.height = Math.max(1, Math.round(h * k));
    const g = out.getContext('2d');
    if (!g) return fail('A canvas cannot be made here.');
    if (jpeg) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, out.width, out.height); }
    g.drawImage(src, 0, 0, w, h, 0, 0, out.width, out.height);
    const blob = await new Promise<Blob | null>((ok) => out.toBlob(ok, jpeg ? 'image/jpeg' : 'image/png', jpeg ? quality : undefined));
    if (!blob) return fail('The picture could not be encoded.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { content: [{ type: 'image', data: btoa(s), mimeType: jpeg ? 'image/jpeg' : 'image/png' }, { type: 'text', text: `${what}, ${w} by ${h}, shown at ${out.width} by ${out.height}.` }] };
  }

  private async drawElement(node: HTMLElement, w: number, h: number): Promise<HTMLCanvasElement | null> {
    const budget = { n: 0 };
    const copy = (from: Element): Element => {
      const to = from.cloneNode(false) as Element;
      if (++budget.n > 4000) return to;
      if (from instanceof HTMLCanvasElement) {
        const img = document.createElement('img');
        try { img.src = from.toDataURL(); } catch { /* a tainted canvas stays blank */ }
        img.width = from.clientWidth; img.height = from.clientHeight;
        img.setAttribute('style', `width:${from.clientWidth}px;height:${from.clientHeight}px;position:${getComputedStyle(from).position};left:${getComputedStyle(from).left};top:${getComputedStyle(from).top}`);
        return img;
      }
      const cs = getComputedStyle(from), css = Array.from(cs).map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';');
      (to as HTMLElement).setAttribute('style', css);
      if (from instanceof HTMLInputElement || from instanceof HTMLTextAreaElement) to.setAttribute('value', from.value);
      for (const c of Array.from(from.childNodes)) to.appendChild(c.nodeType === 1 ? copy(c as Element) : c.cloneNode(true));
      return to;
    };
    const holder = copy(node);
    (holder as HTMLElement).style.margin = '0';
    const xml = new XMLSerializer().serializeToString(holder);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w)}" height="${Math.ceil(h)}"><foreignObject x="0" y="0" width="100%" height="100%">${xml}</foreignObject></svg>`;
    const img = new Image();
    const loaded = new Promise<boolean>((ok) => { img.onload = () => ok(true); img.onerror = () => ok(false); });
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    if (!(await loaded)) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1), c = document.createElement('canvas');
    c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
    const g = c.getContext('2d');
    if (!g) return null;
    g.scale(dpr, dpr);
    g.drawImage(img, 0, 0);
    try { g.getImageData(0, 0, 1, 1); } catch { return null; }
    return c;
  }

  private nodes(items: MenuItem[], depth: number): MenuNode[] {
    const out: MenuNode[] = [];
    for (const i of trimMenu(items)) {
      if (i === '-') continue;
      if (typeof i === 'object') { out.push(depth > 1 ? { label: i.label, items: this.nodes(i.items, depth - 1) } : { label: i.label, count: i.items.filter((x) => x !== '-').length }); continue; }
      const cmd = this.env.commands.get(i);
      if (!cmd) continue;
      out.push({ id: i, label: this.env.commands.label(cmd), enabled: this.env.commands.enabled(cmd), ...(cmd.checked ? { checked: cmd.checked() } : {}), ...(cmd.keys?.length ? { keys: cmd.keys[0] } : {}) });
    }
    return out;
  }

  private menuItems(def: MenuDef): MenuItem[] { return typeof def.items === 'function' ? def.items() : def.items; }

  /** Each command id in the menu bar with its path ("Filter > Blur > Gaussian Blur"); the first place a command appears. */
  menuPaths(): Map<string, string> {
    const out = new Map<string, string>();
    const walk = (items: MenuItem[], trail: string[]): void => {
      for (const i of trimMenu(items)) {
        if (i === '-') continue;
        if (typeof i === 'object') { walk(i.items, [...trail, i.label]); continue; }
        const cmd = this.env.commands.get(i);
        if (!out.has(i)) out.set(i, [...trail, cmd ? this.env.commands.label(cmd) : i].join(' > '));
      }
    };
    for (const m of this.env.menus()) walk(this.menuItems(m), [m.label]);
    return out;
  }

  /** The items a path names ("Filter > Blur"): the menu's, or a submenu's; null when a step has no match. */
  private level(path: string[]): MenuItem[] | null {
    const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
    if (!path.length) return this.env.menus().map((m) => ({ label: m.label, items: this.menuItems(m) }));
    const top = this.env.menus().find((m) => same(m.label, path[0]));
    let items = top ? this.menuItems(top) : null;
    for (const step of path.slice(1)) {
      const sub = (items ?? []).find((i): i is Exclude<MenuItem, string> => typeof i === 'object' && same(i.label, step));
      items = sub ? sub.items : null;
      if (!items) return null;
    }
    return items;
  }

  menuList(path: string, depth: number): McpResult {
    const steps = path.split('>').map((s) => s.trim()).filter(Boolean), items = this.level(steps);
    if (!items) return fail(`No menu is at ${path}. Call ui_menu_list with no path for the menus, and use the labels it shows, joined with " > ".`);
    const tree = this.nodes(items, depth);
    return text(`${path || 'Menus'}: ${JSON.stringify(tree)}`, { path: steps, items: tree });
  }

  /** The command id a menu path names, or why not. */
  menuId(path: string): { id?: string; error?: string } {
    const steps = path.split('>').map((s) => s.trim()).filter(Boolean);
    if (steps.length < 2) return { error: `${path} is a menu, not an item: give the whole path such as "Edit > Undo".` };
    const items = this.level(steps.slice(0, -1));
    if (!items) return { error: `No menu is at ${steps.slice(0, -1).join(' > ')}. ui_menu_list shows the menus and their labels.` };
    const plain = (s: string): string => s.trim().toLowerCase().replace(/(\.{3}|…)$/, '').trim(), want = plain(steps[steps.length - 1]);
    for (const i of trimMenu(items)) {
      if (typeof i !== 'string' || i === '-') continue;
      const cmd = this.env.commands.get(i);
      if (cmd && (plain(this.env.commands.label(cmd)) === want || i.toLowerCase() === want)) return { id: i };
    }
    return { error: `${steps[steps.length - 1]} is not an item of ${steps.slice(0, -1).join(' > ')}. ui_menu_list with that path shows its items.` };
  }

  async menuInvoke(path: string, params: Record<string, unknown> | undefined): Promise<McpResult> {
    const hit = this.menuId(path);
    if (!hit.id) return fail(hit.error ?? 'No such menu item.');
    const cmd = this.env.commands.get(hit.id);
    if (!cmd) return fail(`${path} is not available now.`);
    if (!this.env.commands.enabled(cmd)) return fail(`${path} is turned off now${this.env.commands.why(cmd) ? `: ${this.env.commands.why(cmd)}` : ' (it needs an open document, a selection or another kind of layer)'}. ui_state shows what is open.`);
    const r = await this.env.commands.call(hit.id, params);
    for (let i = 0; i < 2400 && this.env.engine.busyWith; i++) await sleep(25);
    const shown = this.dialogs().map((d) => clean(d.querySelector('.cv-dialog-title')?.textContent));
    return r.ran ? text(`Ran ${path} (${hit.id}).${shown.length ? ` A dialog is open: ${shown.join(', ')}. ui_dialog lists its fields and answers it.` : ''}`, { id: hit.id, dialogs: shown })
      : fail(`${path} did not run.`);
  }

  async set(a: Record<string, unknown>): Promise<McpResult> {
    const e = this.env.engine, known = ['tool', 'zoom', 'centre', 'rotation', 'theme', 'panels', 'foreground', 'background', 'mask_target', 'eyedropper', 'crop_overlay', 'dock_layout'];
    const bad = Object.keys(a).filter((k) => !known.includes(k));
    if (bad.length) return fail(`ui_set has no field ${bad.join(', ')}: use ${known.join(', ')}.`);
    if (!known.some((k) => a[k] !== undefined)) return fail(`Give at least one of ${known.join(', ')}.`);
    const done: string[] = [];
    if (typeof a.tool === 'string') {
      if (!getTool(a.tool as never)) return fail(`No tool has the id ${a.tool}: use one of ${toolList().map((t) => t.id).join(', ')}.`);
      e.setTool(a.tool as never); done.push(`tool ${a.tool}`);
    }
    const v = e.current?.viewport;
    if (typeof a.zoom === 'number' || a.centre || typeof a.rotation === 'number') {
      if (!v) return fail('No document is open, so there is no view to set: call new_document or open_file first.');
      if (typeof a.zoom === 'number') { e.zoomTo(a.zoom); done.push(`zoom ${Math.round(v.zoom * 1000) / 10}%`); }
      if (typeof a.rotation === 'number') { e.setViewRotation(a.rotation); done.push(`rotation ${a.rotation}`); }
      if (a.centre && typeof a.centre === 'object') {
        const c = a.centre as { x?: unknown; y?: unknown };
        if (typeof c.x !== 'number' || typeof c.y !== 'number') return fail('centre is {x, y} in document pixels.');
        e.pan(v.centerX - (c.x * v.zoom + v.panX), v.height / 2 - (c.y * v.zoom + v.panY)); done.push(`centre ${c.x}, ${c.y}`);
      }
    }
    if (typeof a.theme === 'string') {
      const id = `theme-${a.theme}`;
      if (!this.env.commands.get(id)) return fail(`No theme is named ${a.theme}: use one of ${this.env.commands.all().filter((c) => /^theme-/.test(c.id) && c.id !== 'theme-sync-system').map((c) => c.id.slice(6)).join(', ')}.`);
      await this.env.commands.call(id); done.push(`theme ${a.theme}`);
    }
    if (typeof a.panels === 'boolean') {
      const c = this.env.commands.get('toggle-panels');
      if (c?.checked && c.checked() !== a.panels) await this.env.commands.call('toggle-panels');
      done.push(a.panels ? 'panels shown' : 'panels hidden');
    }
    for (const [key, set] of [['foreground', (c: { r: number; g: number; b: number }) => { e.fg = c; }], ['background', (c: { r: number; g: number; b: number }) => { e.bg = c; }]] as const) {
      if (typeof a[key] !== 'string') continue;
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(a[key] as string);
      if (!m) return fail(`${key} is a color such as #ff8800.`);
      set({ r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }); done.push(`${key} ${a[key]}`);
    }
    if (typeof a.mask_target === 'boolean') {
      if (!e.current?.activeLayer?.mask && a.mask_target) return fail('The active layer has no mask to edit: set_mask adds one first.');
      e.setMaskTarget(a.mask_target); done.push(a.mask_target ? 'editing the mask' : 'editing the layer');
    }
    if (a.eyedropper && typeof a.eyedropper === 'object') {
      const o = a.eyedropper as { size?: unknown; sample?: unknown; ring?: unknown };
      if (typeof o.size === 'number') { e.eyedropperSize = Math.max(1, Math.min(101, Math.round(o.size))); done.push(`eyedropper size ${e.eyedropperSize}`); }
      if (typeof o.sample === 'string') {
        if (!['current', 'below', 'all', 'below-flat', 'all-flat'].includes(o.sample)) return fail(`eyedropper.sample is current, below, all, below-flat or all-flat, not ${o.sample}.`);
        e.eyedropperSample = o.sample as typeof e.eyedropperSample; done.push(`eyedropper sample ${o.sample}`);
      }
      if (typeof o.ring === 'boolean') { e.showsSampleRing = o.ring; done.push(`sample ring ${o.ring ? 'on' : 'off'}`); }
      e.emit('options', null);
    }
    if (a.crop_overlay && typeof a.crop_overlay === 'object') {
      const o = a.crop_overlay as { kind?: unknown; show?: unknown }, items = (getTool('crop')?.options?.(e) ?? []) as Array<{ label?: string; set?: (v: string) => void }>;
      for (const [field, label] of [['kind', 'Overlay'], ['show', 'Show overlay']] as const) {
        const v = o[field], item = items.find((x) => x.label === label);
        if (typeof v !== 'string') continue;
        if (!item?.set) return fail('The Crop tool\'s overlay settings are not available in this window.');
        item.set(v); done.push(`crop overlay ${field} ${v}`);
      }
    }
    if (typeof a.dock_layout === 'string') {
      const box = document.querySelector<HTMLSelectElement>('.cv-tt-select'), want = a.dock_layout.trim().toLowerCase();
      const hit = box ? Array.from(box.options).find((o) => o.value.toLowerCase() === want || (o.textContent ?? '').trim().toLowerCase() === want) : undefined;
      if (!box || !hit) return fail(`No workspace is named ${a.dock_layout}: use one of ${box ? Array.from(box.options).map((o) => o.value).join(', ') : 'none (the title bar is not shown)'}.`);
      if (box.value !== hit.value) { box.value = hit.value; box.dispatchEvent(new Event('change')); }
      done.push(`dock layout ${hit.value}`);
    }
    return text(`Set ${done.join(', ')}.`, { set: done });
  }

  private fieldsOf(d: HTMLElement): Array<{ key: string; el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement; info: Record<string, unknown> }> {
    const used = new Map<string, number>(), out: Array<{ key: string; el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement; info: Record<string, unknown> }> = [];
    for (const el of Array.from(d.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('.cv-dialog-body input, .cv-dialog-body select, .cv-dialog-body textarea'))) {
      const type = el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase();
      if (['hidden', 'file', 'button', 'submit'].includes(type)) continue;
      const wrap = el.closest('label'), own = wrap ? ((): string => { const c = wrap.cloneNode(true) as HTMLElement; c.querySelectorAll('select, input, textarea, option').forEach((n) => n.remove()); return c.textContent ?? ''; })() : '';
      const lab = own.trim() || (wrap && !(el instanceof HTMLSelectElement) ? wrap.textContent : '') ||(el.id ? d.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : '') || el.getAttribute('aria-label') || el.title || el.getAttribute('name') || el.parentElement?.previousElementSibling?.textContent || type;
      const base = clean(lab, 60) || type, n = (used.get(base) ?? 0) + 1;
      used.set(base, n);
      const key = n > 1 ? `${base} #${n}` : base;
      const info: Record<string, unknown> = { field: key, type, disabled: el.disabled };
      if (el instanceof HTMLInputElement && (type === 'checkbox' || type === 'radio')) info.value = el.checked;
      else info.value = el.value;
      if (el instanceof HTMLInputElement && (type === 'range' || type === 'number')) { if (el.min) info.min = Number(el.min); if (el.max) info.max = Number(el.max); }
      if (el instanceof HTMLSelectElement) info.options = Array.from(el.options).map((o) => clean(o.textContent) || o.value);
      out.push({ key, el, info });
    }
    return out;
  }

  private buttonsOf(d: HTMLElement): HTMLButtonElement[] { return Array.from(d.querySelectorAll<HTMLButtonElement>('.cv-dialog-foot button')); }

  private describeDialog(d: HTMLElement): Record<string, unknown> {
    return { title: clean(d.querySelector('.cv-dialog-title')?.textContent), message: clean(d.querySelector('.cv-dialog-body')?.textContent, 300), fields: this.fieldsOf(d).map((f) => f.info),
      buttons: this.buttonsOf(d).map((b) => ({ button: clean(b.textContent, 40), disabled: b.disabled, primary: b.classList.contains('cv-btn-primary') })) };
  }

  async dialog(action: string, fields: Record<string, unknown> | undefined, button: string | undefined): Promise<McpResult> {
    const all = this.dialogs(), d = all[all.length - 1];
    if (action === 'list') return text(all.length ? JSON.stringify(all.map((x) => this.describeDialog(x))) : 'No dialog is open.', { dialogs: all.map((x) => this.describeDialog(x)) });
    if (!d) return fail('No dialog is open. ui_menu_invoke or run_command opens one; ui_dialog list shows what is open.');
    const set: string[] = [];
    if (fields) {
      const have = this.fieldsOf(d);
      for (const [name, value] of Object.entries(fields)) {
        const f = have.find((x) => x.key.toLowerCase() === name.toLowerCase());
        if (!f) return fail(`The dialog ${clean(d.querySelector('.cv-dialog-title')?.textContent)} has no field ${name}: its fields are ${have.map((x) => x.key).join(', ') || 'none'}.`);
        if (f.el.disabled) return fail(`The field ${f.key} is turned off in this dialog.`);
        const el = f.el;
        if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
          if (typeof value !== 'boolean') return fail(`${f.key} is a checkbox: give true or false.`);
          if (el.checked !== value) el.click();
        } else if (el instanceof HTMLSelectElement) {
          const opt = Array.from(el.options).find((o) => o.value === String(value) || clean(o.textContent).toLowerCase() === String(value).toLowerCase());
          if (!opt) return fail(`${f.key} takes one of: ${Array.from(el.options).map((o) => clean(o.textContent) || o.value).join(', ')}.`);
          el.value = opt.value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          if (typeof value !== 'string' && typeof value !== 'number') return fail(`${f.key} takes text or a number.`);
          el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        set.push(f.key);
      }
    }
    let pressed = '';
    if (action === 'confirm' || action === 'cancel' || button) {
      const row = this.buttonsOf(d).filter((b) => !b.disabled);
      const pick = button ? row.find((b) => clean(b.textContent, 40).toLowerCase() === button.toLowerCase())
        : action === 'confirm' ? row.find((b) => b.classList.contains('cv-btn-primary')) ?? row[row.length - 1]
          : row.find((b) => /^(cancel|close|no|don.?t save)$/i.test(clean(b.textContent, 40)));
      if (!pick && action === 'cancel') d.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      else if (!pick) return fail(`The dialog has no ${button ? `button ${button}` : 'confirm button'} now: its buttons are ${this.buttonsOf(d).map((b) => `${clean(b.textContent, 40)}${b.disabled ? ' (off)' : ''}`).join(', ') || 'none'}.`);
      else { pressed = clean(pick.textContent, 40); pick.click(); }
      for (let i = 0; i < 2400 && this.env.engine.busyWith; i++) await sleep(25);
      await sleep(50);
    }
    const left = this.dialogs();
    return text(`${set.length ? `Set ${set.join(', ')}. ` : ''}${pressed ? `Pressed ${pressed}. ` : action === 'cancel' ? 'Closed the dialog. ' : ''}${left.length ? `Open now: ${left.map((x) => clean(x.querySelector('.cv-dialog-title')?.textContent)).join(', ')}.` : 'No dialog is open.'}`,
      { set, pressed, open: left.map((x) => this.describeDialog(x)) });
  }

  /** The client point of a document point or a window point, from where the stage maps three client points to the document. */
  private toClient(space: string, x: number, y: number): { x: number; y: number } | null {
    if (space === 'window') return { x, y };
    const host = document.querySelector('.cv-stage')?.getBoundingClientRect();
    if (!host) return null;
    const c0 = { x: host.left + host.width / 2, y: host.top + host.height / 2 }, d0 = this.env.docPoint(c0.x, c0.y), dx = this.env.docPoint(c0.x + 40, c0.y), dy = this.env.docPoint(c0.x, c0.y + 40);
    if (!d0 || !dx || !dy) return null;
    const a = (dx.x - d0.x) / 40, b = (dy.x - d0.x) / 40, c = (dx.y - d0.y) / 40, d = (dy.y - d0.y) / 40, det = a * d - b * c;
    if (!det) return null;
    const rx = x - d0.x, ry = y - d0.y;
    return { x: c0.x + (d * rx - b * ry) / det, y: c0.y + (-c * rx + a * ry) / det };
  }

  async pointer(events: Array<Record<string, unknown>>, delay: number, keepDown: boolean): Promise<McpResult> {
    const e = this.env.engine, overlay = document.querySelector<HTMLCanvasElement>('.cv-overlay-canvas');
    if (!overlay || !e.current) return fail('No document is open, so there is no canvas to point at: call new_document or open_file first.');
    const before = e.current.history.steps.current, o = overlay as HTMLCanvasElement & { setPointerCapture: (id: number) => void };
    const real = Element.prototype.setPointerCapture;
    o.setPointerCapture = (id: number): void => { try { real.call(overlay, id); } catch { /* a synthetic pointer cannot be captured; the stage tracks its id */ } };
    let held = false, last = { x: 0, y: 0 }, sent = 0, lastInit: PointerEventInit = {};
    const fire = (type: string, init: PointerEventInit): void => { overlay.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, isPrimary: true, ...init })); sent++; };
    try {
      for (const [i, ev] of events.entries()) {
        const kind = String(ev.type), pt = this.toClient(String(ev.space ?? 'document'), Number(ev.x ?? 0), Number(ev.y ?? 0));
        if (!pt && kind !== 'up' && kind !== 'cancel') return fail(`Event ${i + 1}: the canvas cannot map ${String(ev.space ?? 'document')} point ${ev.x}, ${ev.y} (it is not showing). Check ui_state.`);
        const at = pt ?? last, pen = (ev.pointer_type ?? 'pen') as string;
        const button = Number(ev.button ?? 0), down = kind === 'down' || (held && (kind === 'move'));
        const init: PointerEventInit = { pointerId: pen === 'mouse' ? 1 : SYNTHETIC_PEN, pointerType: pen, clientX: at.x, clientY: at.y, button: kind === 'move' || kind === 'hover' ? -1 : button, buttons: down ? (button === 2 ? 2 : button === 1 ? 4 : 1) : 0,
          pressure: typeof ev.pressure === 'number' ? ev.pressure : down ? 0.5 : 0, tiltX: Number(ev.tilt_x ?? 0), tiltY: Number(ev.tilt_y ?? 0), twist: Number(ev.twist ?? 0),
          shiftKey: ev.shift === true, altKey: ev.alt === true, ctrlKey: ev.ctrl === true, metaKey: ev.meta === true };
        lastInit = init; last = at;
        if (kind === 'down') { fire('pointerdown', init); held = true; }
        else if (kind === 'move') fire('pointermove', init);
        else if (kind === 'hover') fire('pointermove', { ...init, buttons: 0, pressure: 0 });
        else if (kind === 'up') { fire('pointerup', { ...init, buttons: 0, pressure: 0 }); held = false; }
        else if (kind === 'cancel') { fire('pointercancel', { ...init, buttons: 0, pressure: 0 }); held = false; }
        else if (kind === 'wheel') overlay.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, deltaX: Number(ev.delta_x ?? 0), deltaY: Number(ev.delta_y ?? 0), shiftKey: ev.shift === true, altKey: ev.alt === true, ctrlKey: ev.ctrl === true, metaKey: ev.meta === true }));
        if (delay > 0) await sleep(delay);
      }
    } finally {
      if (held && !keepDown) fire('pointerup', { ...lastInit, buttons: 0, pressure: 0 });
      delete (o as { setPointerCapture?: unknown }).setPointerCapture;
    }
    await sleep(30);
    for (let i = 0; i < 2400 && e.busyWith; i++) await sleep(25);
    const gained = (e.current?.history.steps.current ?? before) - before;
    return text(`Sent ${sent} pointer event${sent === 1 ? '' : 's'} to the canvas with the ${e.tool} tool; the document gained ${gained} history step${gained === 1 ? '' : 's'}.`, { sent, tool: e.tool, historySteps: gained, held });
  }

  async key(keys: string[] | undefined, typed: string | undefined): Promise<McpResult> {
    const target = (document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body) as HTMLElement, sent: string[] = [];
    if (target.closest('.ft-dock')) return fail('The terminal dock belongs to the person: ui_key does not type into it. Focus the canvas or open a dialog first.');
    for (const combo of keys ?? []) {
      const parts = combo.split('+'), name = parts[parts.length - 1] || '+', mods = parts.slice(0, -1).map((m) => m.toLowerCase());
      const shift = mods.includes('shift'), mod = mods.includes('mod');
      const init: KeyboardEventInit = { key: shift && name.length === 1 ? name.toUpperCase() : name.length === 1 ? name.toLowerCase() : name, code: name.length === 1 ? (/[a-z]/i.test(name) ? `Key${name.toUpperCase()}` : /\d/.test(name) ? `Digit${name}` : '') : name,
        bubbles: true, cancelable: true, shiftKey: shift, altKey: mods.includes('alt'), ctrlKey: mods.includes('ctrl') || (mod && !isMac), metaKey: mods.includes('meta') || (mod && isMac) };
      target.dispatchEvent(new KeyboardEvent('keydown', init)); target.dispatchEvent(new KeyboardEvent('keyup', init)); sent.push(combo);
      await sleep(20);
    }
    if (typed) {
      const t = document.activeElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
        t.setRangeText(typed, t.selectionStart ?? t.value.length, t.selectionEnd ?? t.value.length, 'end');
        t.dispatchEvent(new InputEvent('input', { bubbles: true, data: typed, inputType: 'insertText' }));
        sent.push(`text of ${typed.length} characters`);
      } else if (t instanceof HTMLElement && t.isContentEditable) { document.execCommand('insertText', false, typed); sent.push(`text of ${typed.length} characters`); }
      else return fail(`${sent.length ? `Sent ${sent.join(', ')}, but ` : ''}no text field has focus, so the text went nowhere: open a dialog or a text layer's editor, or focus a field first.`);
    }
    for (let i = 0; i < 2400 && this.env.engine.busyWith; i++) await sleep(25);
    return text(`Sent ${sent.join(', ')} to ${target.tagName.toLowerCase()}${target.className && typeof target.className === 'string' ? `.${target.className.split(' ')[0]}` : ''}.`, { sent });
  }

  async window(action: string, width: number | undefined, height: number | undefined, confirm = false): Promise<McpResult> {
    const size = (): Record<string, unknown> => ({ width: window.innerWidth, height: window.innerHeight, outerWidth: window.outerWidth, outerHeight: window.outerHeight, focused: document.hasFocus() });
    if (action === 'size') return text(JSON.stringify(size()), size());
    if (action === 'quit') {
      const unsaved = this.env.engine.projects.filter((q) => q.modified).map((q) => q.name);
      if (!confirm) return fail(`quit closes formvis${unsaved.length ? ` and asks the person about ${unsaved.length} document${unsaved.length === 1 ? '' : 's'} with unsaved changes (${unsaved.join(', ')})` : ''}. Call ui_window with action quit and confirm true if that is what the person wants.`);
      if (!this.env.commands.get('exit')) return fail('Quit is not available in this window.');
      window.setTimeout(() => { void this.env.commands.call('exit'); }, 50);
      return text(`Quitting formvis${unsaved.length ? `: the person is asked about ${unsaved.join(', ')} first` : ''}. A browser tab only ends by saying it can be closed.`, { quitting: true, unsaved });
    }
    if (action === 'focus') { window.focus(); document.querySelector<HTMLElement>('.cv-stage')?.focus?.(); return text(`The window ${document.hasFocus() ? 'has' : 'was asked for'} focus.`, size()); }
    if (action === 'fullscreen') { const c = this.env.commands.get('os-full-screen'); if (!c) return fail('Full screen is not available in this window.'); await this.env.commands.call('os-full-screen'); return text('Toggled full screen.', size()); }
    if (action === 'resize') {
      if (!width || !height) return fail('resize needs width and height in pixels.');
      const before = size();
      const tauri = (window as unknown as { __TAURI_INTERNALS__?: { invoke(cmd: string, args: Record<string, unknown>): Promise<unknown> } }).__TAURI_INTERNALS__;
      try {
        if (tauri) await tauri.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width, height } } });
        else window.resizeTo(width, height);
      } catch (err) { return fail(`The window could not be resized: ${err instanceof Error ? err.message : String(err)}.`); }
      await sleep(250);
      const now = size();
      return now.width === before.width && now.height === before.height ? fail('The window did not change size: a browser tab cannot be resized by a page, only the desktop app\'s window can.') : text(`The window is ${now.width} by ${now.height}.`, now);
    }
    return fail('action is size, resize, focus, fullscreen or quit.');
  }
}
