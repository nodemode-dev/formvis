type Handler = (payload: never) => void;

export class Emitter<M extends object> {
  private readonly handlers = new Map<keyof M, Set<Handler>>();

  /** Subscribes to an event; the returned function unsubscribes. */
  on<K extends keyof M>(key: K, fn: (payload: M[K]) => void): () => void {
    const existing = this.handlers.get(key);
    const set = existing ?? new Set<Handler>();
    if (!existing) this.handlers.set(key, set);
    set.add(fn);
    return () => { set.delete(fn); };
  }

  /** Calls the event's handlers; works on a copy so handlers may unsubscribe meanwhile. */
  emit<K extends keyof M>(key: K, payload: M[K]): void {
    const set = this.handlers.get(key);
    if (!set) return;
    for (const fn of [...set]) (fn as (p: M[K]) => void)(payload);
  }
}
