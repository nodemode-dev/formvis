import type { Commands } from './commands';
import type { MenuDef, MenuItem as MenuSpec } from './menu';
import { t } from './i18n';

/** formvis's menus in the macOS menu bar when it runs as the desktop app (Phase 21, UI_SPEC.md section 2: the target's
 *  menus are the system's). Built from the same MenuDef list and command registry as the in-window menu bar, so the two
 *  never differ: labels, order, submenus, separators and shortcuts (Mod as CmdOrCtrl). An application menu comes first,
 *  as macOS expects (About, Preferences, Quit). Enabled states follow the app; the menu is rebuilt when documents open or
 *  close (File > Open Recent). Only on macOS: there the menu bar owns the shortcuts, so a key never runs twice; elsewhere
 *  the in-window menu bar stays. A shortcut Tauri cannot express is left off its item rather than failing the menu. */
export const wantsNativeMenus = (): boolean => '__TAURI_INTERNALS__' in window && /Mac/.test(navigator.platform) && !menusInWindow();

/** The person's choice to keep the menus in the window on macOS (View > Menus in Window); it applies at the next start. */
export const MENUS_IN_WINDOW_KEY = 'formvis.menusInWindow';
export function menusInWindow(): boolean {
  try { return localStorage.getItem(MENUS_IN_WINDOW_KEY) === '1'; } catch { return false; }
}

/** formvis's key combo ('Mod+Shift+S') as a Tauri accelerator ('CmdOrCtrl+Shift+S'); null for what Tauri has no name for. */
export function accelerator(combo: string | undefined): string | null {
  if (!combo) return null;
  const parts = combo.endsWith('++') ? [...combo.slice(0, -2).split('+'), 'Plus'] : combo.split('+');
  const names: Record<string, string> = { Mod: 'CmdOrCtrl', Alt: 'Alt', Shift: 'Shift', Ctrl: 'Ctrl', '=': '=', '-': '-', '[': '[', ']': ']', Delete: 'Delete', Backspace: 'Backspace', Escape: 'Escape', Enter: 'Enter', Tab: 'Tab', Space: 'Space', Plus: 'Plus' };
  const out: string[] = [];
  for (const p of parts) {
    if (names[p]) out.push(names[p]);
    else if (/^[A-Za-z0-9]$/.test(p)) out.push(p.toUpperCase());
    else if (/^F([1-9]|1[0-2])$/.test(p)) out.push(p);
    else return null;
  }
  return out.join('+');
}

type Api = typeof import('@tauri-apps/api/menu');

/** The Edit commands whose keys a focused text field needs for itself (1.96.2): while one has focus the menu sends the
 *  standard edit action to it through the shell's text_edit, so Cmd+V pastes into the field instead of as a layer. */
const TEXT_EDITS = new Set(['undo', 'redo', 'cut', 'copy', 'paste', 'select-all']);
const NOT_TEXT = new Set(['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image']);

export function textFieldFocused(): boolean {
  const a = document.activeElement;
  if (a instanceof HTMLTextAreaElement) return !a.readOnly && !a.disabled;
  if (a instanceof HTMLInputElement) return !NOT_TEXT.has(a.type) && !a.readOnly && !a.disabled;
  return a instanceof HTMLElement && a.isContentEditable;
}

export class NativeMenus {
  private items: Array<{ id: string; item: { setEnabled(on: boolean): Promise<void>; setChecked?(on: boolean): Promise<void> } }> = [];
  private building = false;
  private again = false;
  private stateTimer = 0;

  constructor(private readonly commands: Commands, private readonly menus: () => MenuDef[]) {
    for (const ev of ['pointerup', 'keyup', 'focusin', 'focusout'] as const) window.addEventListener(ev, () => { if (this.items.length) this.refresh(); }, { passive: true });
  }

  /** Builds (or rebuilds) the menu bar; later calls while one is building are folded into one more build. */
  async build(): Promise<void> {
    if (this.building) { this.again = true; return; }
    this.building = true;
    try {
      const api: Api = await import('@tauri-apps/api/menu');
      const items: typeof this.items = [];
      const make = async (spec: MenuSpec): Promise<unknown> => {
        if (spec === '-') return api.PredefinedMenuItem.new({ item: 'Separator' });
        if (typeof spec === 'object') return api.Submenu.new({ text: t(spec.label), items: (await Promise.all(spec.items.map(make))) as never[] });
        const cmd = this.commands.get(spec);
        if (!cmd) return null;
        const text = t(this.commands.label(cmd)), acc = accelerator(cmd.keys?.[0]);
        const opts = { text, enabled: this.enabled(spec), action: () => {
          if (TEXT_EDITS.has(spec) && textFieldFocused()) void import('@tauri-apps/api/core').then((m) => m.invoke('text_edit', { action: spec })).catch(() => undefined);
          else this.commands.run(spec);
          this.refresh();
        } };
        let item;
        if (cmd.checked) {
          const copts = { ...opts, checked: !!cmd.checked() };
          try { item = await api.CheckMenuItem.new(acc ? { ...copts, accelerator: acc } : copts); } catch { item = await api.CheckMenuItem.new(copts); }
        } else {
          try { item = await api.MenuItem.new(acc ? { ...opts, accelerator: acc } : opts); } catch { item = await api.MenuItem.new(opts); }
        }
        items.push({ id: spec, item });
        return item;
      };
      const top = [];
      top.push(await api.Submenu.new({ text: 'formvis', items: [
        await api.PredefinedMenuItem.new({ item: { About: { name: 'formvis' } }, text: t('About formvis') }),
        await api.PredefinedMenuItem.new({ item: 'Separator' }),
        ...(this.commands.get('settings') ? [await make('settings')] : []),
        await api.PredefinedMenuItem.new({ item: 'Separator' }),
        await api.PredefinedMenuItem.new({ item: 'Hide' }),
        await api.PredefinedMenuItem.new({ item: 'Quit' }),
      ] as never[] }));
      for (const def of this.menus()) {
        const list = typeof def.items === 'function' ? def.items() : def.items;
        top.push(await api.Submenu.new({ text: t(def.label), items: (await Promise.all(list.map(make))).filter(Boolean) as never[] }));
      }
      const menu = await api.Menu.new({ items: top as never[] });
      await menu.setAsAppMenu();
      this.items = items;
      document.documentElement.classList.add('has-native-menus');
    } finally {
      this.building = false;
      if (this.again) { this.again = false; void this.build(); }
    }
  }

  /** A command's item is enabled when the command is, and an Edit item also whenever a text field has focus. */
  private enabled(id: string): boolean {
    if (TEXT_EDITS.has(id) && textFieldFocused()) return true;
    const cmd = this.commands.get(id);
    return !!cmd && this.commands.enabled(cmd);
  }

  /** The enabled and tick states, refreshed a moment after the app changes (grouped, so a burst of changes is one pass). */
  refresh(): void {
    if (this.stateTimer) return;
    this.stateTimer = window.setTimeout(() => {
      this.stateTimer = 0;
      for (const { id, item } of this.items) {
        const cmd = this.commands.get(id);
        if (!cmd) continue;
        void item.setEnabled(this.enabled(id)).catch(() => undefined);
        if (cmd.checked && item.setChecked) void item.setChecked(!!cmd.checked()).catch(() => undefined);
      }
    }, 150);
  }
}
