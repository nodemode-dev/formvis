import type { Engine } from '../engine';

/** Preferences that change how sonny works, kept on this device, as Photoshop's Preferences are. Every one acts on
 *  something real: History States and history memory are the undo limits every project uses; region redraws decide
 *  whether a brush stroke repaints only what it changed; the recovery delay is how soon after a change unsaved work is
 *  kept for crash recovery. */
export interface Prefs { historyStates: number; historyMB: number; regionRedraws: boolean; recoverySeconds: number }

export const DEFAULT_PREFS: Prefs = { historyStates: 100, historyMB: 256, regionRedraws: true, recoverySeconds: 20 };
export const RECOVERY_CHOICES: ReadonlyArray<readonly [string, string]> = [['10', '10 seconds'], ['20', '20 seconds'], ['60', '1 minute'], ['300', '5 minutes'], ['600', '10 minutes']];
const KEY = 'sonny.prefs';

const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

export function loadPrefs(): Prefs {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<keyof Prefs, unknown>>;
    return {
      historyStates: Math.round(num(r.historyStates, 1, 1000, DEFAULT_PREFS.historyStates)),
      historyMB: Math.round(num(r.historyMB, 16, 4096, DEFAULT_PREFS.historyMB)),
      regionRedraws: typeof r.regionRedraws === 'boolean' ? r.regionRedraws : DEFAULT_PREFS.regionRedraws,
      recoverySeconds: Math.round(num(r.recoverySeconds, 5, 3600, DEFAULT_PREFS.recoverySeconds)),
    };
  } catch { return { ...DEFAULT_PREFS }; }
}

export function savePrefs(p: Prefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* kept for this session only */ }
}

/** Puts the engine-side preferences into effect; the recovery delay is read by the app when it schedules a save. */
export function applyPrefs(engine: Engine, p: Prefs): void {
  engine.setHistoryLimits(p.historyStates, p.historyMB * 1024 * 1024);
  engine.dirtyRendering = p.regionRedraws;
}
