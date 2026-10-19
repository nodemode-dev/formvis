import { el, q, setClass, setDisabled, setText, setTitle } from './dom';
import { icon } from './icons';
import type { Commands } from './commands';
import { onLanguage, t } from './i18n';
import { anyDialogOpen } from './dialogs';

/** A command id, a separator, or a submenu of further items. */
export type MenuItem = string | '-' | SubMenu;
export interface SubMenu { label: string; items: MenuItem[] }
const isSub = (i: MenuItem): i is SubMenu => typeof i === 'object';

/** Edit > Menus: command ids left out of the menu bar's menus, and the colour name each item is drawn in. */
let hiddenIds = new Set<string>();
let itemColors: Record<string, string> = {};
/** Commands that stay in the menus whatever is hidden, so the way back is never lost. */
export const MENU_KEEP: readonly string[] = ['edit-menus', 'shortcuts', 'settings'];
export function setMenuStyle(hidden: readonly string[], colors: Record<string, string>): void { hiddenIds = new Set(hidden); itemColors = { ...colors }; }

/** Items without the hidden commands; a submenu left empty goes too, and no separator is left leading, trailing or doubled. */
export function trimMenu(items: MenuItem[]): MenuItem[] {
  if (!hiddenIds.size) return items;
  const out: MenuItem[] = [];
  for (const i of items) {
    if (i === '-') { if (out.length && out[out.length - 1] !== '-') out.push(i); continue; }
    if (isSub(i)) { const inner = trimMenu(i.items); if (inner.some((x) => x !== '-')) out.push({ label: i.label, items: inner }); continue; }
    if (!hiddenIds.has(i) || MENU_KEEP.includes(i)) out.push(i);
  }
  while (out.length && out[out.length - 1] === '-') out.pop();
  return out;
}

export class PopupMenu {
  readonly panel: HTMLElement;
  private rows: Array<{ id: string; node: HTMLButtonElement }> = [];
  private subs: Array<{ sub: SubMenu; node: HTMLButtonElement; menu: PopupMenu }> = [];
  private seps: HTMLElement[] = [];
  private key = '';
  private openSub: PopupMenu | null = null;
  private subTop = 0;
  onClose: (() => void) | null = null;

  constructor(private readonly commands: Commands, private readonly parent: PopupMenu | null = null, standalone = false) {
    this.panel = el<HTMLElement>('<div class="cv-menu" role="menu" hidden></div>');
    document.getElementById('overlay-root')?.appendChild(this.panel);
    this.panel.addEventListener('contextmenu', (e) => e.preventDefault());
    // A scrolled menu moves its rows, so a submenu opened beside one would no longer line up.
    this.panel.addEventListener('scroll', () => { if (this.panel.scrollTop !== this.subTop) this.closeSub(); }, { passive: true });
    // A menu opened on its own (the layers' right-click menu) closes on a press anywhere outside it; the menubar's
    // menus are closed by the menubar, which also owns their buttons.
    if (standalone) document.addEventListener('pointerdown', (e) => { if (this.isOpen && !this.contains(e.target as Node)) this.close(); }, true);
  }

  get isOpen(): boolean { return !this.panel.hidden; }

  /** Whether `t` is inside this menu or any submenu open from it. */
  contains(t: Node): boolean { return this.panel.contains(t) || !!this.openSub?.contains(t); }

  setItems(items: MenuItem[]): void {
    const key = JSON.stringify(items) + JSON.stringify(itemColors);
    if (key === this.key) return;
    this.key = key;
    this.closeSub();
    for (const s of this.subs) s.menu.panel.remove();
    this.panel.replaceChildren();
    this.rows = [];
    this.subs = [];
    this.seps = [];
    // A tick column only where a tick can show, as the target's menus (its Filter menu has none; Window's panels do).
    this.panel.classList.toggle('has-checks', items.some((i) => typeof i === 'string' && i !== '-' && !!this.commands.get(i)?.checked));
    for (const item of items) {
      if (item === '-') { const sep = el<HTMLElement>('<div class="cv-menu-sep"></div>'); this.seps.push(sep); this.panel.appendChild(sep); continue; }
      if (isSub(item)) {
        const node = el<HTMLButtonElement>(`<button class="cv-menu-item cv-menu-sub" role="menuitem" aria-haspopup="menu" type="button"><span class="cv-menu-check"></span><span class="cv-menu-label"></span><span class="cv-menu-keys">${icon('chevronRight', 12)}</span></button>`);
        setText(q(node, '.cv-menu-label'), t(item.label));
        const menu = new PopupMenu(this.commands, this);
        menu.setItems(item.items);
        node.addEventListener('pointerenter', () => this.showSub(menu, node));
        node.addEventListener('click', () => this.showSub(menu, node));
        this.subs.push({ sub: item, node, menu });
        this.panel.appendChild(node);
        continue;
      }
      const cmd = this.commands.get(item);
      if (!cmd) continue;
      const node = el<HTMLButtonElement>(`<button class="cv-menu-item" role="menuitem" type="button"><span class="cv-menu-check">${icon('check', 14)}</span><span class="cv-menu-label"></span><span class="cv-menu-keys"></span></button>`);
      setText(q(node, '.cv-menu-keys'), this.commands.keyLabel(cmd));
      if (itemColors[item]) node.dataset.color = itemColors[item];
      node.addEventListener('pointerenter', () => this.closeSub());
      node.addEventListener('click', () => { this.root().close(); this.commands.run(item); });
      this.rows.push({ id: item, node });
      this.panel.appendChild(node);
    }
  }

  private root(): PopupMenu { let m: PopupMenu = this; while (m.parent) m = m.parent; return m; }

  /** The rows a key can reach, in order: the enabled commands and submenu rows. */
  items(): HTMLButtonElement[] { return Array.from(this.panel.children).filter((n): n is HTMLButtonElement => n instanceof HTMLButtonElement && !n.disabled); }

  /** This menu or, following the open submenus, the innermost one showing. */
  deepest(): PopupMenu { let m: PopupMenu = this; while (m.openSub?.isOpen) m = m.openSub; return m; }

  /** Opens the submenu behind `row`, if it is one. */
  openSubAt(row: HTMLElement): PopupMenu | null {
    const s = this.subs.find((x) => x.node === row);
    if (!s) return null;
    this.showSub(s.menu, row);
    return s.menu;
  }

  /** Closes this submenu and puts focus back on its row in the menu above; false for a menu with none above. */
  leave(): boolean {
    const p = this.parent;
    if (!p) return false;
    const row = p.subs.find((x) => x.menu === this)?.node;
    p.closeSub();
    row?.focus();
    return true;
  }

  private showSub(menu: PopupMenu, row: HTMLElement): void {
    if (this.openSub === menu && menu.isOpen) return;
    this.closeSub();
    this.openSub = menu;
    this.subTop = this.panel.scrollTop;
    setClass(row, 'is-open', true);
    menu.onClose = () => setClass(row, 'is-open', false);
    const r = row.getBoundingClientRect();
    menu.openBeside(r);
  }

  private closeSub(): void {
    const s = this.openSub;
    this.openSub = null;
    s?.close();
  }

  /** Refreshes labels, checks and enabled states, then shows the menu at `x, y`, kept within the window; a menu taller
   *  than the window scrolls. */
  openAt(x: number, y: number): void {
    this.refresh();
    this.panel.style.visibility = 'hidden';
    this.panel.hidden = false;
    this.panel.scrollTop = 0;
    const { width: w, height: h } = this.panel.getBoundingClientRect();
    // As native menus: below and right of the pointer when it fits, otherwise above or to the left of it, so the
    // pointer sits at a corner and never over an item (clamping alone could put a submenu under it, opening it).
    const fitsRight = x + w <= window.innerWidth - 4, fitsBelow = y + h <= window.innerHeight - 4;
    const left = Math.max(4, Math.min(fitsRight ? x : x - w, window.innerWidth - w - 4));
    const top = Math.max(4, Math.min(fitsBelow ? y : y - h, window.innerHeight - h - 4));
    this.panel.style.left = `${Math.round(left)}px`;
    this.panel.style.top = `${Math.round(top)}px`;
    this.panel.style.visibility = '';
  }

  /** A submenu beside its row: to the right, or to the left when the right has no room. */
  private openBeside(row: DOMRect): void {
    this.refresh();
    this.panel.style.visibility = 'hidden';
    this.panel.hidden = false;
    this.panel.scrollTop = 0;
    const w = this.panel.offsetWidth, h = this.panel.offsetHeight, pad = 4;
    const right = row.right - 2, left = row.left - w + 2;
    const x = right + w <= window.innerWidth - pad ? right : Math.max(pad, left);
    const y = Math.max(pad, Math.min(row.top - pad, window.innerHeight - h - pad));
    this.panel.style.left = `${Math.round(x)}px`;
    this.panel.style.top = `${Math.round(y)}px`;
    this.panel.style.visibility = '';
  }

  private refresh(): void {
    for (const r of this.rows) {
      const cmd = this.commands.get(r.id);
      if (!cmd) continue;
      setText(q(r.node, '.cv-menu-label'), t(this.commands.label(cmd)));
      setDisabled(r.node, !this.commands.enabled(cmd));
      const why = t(this.commands.why(cmd));
      if (why || r.node.dataset.why) { setTitle(r.node, why); r.node.dataset.why = why; }
      setClass(r.node, 'is-checked', !!cmd.checked?.());
    }
  }

  /** Re-labels every row and submenu in place after a language change; only text changes, no node is rebuilt. */
  relabel(): void {
    this.refresh();
    for (const s of this.subs) { setText(q(s.node, '.cv-menu-label'), t(s.sub.label)); s.menu.relabel(); }
  }

  close(): void {
    this.closeSub();
    if (this.panel.hidden) return;
    this.panel.hidden = true;
    this.onClose?.();
  }
}

/** A menubar menu: its label and its items; a function is called afresh each time the menu opens. */
export interface MenuDef { label: string; items: MenuItem[] | (() => MenuItem[]) }

const itemsOf = (def: MenuDef): MenuItem[] => trimMenu(typeof def.items === 'function' ? def.items() : def.items);

export class MenuBar {
  private readonly bars: Array<{ btn: HTMLButtonElement; menu: PopupMenu; def: MenuDef }> = [];
  private openIndex = -1;

  constructor(host: HTMLElement, commands: Commands, defs: MenuDef[]) {
    for (const def of defs) {
      const btn = el<HTMLButtonElement>('<button class="cv-menu-btn" type="button" aria-haspopup="menu"></button>');
      setText(btn, t(def.label));
      host.appendChild(btn);
      const menu = new PopupMenu(commands);
      menu.setItems(itemsOf(def));
      const idx = this.bars.length;
      menu.onClose = () => {
        if (this.openIndex === idx) {
          const inside = !!document.activeElement?.closest('.cv-menu'), back = this.returnTo;
          this.openIndex = -1; setClass(btn, 'is-open', false);
          this.returnTo = null;
          if (inside && back?.isConnected) back.focus();
        }
      };
      btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        if (this.openIndex === idx) this.close(); else this.open(idx);
      });
      btn.addEventListener('pointerenter', () => { if (this.openIndex >= 0 && this.openIndex !== idx) this.open(idx); });
      this.bars.push({ btn, menu, def });
    }
    document.addEventListener('pointerdown', (e) => {
      if (this.openIndex < 0) return;
      const m = this.bars[this.openIndex];
      const t = e.target as Node;
      if (!m.menu.contains(t) && !m.btn.contains(t)) this.close();
    }, true);
    window.addEventListener('blur', () => this.close());
    window.addEventListener('resize', () => this.close());
    document.addEventListener('keydown', (e) => this.key(e), true);
    document.addEventListener('keyup', (e) => this.altUp(e), true);
    window.addEventListener('blur', () => { this.altLone = false; setClass(document.documentElement, 'is-menu-mnemonics', false); });
    onLanguage(() => { for (const b of this.bars) { setText(b.btn, t(b.def.label)); b.menu.relabel(); } });
  }

  get isOpen(): boolean { return this.openIndex >= 0; }

  private returnTo: HTMLElement | null = null;
  private typed = '';
  private typedAt = 0;
  private altLone = false;
  private barBack: HTMLElement | null = null;

  /** Alt pressed and released alone puts focus on the first menu, ready for the arrows; Alt held underlines the first letters. */
  private altUp(e: KeyboardEvent): void {
    if (e.key !== 'Alt') return;
    setClass(document.documentElement, 'is-menu-mnemonics', false);
    if (!this.altLone) return;
    this.altLone = false;
    if (this.openIndex >= 0 || anyDialogOpen() || !this.bars.length) return;
    e.preventDefault();
    const from = document.activeElement;
    this.barBack = from instanceof HTMLElement && !this.bars.some((b) => b.btn === from) ? from : this.barBack;
    this.bars[0].btn.focus();
  }

  /** Focus leaves the menu bar for where it was before Alt. */
  private leaveBar(): void {
    const back = this.barBack;
    this.barBack = null;
    if (back?.isConnected && back !== document.body) back.focus(); else (document.activeElement as HTMLElement | null)?.blur();
  }

  /** Keyboard: F10, or Alt with a menu's first letter, opens a menu; the arrows move through it and across the bar, Enter
   *  runs a row, Escape steps back, and letters jump to the next row that starts with them. */
  private key(e: KeyboardEvent): void {
    const stop = (): void => { e.preventDefault(); e.stopPropagation(); };
    const mac = /Mac/.test(navigator.platform);
    if (e.key === 'Alt') {
      if (!e.repeat && !mac && this.openIndex < 0 && !anyDialogOpen() && !e.ctrlKey && !e.metaKey && !e.shiftKey) { this.altLone = true; setClass(document.documentElement, 'is-menu-mnemonics', true); }
      return;
    }
    this.altLone = false;
    if (this.openIndex < 0) {
      if (anyDialogOpen() || e.ctrlKey || e.metaKey) return;
      const at = this.bars.findIndex((b) => b.btn === document.activeElement);
      if (at >= 0 && !e.altKey && !e.shiftKey) {
        const focus = (i: number): void => this.bars[(i + this.bars.length) % this.bars.length].btn.focus();
        if (e.key === 'ArrowRight') { stop(); focus(at + 1); return; }
        if (e.key === 'ArrowLeft') { stop(); focus(at - 1); return; }
        if (e.key === 'Home') { stop(); focus(0); return; }
        if (e.key === 'End') { stop(); focus(-1); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') { stop(); this.open(at, true); return; }
        if (e.key === 'Escape') { stop(); this.leaveBar(); return; }
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const hit = this.bars.findIndex((b) => (b.btn.textContent ?? '').trim().charAt(0).toLowerCase() === e.key.toLowerCase());
          if (hit >= 0) { stop(); this.open(hit, true); }
          return;
        }
      }
      if (e.key === 'F10' && !e.altKey && !e.shiftKey) { stop(); this.open(0, true); return; }
      if (!e.altKey || e.shiftKey || mac || !/^Key[A-Z]$/.test(e.code)) return;
      const letter = e.code.slice(3).toLowerCase(), hits = this.bars.map((b, i) => (b.btn.textContent ?? '').trim().charAt(0).toLowerCase() === letter ? i : -1).filter((i) => i >= 0);
      if (!hits.length) return;
      stop();
      this.open(hits[0], true);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const cur = this.bars[this.openIndex].menu.deepest(), items = cur.items(), row = document.activeElement, at = items.findIndex((n) => n === row);
    const go = (i: number): void => { if (items.length) items[(i + items.length) % items.length].focus(); };
    if (e.key === 'ArrowDown') { stop(); go(at + 1); }
    else if (e.key === 'ArrowUp') { stop(); go(at < 0 ? -1 : at - 1); }
    else if (e.key === 'Home') { stop(); go(0); }
    else if (e.key === 'End') { stop(); go(-1); }
    else if (e.key === 'ArrowRight') { stop(); const sub = at >= 0 ? cur.openSubAt(items[at]) : null; if (sub) sub.items()[0]?.focus(); else this.open((this.openIndex + 1) % this.bars.length, true); }
    else if (e.key === 'ArrowLeft') { stop(); if (!cur.leave()) this.open((this.openIndex + this.bars.length - 1) % this.bars.length, true); }
    else if ((e.key === 'Enter' || e.key === ' ') && at >= 0) { stop(); const sub = cur.openSubAt(items[at]); if (sub) sub.items()[0]?.focus(); else items[at].click(); }
    else if (e.key === 'Escape') { stop(); if (!cur.leave()) this.close(); }
    else if (e.key === 'Tab') { stop(); this.close(); }
    else if (e.key.length === 1 && /\S/.test(e.key) && !e.shiftKey) {
      stop();
      const now = performance.now(), word = now - this.typedAt < 700 ? this.typed + e.key.toLowerCase() : e.key.toLowerCase();
      this.typed = word;
      this.typedAt = now;
      const starts = (n: HTMLElement): boolean => (n.querySelector('.cv-menu-label')?.textContent ?? '').trim().toLowerCase().startsWith(word);
      const from = word.length === 1 ? at + 1 : Math.max(0, at);
      for (let k = 0; k < items.length; k++) { const n = items[(from + k) % items.length]; if (starts(n)) { n.focus(); break; } }
    }
  }

  open(i: number, keyboard = false): void {
    const from = document.activeElement, keep = this.returnTo;
    this.shut();
    this.returnTo = keep ?? (keyboard && from instanceof HTMLElement && !from.closest('.cv-menu') ? from : null);
    const b = this.bars[i];
    b.menu.setItems(itemsOf(b.def));
    this.openIndex = i;
    setClass(b.btn, 'is-open', true);
    const r = b.btn.getBoundingClientRect();
    b.menu.openAt(r.left, r.bottom + 4);
    if (keyboard) b.menu.items()[0]?.focus();
  }

  private shut(): void {
    if (this.openIndex < 0) return;
    const b = this.bars[this.openIndex];
    this.openIndex = -1;
    setClass(b.btn, 'is-open', false);
    b.menu.close();
  }

  close(): void {
    const inside = !!document.activeElement?.closest('.cv-menu');
    this.shut();
    const back = this.returnTo;
    this.returnTo = null;
    if (inside && back && back.isConnected) back.focus();
  }
}
