type Handler = (payload: never) => void;

export class Emitter<M extends object> {
  private readonly handlers = new Map<keyof M, Set<Handler>>();

  on<K extends keyof M>(key: K, fn: (payload: M[K]) => void): () => void {
    let set = this.handlers.get(key);
    if (!set) { set = new Set(); this.handlers.set(key, set); }
    set.add(fn as Handler);
    return () => { set?.delete(fn as Handler); };
  }

  emit<K extends keyof M>(key: K, payload: M[K]): void {
    const set = this.handlers.get(key);
    if (!set) return;
    for (const fn of Array.from(set)) (fn as (p: M[K]) => void)(payload);
  }
}
