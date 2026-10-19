import type { Commands } from '../commands';
import { Dialog } from '../dialogs';
import { el, patchList, q, setChecked, setText, setValue } from '../dom';
import { MENU_KEEP, type MenuDef, type MenuItem } from '../menu';
import { MENU_COLORS, loadPrefs, updatePrefs } from '../prefs';

interface Row { key: string; id: string; label: string; depth: number; head: boolean }

const cap = (s: string): string => s[0].toUpperCase() + s.slice(1);

/** Edit > Menus: for each menu, which items show in the menu bar and the colour each is drawn in. Both are kept in
 *  Preferences and take effect at once; the command palette and the shortcuts still reach a hidden item. */
export class MenusDialog extends Dialog {
  private readonly pick = el<HTMLSelectElement>('<select class="cv-select" aria-label="Menu"></select>');
  private readonly list = el('<div class="cv-list" aria-label="Menu items" style="max-height: 360px; overflow-y: auto"></div>');
  private readonly note = el('<p class="cv-note" role="status"></p>');

  constructor(private readonly commands: Commands, private readonly menus: () => MenuDef[], private readonly onChange: () => void) {
    super('Menus', 560);
    const row = el('<label class="cv-field"><span>Menu</span></label>');
    row.append(this.pick);
    this.body.append(row, this.list, this.note);
    this.pick.addEventListener('change', () => this.render());
    this.button('Show All', 'ghost', () => this.apply({ menuHidden: [] }));
    this.button('Clear Colors', 'ghost', () => this.apply({ menuColors: {} }));
    this.button('Done', 'primary', () => this.close());
  }

  show(): void {
    const defs = this.menus(), was = this.pick.value;
    if (this.pick.options.length !== defs.length) this.pick.replaceChildren(...defs.map((d) => new Option(d.label, d.label)));
    this.pick.value = defs.some((d) => d.label === was) ? was : defs[0]?.label ?? '';
    setText(this.note, 'Hidden items stay in the command palette and keep their shortcuts. Edit > Menus, Keyboard Shortcuts and Preferences cannot be hidden.');
    this.render();
    this.open(this.pick);
  }

  private apply(patch: Partial<ReturnType<typeof loadPrefs>>): void { updatePrefs(patch); this.onChange(); this.render(); }

  private rows(): Row[] {
    const def = this.menus().find((d) => d.label === this.pick.value);
    const out: Row[] = [], seen = new Set<string>();
    const walk = (items: MenuItem[], depth: number, path: string): void => {
      for (const i of items) {
        if (i === '-') continue;
        if (typeof i === 'object') { out.push({ key: `${path}/${i.label}`, id: '', label: i.label, depth, head: true }); walk(i.items, depth + 1, `${path}/${i.label}`); continue; }
        const cmd = this.commands.get(i);
        if (!cmd || seen.has(i)) continue;
        seen.add(i);
        out.push({ key: `${path}#${i}`, id: i, label: this.commands.label(cmd).replace(/\.\.\.$/, ''), depth, head: false });
      }
    };
    if (def) walk(typeof def.items === 'function' ? def.items() : def.items, 0, def.label);
    return out;
  }

  private render(): void {
    const p = loadPrefs(), hidden = new Set(p.menuHidden);
    patchList(this.list, this.rows(), {
      key: (r) => r.key,
      create: (r) => {
        const n = el(r.head
          ? '<div class="cv-list-row"><span class="cv-list-name"></span></div>'
          : `<div class="cv-list-row"><label class="cv-check"><input type="checkbox" data-role="shown"><span class="cv-list-name"></span></label><select class="cv-select" data-role="color" aria-label="Color"><option value="">No color</option>${MENU_COLORS.map((c) => `<option value="${c}">${cap(c)}</option>`).join('')}</select></div>`);
        n.style.paddingLeft = `${8 + r.depth * 16}px`;
        if (r.head) { n.style.fontWeight = '600'; setText(q(n, '.cv-list-name'), r.label); return n; }
        setText(q(n, '.cv-list-name'), r.label);
        const box = q<HTMLInputElement>(n, '[data-role="shown"]'), col = q<HTMLSelectElement>(n, '[data-role="color"]');
        box.disabled = MENU_KEEP.includes(r.id);
        box.checked = !hidden.has(r.id) || box.disabled;
        col.value = p.menuColors[r.id] ?? '';
        box.addEventListener('change', () => {
          const cur = new Set(loadPrefs().menuHidden);
          if (box.checked) cur.delete(r.id); else cur.add(r.id);
          updatePrefs({ menuHidden: [...cur] }); this.onChange();
        });
        col.addEventListener('change', () => {
          const cur = { ...loadPrefs().menuColors };
          if (col.value) cur[r.id] = col.value; else delete cur[r.id];
          updatePrefs({ menuColors: cur }); this.onChange();
        });
        return n;
      },
      update: (n, r) => {
        if (r.head) return;
        setChecked(q<HTMLInputElement>(n, '[data-role="shown"]'), !hidden.has(r.id) || MENU_KEEP.includes(r.id));
        setValue(q<HTMLSelectElement>(n, '[data-role="color"]'), p.menuColors[r.id] ?? '');
      },
    });
  }
}
