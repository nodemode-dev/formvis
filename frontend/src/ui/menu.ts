import { el, q, setClass, setDisabled, setText } from './dom';
import { icon } from './icons';
import type { Commands } from './commands';

export type MenuItem = string | '-';

export class PopupMenu {
  readonly panel: HTMLElement;
  private rows: Array<{ id: string; node: HTMLButtonElement }> = [];
  private seps: HTMLElement[] = [];
  private items: MenuItem[] = [];
  onClose: (() => void) | null = null;

  constructor(private readonly commands: Commands) {
    this.panel = el('<div class="cv-menu" role="menu" hidden></div>');
    document.getElementById('overlay-root')?.appendChild(this.panel);
    this.panel.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get isOpen(): boolean { return !this.panel.hidden; }

  setItems(items: MenuItem[]): void {
    if (items.join('|') === this.items.join('|')) return;
    this.items = items;
    this.panel.textContent = '';
    this.rows = [];
    this.seps = [];
    for (const item of items) {
      if (item === '-') { const s = el('<div class="cv-menu-sep"></div>'); this.seps.push(s); this.panel.appendChild(s); continue; }
      const cmd = this.commands.get(item);
      if (!cmd) continue;
      const node = el<HTMLButtonElement>(`<button class="cv-menu-item" role="menuitem" type="button"><span class="cv-menu-check">${icon('check', 14)}</span><span class="cv-menu-label"></span><span class="cv-menu-keys"></span></button>`);
      setText(q(node, '.cv-menu-keys'), this.commands.keyLabel(cmd));
      node.addEventListener('click', () => { this.close(); this.commands.run(item); });
      this.rows.push({ id: item, node });
      this.panel.appendChild(node);
    }
  }

  openAt(x: number, y: number): void {
    for (const r of this.rows) {
      const cmd = this.commands.get(r.id);
      if (!cmd) continue;
      setText(q(r.node, '.cv-menu-label'), this.commands.label(cmd));
      setDisabled(r.node, !this.commands.enabled(cmd));
      setClass(r.node, 'is-checked', !!cmd.checked?.());
    }
    this.panel.style.visibility = 'hidden';
    this.panel.hidden = false;
    const w = this.panel.offsetWidth, h = this.panel.offsetHeight;
    const left = Math.max(4, Math.min(x, window.innerWidth - w - 4));
    const top = Math.max(4, Math.min(y, window.innerHeight - h - 4));
    this.panel.style.left = `${Math.round(left)}px`;
    this.panel.style.top = `${Math.round(top)}px`;
    this.panel.style.visibility = '';
  }

  close(): void {
    if (this.panel.hidden) return;
    this.panel.hidden = true;
    this.onClose?.();
  }
}

/** A menubar menu; `items` may be a function, resolved each time the menu opens (File's Open Recent section). */
export interface MenuDef { label: string; items: MenuItem[] | (() => MenuItem[]) }

const itemsOf = (def: MenuDef): MenuItem[] => (typeof def.items === 'function' ? def.items() : def.items);

export class MenuBar {
  private readonly menus: Array<{ btn: HTMLButtonElement; menu: PopupMenu; def: MenuDef }> = [];
  private openIndex = -1;

  constructor(host: HTMLElement, commands: Commands, defs: MenuDef[]) {
    defs.forEach((def, i) => {
      const btn = el<HTMLButtonElement>('<button class="cv-menu-btn" type="button" aria-haspopup="menu"></button>');
      btn.textContent = def.label;
      host.appendChild(btn);
      const menu = new PopupMenu(commands);
      menu.setItems(itemsOf(def));
      menu.onClose = () => { if (this.openIndex === i) { this.openIndex = -1; setClass(btn, 'is-open', false); } };
      btn.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; e.preventDefault(); if (this.openIndex === i) this.close(); else this.open(i); });
      btn.addEventListener('pointerenter', () => { if (this.openIndex >= 0 && this.openIndex !== i) this.open(i); });
      this.menus.push({ btn, menu, def });
    });
    document.addEventListener('pointerdown', (e) => {
      if (this.openIndex < 0) return;
      const m = this.menus[this.openIndex];
      const t = e.target as Node;
      if (!m.menu.panel.contains(t) && !m.btn.contains(t)) this.close();
    }, true);
    window.addEventListener('blur', () => this.close());
    window.addEventListener('resize', () => this.close());
  }

  get isOpen(): boolean { return this.openIndex >= 0; }

  open(i: number): void {
    this.close();
    const m = this.menus[i];
    m.menu.setItems(itemsOf(m.def));
    const b = m.btn.getBoundingClientRect();
    this.openIndex = i;
    setClass(m.btn, 'is-open', true);
    m.menu.openAt(b.left, b.bottom + 4);
  }

  close(): void {
    if (this.openIndex < 0) return;
    const m = this.menus[this.openIndex];
    this.openIndex = -1;
    setClass(m.btn, 'is-open', false);
    m.menu.close();
  }
}
