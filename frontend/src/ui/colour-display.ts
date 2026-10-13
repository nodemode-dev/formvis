import { fromBase64, profileName } from '../io/icc-read';

/** The monitor's profile (DEV_PLAN 28.2). The desktop app asks the shell, which reads what the operating system holds
 *  for the screen; a browser cannot know, so it is told to assume sRGB, and the page says so. */
export interface DisplayInfo {
  desktop: boolean;
  available: boolean;
  source: string;
  name: string;
  icc: string | null;
  note: string;
}

const ASSUMED = 'sRGB IEC61966-2.1';
export const BROWSER_NOTE = 'This browser does not say which profile the monitor has, so formvis assumes an sRGB display. The desktop app reads the monitor profile from the system and draws through it.';
const SOURCES: Record<string, string> = { x11: 'X11', colord: 'colord', colorsync: 'ColorSync', windows: 'Windows colour management', file: 'FORMVIS_DISPLAY_PROFILE' };

export const inDesktopApp = (): boolean => '__TAURI_INTERNALS__' in window;

export async function readDisplay(): Promise<DisplayInfo> {
  if (!inDesktopApp()) return { desktop: false, available: false, source: 'browser', name: ASSUMED, icc: null, note: BROWSER_NOTE };
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const r = await invoke<{ available: boolean; source: string; icc: string | null; note: string }>('display_profile');
    if (r.available && r.icc) return { desktop: true, available: true, source: r.source, name: profileName(fromBase64(r.icc)), icc: r.icc, note: '' };
    return { desktop: true, available: false, source: r.source, name: ASSUMED, icc: null, note: `The system holds no profile for this monitor${r.note ? ` (${r.note})` : ''}, so formvis assumes an sRGB display.` };
  } catch (err) {
    return { desktop: true, available: false, source: 'none', name: ASSUMED, icc: null, note: `The monitor profile could not be read (${err instanceof Error ? err.message : String(err)}), so formvis assumes an sRGB display.` };
  }
}

/** One line for a dialog: the profile in use and where it came from, or the assumption and why. */
export function displayLine(d: DisplayInfo | null, use = true): string {
  if (!d) return 'Reading the monitor profile...';
  if (!d.available) return d.note;
  return use ? `${d.name}, from ${SOURCES[d.source] ?? d.source}. The canvas is drawn through it.` : `${d.name}, from ${SOURCES[d.source] ?? d.source}, is not used: the canvas assumes an sRGB display.`;
}
