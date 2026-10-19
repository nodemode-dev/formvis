import { q, setClass, setHidden, setTitle } from './dom';
import { icon } from './icons';

/** Windows and Linux in the desktop app can draw their own title bar: the system's frame is taken off and the title bar
 *  carries Minimize, Maximize or Restore and Close at its right end, with a drag on its empty parts and a double click
 *  that maximizes. macOS keeps its own frame and traffic lights (its menus are the system's). The buttons are built once;
 *  turning the option on or off shows or hides them and calls the window. Close goes through the window's close request,
 *  so unsaved documents are asked about first. */
export const wantsCustomTitleBar = (): boolean => '__TAURI_INTERNALS__' in window && !/Mac/.test(navigator.platform);

/** macOS in the desktop app: the window's title bar is an overlay (src-tauri/src/main.rs), so the page's own title bar
 *  row is the window's title row: the traffic lights sit at its left, and its empty parts drag the window and zoom it
 *  on a double click through Tauri's drag regions. */
export const wantsOverlayTitleBar = (): boolean => '__TAURI_INTERNALS__' in window && /Mac/.test(navigator.platform);

type Win = ReturnType<typeof import('@tauri-apps/api/window').getCurrentWindow>;

export class CaptionButtons {
  private readonly box = document.createElement('div');
  private win: Promise<Win> | null = null;
  private on = false;
  private maximized = false;

  constructor(private readonly header: HTMLElement, private readonly wanted: () => boolean) {
    this.box.className = 'cv-caption';
    this.box.hidden = true;
    this.box.innerHTML =
      `<button class="cv-caption-btn" type="button" data-cap="min" title="Minimize" aria-label="Minimize">${icon('capMin', 16)}</button>` +
      `<button class="cv-caption-btn" type="button" data-cap="max" title="Maximize" aria-label="Maximize">${icon('capMax', 16)}</button>` +
      `<button class="cv-caption-btn is-close" type="button" data-cap="close" title="Close" aria-label="Close">${icon('close', 16)}</button>`;
    header.append(this.box);
    if (wantsOverlayTitleBar()) {
      document.documentElement.classList.add('has-overlay-titlebar');
      for (const n of [header, ...header.querySelectorAll('.cv-tb-doc, .cv-tb-app, .cv-zoom, .cv-sep, .cv-zoom-label, .cv-title-tools')]) n.setAttribute('data-tauri-drag-region', '');
    }
    this.box.addEventListener('click', (e) => {
      const b = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-cap]') : null;
      if (b) void this.act(b.dataset.cap ?? '');
    });
    header.addEventListener('pointerdown', (e) => { if (this.on && e.button === 0 && this.empty(e) && e.detail === 1) void this.use((w) => w.startDragging()); });
    header.addEventListener('dblclick', (e) => { if (this.on && this.empty(e)) void this.act('max'); });
    window.addEventListener('resize', () => { if (this.on) void this.look(); });
    this.sync();
  }

  get active(): boolean { return this.on; }

  /** Called when the option changes (and once at start): takes the system frame off or puts it back. */
  sync(): void {
    const want = wantsCustomTitleBar() && this.wanted();
    if (want === this.on) return;
    this.on = want;
    setHidden(this.box, !want);
    setClass(document.documentElement, 'has-caption-buttons', want);
    void this.use((w) => w.setDecorations(!want)).then(() => this.look());
  }

  private empty(e: Event): boolean {
    const t = e.target;
    return t === this.header || (t instanceof HTMLElement && (t.classList.contains('cv-menubar') || t.classList.contains('cv-zoom')));
  }

  private async use<T>(run: (w: Win) => Promise<T>): Promise<T | undefined> {
    try {
      this.win ??= import('@tauri-apps/api/window').then((m) => m.getCurrentWindow());
      return await run(await this.win);
    } catch { return undefined; }
  }

  private async act(what: string): Promise<void> {
    if (what === 'min') await this.use((w) => w.minimize());
    else if (what === 'max') { await this.use((w) => w.toggleMaximize()); await this.look(); }
    else if (what === 'close') await this.use((w) => w.close());
  }

  /** The Maximize button shows Restore while the window is maximized. */
  private async look(): Promise<void> {
    const now = !!(await this.use((w) => w.isMaximized()));
    if (now === this.maximized && this.box.dataset.shown) return;
    this.maximized = now;
    this.box.dataset.shown = '1';
    const b = q<HTMLElement>(this.box, '[data-cap="max"]');
    b.innerHTML = icon(now ? 'capRestore' : 'capMax', 16);
    setTitle(b, now ? 'Restore' : 'Maximize');
    b.setAttribute('aria-label', now ? 'Restore' : 'Maximize');
  }
}
