import { el, patchList, setHidden, setText } from '../dom';
import type { ReferencePicker } from './references';

/** The chosen reference layers as chips under a prompt: each chip is @img1, @img2 and on, in the order the pictures are
 *  sent. Click a chip for its menu (put the token in the prompt, move earlier or later, remove), or drag a chip to
 *  reorder; the @img tokens already in the prompt follow their pictures. Built once; chips are patched in place. */
export class ReferenceChips {
  readonly el = el('<div class="cv-chips" role="group" aria-label="Reference chips"></div>');
  private readonly list = el('<div class="cv-chips-list"></div>');
  private readonly menu = el('<div class="cv-chip-menu" role="menu" hidden><button type="button" class="cv-btn cv-btn-ghost" role="menuitem" data-act="insert">Put in prompt</button><button type="button" class="cv-btn cv-btn-ghost" role="menuitem" data-act="earlier">Move earlier</button><button type="button" class="cv-btn cv-btn-ghost" role="menuitem" data-act="later">Move later</button><button type="button" class="cv-btn cv-btn-ghost" role="menuitem" data-act="remove">Remove</button></div>');
  private readonly pick = el('<div class="cv-chip-pick" role="listbox" aria-label="References" hidden></div>');
  private pickAt = 0;
  private order: string[] = [];
  private open: string | null = null;
  private drag: { id: string; x: number; y: number; moving: boolean; over: HTMLElement | null } | null = null;

  constructor(private readonly picker: ReferencePicker, private readonly field: HTMLInputElement | HTMLTextAreaElement) {
    this.el.append(this.list, this.menu, this.pick);
    field.addEventListener('input', () => this.atList());
    field.addEventListener('keydown', (e: Event) => this.atKey(e as KeyboardEvent));
    field.addEventListener('blur', () => window.setTimeout(() => setHidden(this.pick, true), 150));
    this.pick.addEventListener('pointerdown', (e) => e.preventDefault());
    this.pick.addEventListener('click', (e) => { const row = (e.target as HTMLElement).closest<HTMLElement>('[data-key]'); if (row) this.choose(row.dataset.key as string); });
    picker.el.addEventListener('change', () => this.sync());
    new MutationObserver(() => this.sync()).observe(picker.el, { childList: true, subtree: true });
    this.list.addEventListener('pointerdown', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('.cv-chip');
      if (!chip || e.button !== 0) return;
      this.drag = { id: chip.dataset.key as string, x: e.clientX, y: e.clientY, moving: false, over: null };
    });
    this.list.addEventListener('pointermove', (e) => this.dragMove(e));
    this.list.addEventListener('pointerup', (e) => this.dragEnd(e));
    this.list.addEventListener('pointercancel', () => this.dragStop());
    this.list.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('.cv-chip');
      if (chip && e.detail === 0) this.toggle(chip.dataset.key as string);   // the keyboard; the pointer is handled on release
    });
    this.menu.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('button[data-act]')?.dataset.act, id = this.open;
      if (!act || !id) return;
      const at = this.order.indexOf(id);
      if (act === 'insert') this.insert(at + 1);
      else if (act === 'earlier') this.move(id, at - 1);
      else if (act === 'later') this.move(id, at + 1);
      else if (act === 'remove') { this.toggle(id); this.uncheck(id); }
    });
    this.sync();
  }

  private boxes(): HTMLInputElement[] { return [...this.picker.el.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].filter((b) => b.checked && !b.disabled); }

  private nameOf(id: string): string {
    const box = [...this.picker.el.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].find((b) => b.value === id);
    return box?.nextElementSibling?.textContent ?? id;
  }

  /** The tokens in order, from the layers chosen now: kept in the order they were in, new ones last. */
  sync(): void {
    const ids = this.boxes().map((b) => b.value), next = [...this.order.filter((id) => ids.includes(id)), ...ids.filter((id) => !this.order.includes(id))];
    if (next.length === this.order.length && next.every((id, i) => id === this.order[i]) && this.list.childElementCount === next.length) { this.paint(); return; }
    this.order = next;
    if (this.open && !next.includes(this.open)) this.open = null;
    this.paint();
  }

  private paint(): void {
    patchList(this.list, this.order.map((id, i) => ({ id, i })), {
      key: (c) => c.id,
      create: (c) => {
        const b = el<HTMLButtonElement>('<button type="button" class="cv-chip" aria-haspopup="menu"><span class="cv-chip-tok"></span><span class="cv-chip-name"></span></button>');
        this.fill(b, c);
        return b;
      },
      update: (b, c) => this.fill(b as HTMLButtonElement, c),
    });
    setHidden(this.list, this.order.length === 0);
    const menuOpen = this.open !== null && this.order.includes(this.open);
    setHidden(this.menu, !menuOpen);
    if (menuOpen) {
      const at = this.order.indexOf(this.open as string);
      (this.menu.querySelector('[data-act=earlier]') as HTMLButtonElement).disabled = at === 0;
      (this.menu.querySelector('[data-act=later]') as HTMLButtonElement).disabled = at === this.order.length - 1;
    }
  }

  private fill(b: HTMLButtonElement, c: { id: string; i: number }): void {
    setText(b.firstElementChild as HTMLElement, `@img${c.i + 1}`);
    setText(b.lastElementChild as HTMLElement, this.nameOf(c.id));
    const expanded = String(this.open === c.id);
    if (b.getAttribute('aria-expanded') !== expanded) b.setAttribute('aria-expanded', expanded);
    b.classList.toggle('is-open', this.open === c.id);
  }

  private toggle(id: string): void { this.open = this.open === id ? null : id; this.paint(); }

  private uncheck(id: string): void {
    const box = [...this.picker.el.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].find((b) => b.value === id);
    if (!box) return;
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** Puts @imgN in the prompt at the caret. */
  private insert(n: number): void {
    const f = this.field, at = f.selectionStart ?? f.value.length, end = f.selectionEnd ?? at, tok = `@img${n}`;
    const pad = at > 0 && !/\s/.test(f.value[at - 1]) ? ' ' : '';
    f.value = `${f.value.slice(0, at)}${pad}${tok} ${f.value.slice(end)}`;
    const caret = at + pad.length + tok.length + 1;
    f.setSelectionRange(caret, caret);
    f.focus();
    f.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** Moves a chip to a place in the order; the tokens in the prompt follow their pictures. */
  move(id: string, to: number): void {
    const from = this.order.indexOf(id);
    if (from < 0 || to < 0 || to >= this.order.length || to === from) return;
    const before = this.order.slice();
    this.order.splice(from, 1);
    this.order.splice(to, 0, id);
    const re = (s: string): string => s.replace(/@img(\d+)\b/gi, (m, n: string) => { const id0 = before[Number(n) - 1]; const at = id0 ? this.order.indexOf(id0) : -1; return at < 0 ? m : `@img${at + 1}`; });
    const text = re(this.field.value);
    if (text !== this.field.value) { this.field.value = text; this.field.dispatchEvent(new Event('input', { bubbles: true })); }
    this.paint();
  }

  private dragMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (!d.moving) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
      d.moving = true;
      this.list.setPointerCapture(e.pointerId);
      this.list.querySelector(`[data-key="${CSS.escape(d.id)}"]`)?.classList.add('is-drag');
    }
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.cv-chip') ?? null;
    if (over === d.over) return;
    d.over?.classList.remove('is-over');
    d.over = over && over.dataset.key !== d.id ? over : null;
    d.over?.classList.add('is-over');
  }

  private dragEnd(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const over = d.over?.dataset.key, id = d.id, moved = d.moving;
    this.dragStop();
    if (!moved) { this.toggle(id); return; }
    if (over) this.move(id, this.order.indexOf(over));
    if (this.list.hasPointerCapture(e.pointerId)) this.list.releasePointerCapture(e.pointerId);
  }

  private dragStop(): void {
    this.drag?.over?.classList.remove('is-over');
    this.list.querySelector('.is-drag')?.classList.remove('is-drag');
    this.drag = null;
  }

  /** The @ being typed just before the caret, with the letters after it. */
  private typed(): { from: number; to: number; word: string } | null {
    const f = this.field, to = f.selectionStart ?? f.value.length, m = /(^|\s)@(\w*)$/.exec(f.value.slice(0, to));
    return m ? { from: to - m[2].length - 1, to, word: m[2].toLowerCase() } : null;
  }

  /** The pictures the list offers: every reference layer the picker has, those matching what follows the @. */
  private offered(word: string): Array<{ id: string; name: string }> {
    const all = [...this.picker.el.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].filter((b) => !b.disabled || b.checked);
    return all.map((b) => ({ id: b.value, name: this.nameOf(b.value) })).filter((x) => !word || x.name.toLowerCase().includes(word) || `img${this.order.indexOf(x.id) + 1}`.startsWith(word));
  }

  /** The @ list: opens while an @ is typed at the start of a word, one row per reference layer, patched in place. */
  private atList(): void {
    const t = this.typed(), rows = t ? this.offered(t.word) : [];
    if (!t || !rows.length) { setHidden(this.pick, true); return; }
    this.pickAt = Math.min(this.pickAt, rows.length - 1);
    patchList(this.pick, rows, {
      key: (r) => r.id,
      create: (r) => { const b = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" role="option"></button>'); this.fillRow(b, r, false); return b; },
      update: (b, r) => this.fillRow(b as HTMLButtonElement, r, rows.indexOf(r) === this.pickAt),
    });
    setHidden(this.pick, false);
  }

  private fillRow(b: HTMLButtonElement, r: { id: string; name: string }, on: boolean): void {
    const at = this.order.indexOf(r.id), text = at >= 0 ? `@img${at + 1}  ${r.name}` : r.name;
    if (b.textContent !== text) setText(b, text);
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', String(on));
  }

  private atKey(e: KeyboardEvent): void {
    if (this.pick.hidden) return;
    const rows = [...this.pick.children] as HTMLElement[];
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setHidden(this.pick, true); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.pickAt = (this.pickAt + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
      rows.forEach((r, i) => { r.classList.toggle('is-active', i === this.pickAt); r.setAttribute('aria-selected', String(i === this.pickAt)); });
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') { const id = rows[this.pickAt]?.dataset.key; if (id) { e.preventDefault(); e.stopPropagation(); this.choose(id); } }
  }

  /** Chooses a reference from the @ list: ticks it in the picker when it is not, and writes its @imgN token over the @. */
  private choose(id: string): void {
    const t = this.typed(), box = [...this.picker.el.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].find((b) => b.value === id);
    if (!t || !box) { setHidden(this.pick, true); return; }
    if (!box.checked) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
    const n = this.order.indexOf(id) + 1;
    if (n < 1) { setHidden(this.pick, true); return; }
    const f = this.field, tok = `@img${n} `;
    f.value = `${f.value.slice(0, t.from)}${tok}${f.value.slice(t.to)}`;
    f.setSelectionRange(t.from + tok.length, t.from + tok.length);
    this.pickAt = 0;
    setHidden(this.pick, true);
    f.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** The chosen pictures in the chips' order, as the picker makes them. */
  async ordered(): Promise<Array<{ name: string; blob: Blob }>> {
    const ids = this.boxes().map((b) => b.value), got = await this.picker.chosen(), byId = new Map<string, { name: string; blob: Blob }>();
    ids.forEach((id, i) => { if (got[i]) byId.set(id, got[i]); });
    return this.order.map((id) => byId.get(id)).filter((x): x is { name: string; blob: Blob } => !!x);
  }
}
