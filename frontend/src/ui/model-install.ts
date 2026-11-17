import { installModel, modelEntry } from '../io/local-gen';
import { chooseSelectionModel, selectionModels, type SelectionKind } from '../io/selection-models';
import { confirmAction } from './dialogs';
import { toast } from './toast';

const installing = new Map<string, Promise<boolean>>();

async function install(id: string, name: string): Promise<boolean> {
  const dismiss = toast(`Installing ${name}. The action carries on when it is done.`, 'info', { ms: 0 });
  let said = '';
  try {
    if (await installModel(id, (text) => { said = text; })) return true;
    toast(`${said || `${name} did not download.`} Try again from Preferences > Plugins > Local models.`, 'error');
    return false;
  } catch (err) {
    toast(`${name} could not start downloading (${err instanceof Error ? err.message : 'the engine did not answer'}).`, 'error');
    return false;
  } finally { dismiss(); }
}

/** A model an action needs: true at once when it is here; else the person is asked, with its size, and Install now
 *  downloads it through the engine's model manager (true once it is in place). Cancel downloads nothing. */
export async function offerModel(id: string): Promise<boolean> {
  const entry = await modelEntry(id);
  if (!entry) return false;
  if (entry.ready) return true;
  const size = entry.size ? ` (${entry.size})` : '';
  const ok = await confirmAction(`Install ${entry.name}?`,
    `This needs ${entry.name}, which is not on this computer yet. It downloads once${entry.size ? `, about ${entry.size},` : ''} and then runs on this computer, with no key and no cost. It can be removed in Preferences > Plugins > Local models.`,
    `Install now${size}`);
  if (!ok) return false;
  let run = installing.get(id);
  if (!run) { run = install(id, entry.name).finally(() => installing.delete(id)); installing.set(id, run); }
  return run;
}

const BETTER: Record<SelectionKind, string> = {
  subject: 'finds the subject with cleaner edges, hair and fine detail',
  object: 'follows the object you click more closely',
};

/** Select Subject and Object Selection offer their recommended model first while it is not here: Install now downloads
 *  it and the action runs on it; Use the small model keeps the small one (saved, so it is not asked again). */
export async function offerRecommended(kind: SelectionKind): Promise<void> {
  const state = (await selectionModels())?.[kind];
  const best = state?.options.find((o) => o.role === 'recommended'), small = state?.options.find((o) => o.role === 'small');
  if (!state || !best || !small || state.choice !== 'recommended' || best.ready) return;
  const size = best.size ? ` (${best.size})` : '';
  const ok = await confirmAction(`Use ${best.name} for ${state.label}?`,
    `${best.name} is the recommended model: it ${BETTER[kind]} than the small model, ${small.name}${small.size ? ` (${small.size})` : ''}. It downloads once${best.size ? `, about ${best.size},` : ''} and runs on this computer, with no key and no cost (${best.license}). You can switch in Preferences > Plugins > Local models.`,
    `Install now${size}`, false, 'Use the small model');
  if (!ok) {
    try { await chooseSelectionModel(kind, 'small'); } catch (err) { toast(err instanceof Error ? err.message : 'The model choice could not be saved.', 'error'); }
    return;
  }
  let run = installing.get(best.id);
  if (!run) { run = install(best.id, best.name).finally(() => installing.delete(best.id)); installing.set(best.id, run); }
  await run;
}

/** offerModel, with `declined` run when the model is still missing afterwards (what the action did before it could offer). */
export async function needModel(id: string, declined: () => void): Promise<boolean> {
  if (await offerModel(id)) return true;
  declined();
  return false;
}
