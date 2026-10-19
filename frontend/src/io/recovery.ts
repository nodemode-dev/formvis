import type { FilePart } from './api';

/** modified and libraryName (1.52.4, session restore): whether the copy has unsaved changes (older copies, without it,
 *  are unsaved, as only unsaved documents were kept then) and the library entry it was saved to. */
export interface RecoveryRecord { id: string; name: string; savedAt: number; manifest: Record<string, unknown>; files: FilePart[]; modified?: boolean; libraryName?: string | null }

/** What an earlier start left (1.88.9): a session (every document that was open) or a crash set (documents with unsaved
 *  changes), kept after the start that found it so Earlier States can open it as tabs later. */
export interface EarlierSet { id: string; kind: 'session' | 'crash'; savedAt: number; sig: string; records: RecoveryRecord[] }

const DB_NAME = 'formvis-recovery';
const STORE = 'docs';
const SETS = 'sets';
const KEEP: Record<EarlierSet['kind'], number> = { session: 2, crash: 3 };
const BIGGEST = 512 * 1048576;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    let req: IDBOpenDBRequest;
    try { req = indexedDB.open(DB_NAME, 2); } catch { resolve(null); return; }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
      if (!req.result.objectStoreNames.contains(SETS)) req.result.createObjectStore(SETS, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, store = STORE): Promise<T | null> {
  return openDb().then((db) => new Promise<T | null>((resolve) => {
    if (!db) { resolve(null); return; }
    try {
      const tx = db.transaction(store, mode), req = fn(tx.objectStore(store));
      tx.oncomplete = () => { db.close(); resolve(req.result ?? null); };
      tx.onerror = () => { db.close(); resolve(null); };
      tx.onabort = () => { db.close(); resolve(null); };
    } catch { db.close(); resolve(null); }
  }));
}

export const recovery = {
  keep: (r: RecoveryRecord): Promise<boolean> => run('readwrite', (s) => s.put(r)).then((v) => v !== null),
  drop: (id: string): Promise<void> => run('readwrite', (s) => s.delete(id)).then(() => undefined),
  list: (): Promise<RecoveryRecord[]> => run<RecoveryRecord[]>('readonly', (s) => s.getAll() as IDBRequest<RecoveryRecord[]>).then((v) => (Array.isArray(v) ? v.filter((r) => r && typeof r.id === 'string' && r.manifest && Array.isArray(r.files)) : [])),
  clear: (): Promise<void> => run('readwrite', (s) => s.clear()).then(() => undefined),
};

const signature = (records: RecoveryRecord[]): string => records.map((r) => `${r.name}:${r.modified !== false ? 1 : 0}:${r.files.reduce((n, f) => n + f.blob.size, 0)}`).sort().join('|');

/** The sets earlier starts found, newest first. The last two sessions and the last three crash sets are kept. */
export const earlier = {
  list: (): Promise<EarlierSet[]> => run<EarlierSet[]>('readonly', (s) => s.getAll() as IDBRequest<EarlierSet[]>, SETS)
    .then((v) => (Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string' && Array.isArray(x.records)).sort((a, b) => b.savedAt - a.savedAt) : [])),
  drop: (id: string): Promise<void> => run('readwrite', (s) => s.delete(id), SETS).then(() => undefined),
  /** Keeps what this start found before it is reopened, offered or cleared; false when it is empty, the same as the
   *  newest set of its kind, or too large to copy. */
  async add(records: RecoveryRecord[]): Promise<boolean> {
    if (!records.length) return false;
    const kind: EarlierSet['kind'] = records.some((r) => r.modified !== false) ? 'crash' : 'session';
    const bytes = records.reduce((n, r) => n + r.files.reduce((m, f) => m + f.blob.size, 0), 0);
    if (bytes > BIGGEST) return false;
    const all = await earlier.list(), sig = signature(records);
    if (all.find((x) => x.kind === kind)?.sig === sig) return false;
    const set: EarlierSet = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, kind, savedAt: Math.max(...records.map((r) => r.savedAt), 0) || Date.now(), sig, records };
    if ((await run('readwrite', (s) => s.put(set), SETS)) === null) return false;
    const same = [set, ...all.filter((x) => x.kind === kind)].sort((a, b) => b.savedAt - a.savedAt);
    for (const old of same.slice(KEEP[kind])) await earlier.drop(old.id);
    return true;
  },
};
