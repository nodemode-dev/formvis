import { Dialog } from './dialogs';
import { el, patchList, q, setClass, setHidden, setText } from './dom';
import { clearNoticeHistory, noticeHistory, onNoticeHistory, type NoticeRecord } from './toast';

const SHOWN = 100;

/** Window > Notices: the notices shown so far, newest first, each with its time and how many times it came in a row. Built
 *  once; the rows are patched in place as notices arrive while it is open. */
export class NoticesDialog extends Dialog {
  private readonly list = el('<div class="cv-notices-list" role="list" aria-label="Notices"></div>');
  private readonly empty = el('<p class="cv-note" hidden>No notices yet.</p>');
  private frame = 0;

  constructor() {
    super('Notices', 520);
    this.body.append(this.list, this.empty);
    this.button('Clear', 'ghost', () => clearNoticeHistory());
    this.button('Close', 'primary', () => this.close());
    onNoticeHistory(() => { if (this.isOpen && !this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); }); });
  }

  show(): void {
    if (this.isOpen) return;
    this.render();
    this.open();
  }

  private render(): void {
    const items = [...noticeHistory()].reverse().slice(0, SHOWN);
    patchList(this.list, items, {
      key: (r) => String(r.id),
      create: (r) => { const n = el('<div class="cv-list-row cv-notice-row" role="listitem"><span class="cv-notice-dot"></span><span class="cv-list-name"></span><span class="cv-list-meta"></span></div>'); this.fill(n, r); return n; },
      update: (n, r) => this.fill(n, r),
    });
    setHidden(this.empty, items.length > 0);
  }

  private fill(n: HTMLElement, r: NoticeRecord): void {
    setText(q(n, '.cv-list-name'), r.text);
    setText(q(n, '.cv-list-meta'), `${r.count > 1 ? `x${r.count} · ` : ''}${new Date(r.at).toLocaleTimeString()}`);
    setClass(n, 'is-error', r.kind === 'error');
  }
}
