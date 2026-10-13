import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { api, socketTo, type TerminalInfo } from '../io/api';
import { el, isMac, q, setDisabled, setText } from './dom';
import { icon } from './icons';

const KEY = 'formvis.terminal';
const MIN_H = 120;

interface Tab {
  id: string;
  term: Terminal;
  fit: FitAddon;
  host: HTMLElement;
  tab: HTMLElement;
  socket: WebSocket | null;
  agent: boolean;
}

function token(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function saved(): { open: boolean; h: number } {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { open?: boolean; h?: number };
    return { open: s.open === true, h: typeof s.h === 'number' ? s.h : 280 };
  } catch { return { open: false, h: 280 }; }
}

function keep(open: boolean, h: number): void {
  try { localStorage.setItem(KEY, JSON.stringify({ open, h })); } catch { return; }
}

/** The terminal dock (DEV_PLAN 28.5): the window's bottom band of engine PTYs, one tab each, plus the read-only Claude tab.
 *  Its open state and height live on documentElement (data-ft-dock, data-ft-dock-h, --ft-dock-size), written before the
 *  first paint by index.html's boot script, so the band's row is reserved from the first frame and opening moves nothing. */
export class TerminalDock {
  readonly root = el(`<section class="ft-dock" aria-label="Terminal">
    <div class="ft-dock-grip" role="separator" aria-orientation="horizontal" aria-label="Resize the terminal"></div>
    <div class="ft-dock-head">
      <div class="ft-dock-tabs" role="tablist"></div>
      <span class="ft-dock-spacer"></span>
      <button type="button" class="cv-icon-btn ft-dock-new" aria-label="New terminal" title="New terminal">${icon('plus', 16)}</button>
      <button type="button" class="cv-icon-btn ft-dock-restart" aria-label="Restart terminal" title="Restart this terminal's shell">${icon('refresh', 16)}</button>
      <button type="button" class="cv-icon-btn ft-dock-hide" aria-label="Hide terminal" title="Hide terminal (${isMac ? 'Cmd' : 'Ctrl'}+J); the shells keep running">${icon('chevronDown', 16)}</button>
    </div>
    <div class="ft-dock-stage"></div>
  </section>`);
  private readonly tabsEl = q(this.root, '.ft-dock-tabs');
  private readonly stage = q(this.root, '.ft-dock-stage');
  private readonly restartBtn = q<HTMLButtonElement>(this.root, '.ft-dock-restart');
  private readonly tabs = new Map<string, Tab>();
  private active: string | null = null;
  private started = false;
  private pending: Promise<void> | null = null;
  onChange: () => void = () => undefined;

  constructor() {
    const html = document.documentElement;
    q(this.root, '.ft-dock-new').addEventListener('click', () => void this.open());
    q(this.root, '.ft-dock-hide').addEventListener('click', () => this.toggle(false));
    this.restartBtn.addEventListener('click', () => void this.restart());
    new ResizeObserver(() => this.fitActive()).observe(this.stage);
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.code === 'KeyJ' && !e.repeat) { e.preventDefault(); e.stopPropagation(); this.toggle(); }
    }, true);
    document.addEventListener('nm:ui-settings-changed', () => { for (const t of this.tabs.values()) t.term.options.theme = this.theme(); });
    this.grip(q(this.root, '.ft-dock-grip'), html);
    if (this.isOpen()) void this.ensure();
  }

  isOpen(): boolean { return document.documentElement.getAttribute('data-ft-dock') === 'open'; }

  toggle(on = !this.isOpen()): void {
    const html = document.documentElement;
    html.setAttribute('data-ft-dock', on ? 'open' : 'closed');
    keep(on, this.height());
    this.onChange();
    window.dispatchEvent(new Event('resize'));
    if (on) void this.ensure();
  }

  async newTerminal(): Promise<void> {
    if (!this.isOpen()) this.toggle(true);
    else await this.open();
  }

  async sync(): Promise<void> {
    if (!this.started) return;
    for (const t of await this.list()) if (t.kind === 'agent') this.adopt(t);
  }

  private height(): number {
    const h = Number(document.documentElement.getAttribute('data-ft-dock-h'));
    return Number.isFinite(h) && h >= MIN_H ? h : saved().h;
  }

  private grip(grip: HTMLElement, html: HTMLElement): void {
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const bottom = this.root.getBoundingClientRect().bottom;
      const move = (ev: PointerEvent): void => {
        const h = Math.round(Math.min(window.innerHeight * 0.7, Math.max(MIN_H, bottom - ev.clientY)));
        html.setAttribute('data-ft-dock-h', String(h));
        html.style.setProperty('--ft-dock-size', `${h}px`);
      };
      const up = (): void => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        keep(this.isOpen(), this.height());
        window.dispatchEvent(new Event('resize'));
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
  }

  private async list(): Promise<TerminalInfo[]> {
    try { return await api.terminals(); } catch { return []; }
  }

  private ensure(): Promise<void> {
    this.pending ??= this.boot().finally(() => { this.pending = null; });
    return this.pending;
  }

  private async boot(): Promise<void> {
    if (!this.started) {
      this.started = true;
      const listed = await this.list();
      for (const t of listed) this.adopt(t);
    }
    if (![...this.tabs.values()].some((t) => !t.agent)) await this.open();
    this.fitActive();
    this.focus();
  }

  focus(): void {
    if (this.active) this.tabs.get(this.active)?.term.focus();
  }

  private theme() {
    return {
      background: token('--bg-primary', '#111111'),
      foreground: token('--text-primary', '#f7f7f7'),
      cursor: token('--accent-color', '#f97316'),
      cursorAccent: token('--bg-primary', '#111111'),
      selectionBackground: token('--accent-color-dim', '#f9731633'),
    };
  }

  private adopt(info: TerminalInfo): void {
    if (this.tabs.has(info.id)) return;
    this.mount(info, this.active === null || info.kind !== 'agent');
  }

  private async open(): Promise<void> {
    try {
      const info = await api.openTerminal(100, 24);
      this.mount(info, true);
    } catch { return; }
  }

  private mount(info: TerminalInfo, show: boolean): void {
    const agent = info.kind === 'agent';
    const term = new Terminal({
      fontFamily: token('--font-mono', 'monospace'), fontSize: 13, lineHeight: 1.25, cursorBlink: !agent, disableStdin: agent,
      scrollback: 5000, theme: this.theme(), overviewRuler: { width: 0 },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    const host = el('<div class="ft-term" hidden></div>');
    const tab = el(`<button type="button" class="ft-dock-tab" role="tab"><span class="ft-dock-tab-title"></span><span class="ft-dock-tab-x" aria-label="Close terminal">${icon('close', 12)}</span></button>`);
    setText(q(tab, '.ft-dock-tab-title'), info.title);
    tab.classList.toggle('is-agent', agent);
    if (agent) tab.title = "Claude's commands, read only";
    tab.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.ft-dock-tab-x')) void this.close(info.id);
      else this.select(info.id);
    });
    this.stage.appendChild(host);
    this.tabsEl.appendChild(tab);
    const t: Tab = { id: info.id, term, fit, host, tab, socket: null, agent };
    this.tabs.set(info.id, t);
    term.open(host);
    if (agent) term.write('\x1b[?25l');
    if (show) this.select(info.id, !agent);
    this.connect(t);
  }

  private connect(t: Tab): void {
    const socket = socketTo(`/terminal/${t.id}/stream`);
    socket.binaryType = 'arraybuffer';
    t.socket = socket;
    socket.addEventListener('open', () => this.sendSize(t));
    socket.addEventListener('message', (msg) => {
      if (typeof msg.data === 'string') { t.term.write(msg.data); return; }
      try {
        const ctl = JSON.parse(new TextDecoder().decode(msg.data as ArrayBuffer)) as { type?: string };
        if (ctl.type === 'exit') t.term.write('\r\n\x1b[2m[shell exited]\x1b[0m\r\n');
      } catch { return; }
    });
    t.term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'input', data }));
    });
  }

  private sendSize(t: Tab): void {
    if (t.socket?.readyState === WebSocket.OPEN) t.socket.send(JSON.stringify({ type: 'resize', cols: t.term.cols, rows: t.term.rows }));
  }

  private fitActive(): void {
    const t = this.active ? this.tabs.get(this.active) : null;
    if (!t || t.host.hidden || this.stage.clientHeight < 20) return;
    const before = `${t.term.cols}x${t.term.rows}`;
    t.fit.fit();
    if (`${t.term.cols}x${t.term.rows}` !== before) this.sendSize(t);
  }

  private select(id: string, focus = true): void {
    this.active = id;
    for (const [tid, t] of this.tabs) {
      const on = tid === id;
      if (t.host.hidden === on) t.host.hidden = !on;
      t.tab.classList.toggle('is-on', on);
      t.tab.setAttribute('aria-selected', String(on));
    }
    setDisabled(this.restartBtn, !!this.tabs.get(id)?.agent);
    this.fitActive();
    if (focus) this.focus();
  }

  private async restart(): Promise<void> {
    const t = this.active ? this.tabs.get(this.active) : null;
    if (!t || t.agent) return;
    try { await api.restartTerminal(t.id); } catch { return; }
    this.sendSize(t);
    t.term.focus();
  }

  private async close(id: string): Promise<void> {
    const t = this.tabs.get(id);
    if (!t) return;
    t.socket?.close();
    t.term.dispose();
    t.host.remove();
    t.tab.remove();
    this.tabs.delete(id);
    try { await api.closeTerminal(id); } catch { /* the session was already gone */ }
    if (this.active === id) {
      this.active = null;
      const next = [...this.tabs.keys()].pop();
      if (next) this.select(next);
    }
    if (this.tabs.size === 0) this.toggle(false);
  }
}
