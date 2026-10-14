import { isMac, q } from './dom';

export type StickyKey = 'shift' | 'alt' | 'mod';
type StickyMode = 'off' | 'next' | 'latched';

const KEYS: readonly StickyKey[] = ['shift', 'alt', 'mod'];
const modes: Record<StickyKey, StickyMode> = { shift: 'off', alt: 'off', mod: 'off' };
const listeners = new Set<() => void>();
const DOUBLE_TAP_MS = 350;

function emit(): void { for (const fn of listeners) fn(); }

/** The sticky modifiers (DEV_PLAN 35.3 part c): what the Modifier Keys panel holds for pen and touch users. The stage
 *  ORs these into each pointer's shift, alt and mod flags. */
export const stickyModifiers = {
  /** Whether a modifier is held, for the next gesture or latched. */
  active(k: StickyKey): boolean { return modes[k] !== 'off'; },
  latched(k: StickyKey): boolean { return modes[k] === 'latched'; },
  /** A tap: off turns on for one gesture; on turns off. */
  tap(k: StickyKey): void { modes[k] = modes[k] === 'off' ? 'next' : 'off'; emit(); },
  /** A double tap: latch until tapped again. */
  latch(k: StickyKey): void { modes[k] = 'latched'; emit(); },
  /** The end of a gesture: modifiers held for one gesture are released; latched ones stay. */
  endGesture(): void {
    let changed = false;
    for (const k of KEYS) if (modes[k] === 'next') { modes[k] = 'off'; changed = true; }
    if (changed) emit();
  },
  subscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; },
};

/** The Modifier Keys panel (Window > Modifier Keys): Shift, Alt (Option) and Ctrl (Cmd) buttons. One tap holds the
 *  modifier for the next canvas gesture; a double tap holds it until tapped again. Built once; only aria-pressed and
 *  the is-latched class change. */
export class ModifierKeysPanel {
  private readonly buttons = new Map<StickyKey, HTMLButtonElement>();
  private readonly lastTap = new Map<StickyKey, number>();

  constructor(root: HTMLElement) {
    const label: Record<StickyKey, string> = { shift: 'Shift', alt: isMac ? 'Option' : 'Alt', mod: isMac ? 'Cmd' : 'Ctrl' };
    root.insertAdjacentHTML('beforeend',
      `<section class="cv-modifier-keys" aria-label="Modifier Keys">` +
      `<div class="cv-panel-head"><span class="cv-comps-title"><span>Modifier Keys</span></span></div>` +
      `<div class="cv-modkeys-row">${KEYS.map((k) => `<button class="cv-modkey" type="button" data-key="${k}" aria-pressed="false">${label[k]}</button>`).join('')}</div>` +
      `<div class="cv-modkeys-hint">Tap for the next stroke; tap twice to hold.</div></section>`);
    const section = q(root, '.cv-modifier-keys');
    for (const b of Array.from(section.querySelectorAll<HTMLButtonElement>('.cv-modkey'))) this.buttons.set(b.dataset.key as StickyKey, b);
    section.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.cv-modkey');
      if (!b) return;
      const k = b.dataset.key as StickyKey, now = performance.now(), prev = this.lastTap.get(k) ?? -Infinity;
      if (now - prev < DOUBLE_TAP_MS) { this.lastTap.set(k, -Infinity); stickyModifiers.latch(k); return; }
      this.lastTap.set(k, now);
      stickyModifiers.tap(k);
    });
    stickyModifiers.subscribe(() => this.sync());
    this.sync();
  }

  private sync(): void {
    for (const [k, b] of this.buttons) {
      const on = stickyModifiers.active(k);
      if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-latched', stickyModifiers.latched(k));
    }
  }
}
