/** View > Extras and View > Show: which of the canvas's helpers draw (notes, counts, selection edges, layer edges).
 *  Kept on this device; the stage reads `extraShown` while it draws and redraws when `onExtras` fires. */
export type ExtraKey = 'notes' | 'counts' | 'selectionEdges' | 'layerEdges' | 'targetPath' | 'brushPreview' | 'mesh' | 'pins';
export const EXTRA_KEYS: readonly ExtraKey[] = ['notes', 'counts', 'selectionEdges', 'layerEdges', 'targetPath', 'brushPreview', 'mesh', 'pins'];

const STORE = 'formvis.viewExtras';
const state: Record<ExtraKey | 'master' | 'selectionTint', boolean> = { master: true, notes: true, counts: true, selectionEdges: true, layerEdges: false, targetPath: false, brushPreview: true, mesh: true, pins: true, selectionTint: false };
const listeners = new Set<() => void>();

try {
  const raw = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, unknown>;
  for (const k of Object.keys(state) as Array<keyof typeof state>) if (typeof raw[k] === 'boolean') state[k] = raw[k] as boolean;
} catch { /* the defaults */ }

function changed(): void {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* kept for this session only */ }
  for (const f of listeners) f();
}

/** One helper is drawn when Extras is on and the helper itself is on. */
export const extraShown = (k: ExtraKey): boolean => state.master && state[k];
export const extraOn = (k: ExtraKey): boolean => state[k];
export const extrasOn = (): boolean => state.master;
/** View > Selection Display: the selection shown as a red tint over what is not selected (as Quick Mask does) instead of marching ants; remembered on this device. */
export const selectionTintOn = (): boolean => state.selectionTint;
export function setSelectionTint(on: boolean): void { if (state.selectionTint === on) return; state.selectionTint = on; changed(); }
export function setExtra(k: ExtraKey, on: boolean): void { if (state[k] === on) return; state[k] = on; changed(); }
export function setExtras(on: boolean): void { if (state.master === on) return; state.master = on; changed(); }
/** Show > All and Show > None: every helper on or off together. */
export function setAllExtras(on: boolean): void {
  let any = state.master !== on;
  state.master = on || state.master;
  for (const k of EXTRA_KEYS) if (state[k] !== on) { state[k] = on; any = true; }
  if (any) changed();
}
export function onExtras(f: () => void): void { listeners.add(f); }
/** Show Extras Options: the helpers View > Extras shows, with the names the dialog gives them. */
export const EXTRA_LABELS: ReadonlyArray<readonly [ExtraKey, string]> = [['notes', 'Notes'], ['counts', 'Count'], ['selectionEdges', 'Selection Edges'], ['layerEdges', 'Layer Edges'], ['targetPath', 'Target Path'], ['brushPreview', 'Brush Preview'], ['mesh', 'Mesh'], ['pins', 'Edit Pins']];
