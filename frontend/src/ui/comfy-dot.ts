import { api } from '../io/api';
import { setClass, setTitle } from './dom';
import { t } from './i18n';

const EVERY = 30000;

/** The title bar's ComfyUI connection dot: a badge on the brand icon (no space of its own), built once. It asks the
 *  user's own ComfyUI address how it is every 30 seconds while the window is visible and the dot is on. */
export class ComfyDot {
  private readonly dot = document.createElement('span');
  private timer = 0;
  private on = false;
  private seq = 0;
  /** How many times the dot has asked, for checks. */
  polls = 0;

  constructor(brand: HTMLElement, private readonly address: () => string, private readonly wanted: () => boolean) {
    this.dot.className = 'cv-comfy-dot';
    this.dot.setAttribute('aria-hidden', 'true');
    brand.append(this.dot);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.sync(); });
    this.sync();
  }

  /** Called when the setting or the address changes: starts or stops the polling and shows or hides the dot. */
  sync(): void {
    const want = this.wanted();
    if (want === this.on) { if (want) void this.poll(); return; }
    this.on = want;
    window.clearInterval(this.timer);
    this.seq++;
    setClass(this.dot, 'is-on', want);
    if (!want) { setClass(this.dot, 'is-up', false); setClass(this.dot, 'is-down', false); setTitle(this.dot, ''); return; }
    this.timer = window.setInterval(() => { if (!document.hidden) this.sync(); }, EVERY);
    void this.poll();
  }

  private async poll(): Promise<void> {
    const mine = ++this.seq, url = this.address();
    this.polls++;
    const s = await api.comfyuiStatus(url);
    if (mine !== this.seq || !this.on) return;
    setClass(this.dot, 'is-up', !!s?.running);
    setClass(this.dot, 'is-down', !s?.running);
    setTitle(this.dot, s?.running ? `${t('ComfyUI connected')}${s.version ? ` ${s.version}` : ''} · ${url}` : `${t('ComfyUI not reachable')} · ${url}`);
  }

  get active(): boolean { return this.on; }
}
