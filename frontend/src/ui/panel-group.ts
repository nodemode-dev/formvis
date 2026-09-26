import { el, setHidden, setText } from './dom';
import { icon } from './icons';

/** A panel group as the target's (Phase 21, UI_SPEC.md section 6): a black header strip whose tabs are chips (the active
 *  one filled, the others plain text), with − at the right to minimise the group to its header (remembered on this
 *  device); the body shows the active tab's content. The header carries .cv-panel-head, so the dock moves the group by
 *  it as it moves the other panels. */
export interface GroupTab { id: string; label: string; body: HTMLElement }

const KEY = 'sonny.groups';
function loadState(): Record<string, { tab?: string; min?: boolean }> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, { tab?: string; min?: boolean }>; } catch { return {}; }
}
function saveState(id: string, patch: { tab?: string; min?: boolean }): void {
  try { const s = loadState(); s[id] = { ...s[id], ...patch }; localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* this session only */ }
}

export class PanelGroup {
  readonly root: HTMLElement;
  private readonly tabs = new Map<string, { btn: HTMLButtonElement; body: HTMLElement }>();
  private active = '';
  onTab: ((id: string) => void) | null = null;

  constructor(host: HTMLElement, readonly id: string, list: readonly GroupTab[], label: string) {
    this.root = el(`<section class="cv-${id} cv-group" aria-label="${label}"><div class="cv-panel-head cv-group-head"><div class="cv-group-tabs" role="tablist"></div><span></span><button class="cv-group-min" type="button" data-cmd="minimise" title="Minimise" aria-label="Minimise">${icon('minus', 12)}</button></div><div class="cv-group-body"></div></section>`);
    const strip = this.root.querySelector('.cv-group-tabs') as HTMLElement, body = this.root.querySelector('.cv-group-body') as HTMLElement;
    for (const t of list) {
      const btn = el<HTMLButtonElement>('<button class="cv-group-tab" type="button" role="tab"></button>');
      setText(btn, t.label);
      btn.dataset.tab = t.id;
      btn.addEventListener('click', () => this.show(t.id));
      strip.appendChild(btn);
      t.body.classList.add('cv-group-page');
      body.appendChild(t.body);
      this.tabs.set(t.id, { btn, body: t.body });
    }
    const saved = loadState()[id] ?? {};
    this.show(saved.tab && this.tabs.has(saved.tab) ? saved.tab : list[0].id, false);
    this.setMinimised(!!saved.min, false);
    (this.root.querySelector('.cv-group-min') as HTMLElement).addEventListener('click', () => this.setMinimised(!this.root.classList.contains('is-min')));
    host.appendChild(this.root);
  }

  get current(): string { return this.active; }

  show(id: string, remember = true): void {
    if (!this.tabs.has(id)) return;
    this.active = id;
    for (const [tid, t] of this.tabs) {
      const on = tid === id;
      t.btn.classList.toggle('is-active', on);
      t.btn.setAttribute('aria-selected', String(on));
      setHidden(t.body, !on);
    }
    if (remember) saveState(this.id, { tab: id });
    this.onTab?.(id);
  }

  setMinimised(min: boolean, remember = true): void {
    this.root.classList.toggle('is-min', min);
    setHidden(this.root.querySelector('.cv-group-body') as HTMLElement, min);
    if (remember) saveState(this.id, { min });
  }
}
