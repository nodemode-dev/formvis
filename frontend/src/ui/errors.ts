import { VERSION } from '../version';

export interface ErrorEntry { at: number; what: string; message: string }

export class ErrorLog {
  readonly entries: ErrorEntry[] = [];
  private lastShown = 0;

  constructor(private readonly show: (text: string) => void, private readonly extra: () => ErrorEntry[] = () => []) {}

  install(): void {
    window.addEventListener('error', (e) => {
      if (!(e.error instanceof Error) && !e.message) return;
      this.add('Uncaught error', e.error instanceof Error ? `${e.error.name}: ${e.error.message}` : e.message);
    });
    window.addEventListener('unhandledrejection', (e) => {
      const r: unknown = e.reason;
      this.add('Unfinished task', r instanceof Error ? `${r.name}: ${r.message}` : String(r));
    });
  }

  add(what: string, message: string): void {
    this.entries.push({ at: Date.now(), what, message });
    if (this.entries.length > 100) this.entries.shift();
    const now = Date.now();
    if (now - this.lastShown < 4000) return;
    this.lastShown = now;
    this.show(`Something went wrong (${message.slice(0, 140)}). Your work is safe; Help > Copy Error Log has the details.`);
  }

  text(): string {
    const all = [...this.entries, ...this.extra()].sort((a, b) => a.at - b.at);
    const lines = all.map((x) => `${new Date(x.at).toISOString()} · ${x.what} · ${x.message}`);
    return [`sonny ${VERSION} · ${navigator.userAgent}`, ...(lines.length ? lines : ['No errors recorded this session.'])].join('\n');
  }
}
