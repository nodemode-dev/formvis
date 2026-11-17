/** The models Select Subject and Object Selection run (the engine's /api/selection-models): the recommended one
 *  (BiRefNet, SAM 2.1 base-plus) once downloaded and chosen, else the small one (U2-Net, SAM 2.1 tiny). */

export type SelectionKind = 'subject' | 'object';
export type SelectionChoice = 'recommended' | 'small';
export interface SelectionOption { id: string; role: SelectionChoice; name: string; size: string | null; license: string; ready: boolean }
export interface SelectionKindState { label: string; choice: SelectionChoice; active: string; options: SelectionOption[] }
export type SelectionModels = Record<SelectionKind, SelectionKindState>;

export async function selectionModels(): Promise<SelectionModels | null> {
  try {
    const r = await fetch('/api/selection-models');
    return r.ok ? (await r.json()) as SelectionModels : null;
  } catch { return null; }
}

export async function chooseSelectionModel(kind: SelectionKind, choice: SelectionChoice): Promise<SelectionModels> {
  let r: Response;
  try { r = await fetch('/api/selection-models', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, choice }) }); } catch { throw new Error('The formvis engine is not reachable. Start it with ./formvis boot.'); }
  if (!r.ok) throw new Error('The model choice could not be saved.');
  return (await r.json()) as SelectionModels;
}

type Offer = (kind: SelectionKind) => Promise<void>;
let offer: Offer | null = null;
const asked = new Map<SelectionKind, Promise<void>>();

/** The window's offer of the recommended model, asked at most once a session for each kind; none in tests and workers. */
export function onSelectionModelOffer(fn: Offer | null): void { offer = fn; asked.clear(); }

/** Before Select Subject or Object Selection sends a picture: the recommended model is offered first when it is not here. */
export function beforeSelection(kind: SelectionKind): Promise<void> {
  if (!offer) return Promise.resolve();
  let run = asked.get(kind);
  if (!run) { run = offer(kind).catch(() => undefined); asked.set(kind, run); }
  return run;
}
