import { SelectionMask } from './selection';

/** The separate features of a selection (pixels touching by side or corner), largest first, each as a mask of its own
 *  built only when asked for. At most `cap` features; smaller specks beyond that are left out. */
export function* selectionFeatures(sel: SelectionMask, cap = 100): Generator<SelectionMask> {
  const { w, h, data } = sel, label = new Int32Array(w * h), stack: number[] = [], found: Array<{ id: number; size: number }> = [];
  let next = 0;
  for (let s = 0; s < data.length; s++) {
    if (!data[s] || label[s]) continue;
    const id = ++next;
    let size = 0;
    label[s] = id; stack.push(s);
    while (stack.length) {
      const at = stack.pop() as number, x = at % w, y = (at - x) / w;
      size++;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const to = ny * w + nx;
          if (data[to] && !label[to]) { label[to] = id; stack.push(to); }
        }
      }
    }
    found.push({ id, size });
  }
  found.sort((a, b) => b.size - a.size);
  for (const f of found.slice(0, cap)) {
    const part = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) if (label[i] === f.id) part[i] = data[i];
    yield new SelectionMask(sel.x, sel.y, w, h, part);
  }
}
