/** Carrying data across the rename to formvis (1.50.5, the owner's rebrand). This file and backend/app/core/legacy.py
 *  are the only places the app's former name remains: it is needed to find what was saved under it. On the first start
 *  after the rename, settings saved under the former prefix move to formvis's, and the browser databases (imported
 *  brushes, file links, recovery) move to their new names; projects saved with the former extensions still open.
 *  Nothing is lost and nothing is duplicated. To make a clean break, delete both files and their few call sites. */
const FORMER = 'sonny';

/** Project extensions from before the rename: still opened, and saved again as .fvd. */
export const FORMER_PROJECT_EXTENSIONS: readonly string[] = ['.sny', `.${FORMER}`];
/** The settings prefix before the rename (the tests read it from here rather than spelling it). */
export const FORMER_PREFIX = `${FORMER}.`;
export const FORMER_DATABASES: readonly string[] = ['brushes', 'links', 'recovery'].map((n) => `${FORMER}-${n}`);

/** Moves what was saved under the former name to formvis's; safe to run every start (it only moves what is there). */
export async function carryOver(): Promise<void> {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k?.startsWith(FORMER_PREFIX)) continue;
      const to = `formvis.${k.slice(FORMER_PREFIX.length)}`;
      if (localStorage.getItem(to) === null) localStorage.setItem(to, localStorage.getItem(k) ?? '');
      localStorage.removeItem(k);
    }
  } catch { /* storage unavailable: nothing to carry */ }
  for (const from of FORMER_DATABASES) {
    // At most 2 seconds each: another open tab can hold a database and stall its upgrade; the app must still start, and
    // what was not moved is moved on a later start.
    try { await Promise.race([moveDatabase(from, `formvis-${from.slice(FORMER.length + 1)}`), new Promise((ok) => setTimeout(ok, 2000))]); } catch { /* left where it is */ }
  }
}

const request = <T>(r: IDBRequest<T>): Promise<T> => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });

/** Merges database `from` into `to` (its stores made when missing), adding each record `to` does not already hold and
 *  never overwriting one, then deletes `from`: nothing is lost whether or not formvis had already made `to`. */
async function moveDatabase(from: string, to: string): Promise<void> {
  if (typeof indexedDB === 'undefined' || !('databases' in indexedDB)) return;
  if (!(await indexedDB.databases()).some((d) => d.name === from)) return;
  const old = await request(indexedDB.open(from));
  const stores = Array.from(old.objectStoreNames).map((name) => {
    const st = old.transaction(name, 'readonly').objectStore(name);
    return { name, keyPath: st.keyPath, autoIncrement: st.autoIncrement, keys: request(st.getAllKeys()), values: request(st.getAll()) };
  });
  const data = await Promise.all(stores.map(async (st) => ({ ...st, keys: await st.keys, values: await st.values })));
  old.close();
  let db = await request(indexedDB.open(to));
  const missing = data.filter((st) => !db.objectStoreNames.contains(st.name));
  if (missing.length) {
    const v = db.version + 1;
    db.close();
    const up = indexedDB.open(to, v);
    up.onupgradeneeded = () => { for (const st of missing) up.result.createObjectStore(st.name, { keyPath: st.keyPath ?? undefined, autoIncrement: st.autoIncrement }); };
    db = await request(up);
  }
  for (const st of data) {
    const tx = db.transaction(st.name, 'readwrite'), os = tx.objectStore(st.name);
    st.keys.forEach((k, i) => { const q = os.getKey(k); q.onsuccess = () => { if (q.result === undefined) { if (st.keyPath) os.put(st.values[i]); else os.put(st.values[i], k); } }; });
    await new Promise<void>((ok, no) => { tx.oncomplete = () => ok(); tx.onerror = () => no(tx.error); });
  }
  db.close();
  await new Promise<void>((ok) => { const d = indexedDB.deleteDatabase(from); d.onsuccess = d.onerror = d.onblocked = () => ok(); });
}
