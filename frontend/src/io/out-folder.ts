/** An output folder chosen in the browser through the File System Access API, where the browser has it. */
interface DirPicker { showDirectoryPicker?: (o?: { mode?: 'readwrite'; id?: string }) => Promise<FileSystemDirectoryHandle> }

export const outFolderAvailable = (): boolean => typeof (window as unknown as DirPicker).showDirectoryPicker === 'function';

/** Asks for a folder to write into; null when the person cancels or the browser has no picker. */
export async function pickOutFolder(): Promise<FileSystemDirectoryHandle | null> {
  const pick = (window as unknown as DirPicker).showDirectoryPicker;
  if (!pick) return null;
  try { return await pick.call(window, { mode: 'readwrite', id: 'formvis-out' }); } catch { return null; }
}

/** Writes each file into `root`, inside the sub-folder `dir` when it has one (made when missing); returns how many were written. */
export async function writeFolder(root: FileSystemDirectoryHandle, files: Array<{ dir?: string; name: string; blob: Blob }>): Promise<number> {
  let n = 0;
  const dirs = new Map<string, FileSystemDirectoryHandle>();
  for (const f of files) {
    const key = f.dir ?? '';
    let at = dirs.get(key);
    if (!at) { at = key ? await root.getDirectoryHandle(key, { create: true }) : root; dirs.set(key, at); }
    const w = await (await at.getFileHandle(f.name, { create: true })).createWritable();
    await w.write(f.blob);
    await w.close();
    n++;
  }
  return n;
}
