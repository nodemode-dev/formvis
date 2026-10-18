/** Files on this computer through the desktop app's own open and save panels (1.87.0, CLOSE_GAPS P01). The panels come
 *  from the shell's dialog plugin; the engine reads and writes the chosen paths. In a browser there are no panels:
 *  callers keep the library prompt, the file picker and downloads. */

export const hasPanels = (): boolean => '__TAURI_INTERNALS__' in window;

export interface PanelFilter { name: string; extensions: string[] }

export const PROJECT_FILTER: PanelFilter = { name: 'formvis Project', extensions: ['fvd'] };

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(cmd, args);
}

/** The save panel: the chosen path, or null when it was cancelled. The panel itself asks before replacing a file. */
export async function chooseSavePath(title: string, defaultPath: string, filters: PanelFilter[]): Promise<string | null> {
  const path = await invoke<string | null>('plugin:dialog|save', { options: { title, defaultPath, filters, canCreateDirectories: true } });
  return typeof path === 'string' && path ? path : null;
}

/** The open panel: the chosen files, none when it was cancelled. */
export async function chooseOpenPaths(title: string, filters: PanelFilter[], defaultPath = ''): Promise<string[]> {
  const picked = await invoke<string | string[] | null>('plugin:dialog|open', { options: { title, multiple: true, directory: false, filters, ...(defaultPath ? { defaultPath } : {}) } });
  if (!picked) return [];
  return (Array.isArray(picked) ? picked : [picked]).filter((p): p is string => typeof p === 'string' && !!p);
}

/** The file name at the end of a path, on any system. */
export const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/** The folder a path sits in. */
export const folderOf = (path: string): string => path.slice(0, Math.max(0, path.length - baseName(path).length - 1));

/** True for an absolute path on this computer rather than a library project's name. */
export const isDiskPath = (s: string): boolean => /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(s);
