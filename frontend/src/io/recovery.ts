import type { FilePart } from './api';

export interface RecoveryRecord { id: string; name: string; savedAt: number; manifest: Record<string, unknown>; files: FilePart[] }

const DB_NAME = 'formvis-recovery';
const STORE = 'docs';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    let req: IDBOpenDBRequest;
    try { req = indexedDB.open(DB_NAME, 1); } catch { resolve(null); return; }
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then((db) => new Promise<T | null>((resolve) => {
    if (!db) { resolve(null); return; }
    try {
      const tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
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
