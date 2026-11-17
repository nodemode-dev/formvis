import { installModel, modelEntry } from '../io/local-gen';
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

/** offerModel, with `declined` run when the model is still missing afterwards (what the action did before it could offer). */
export async function needModel(id: string, declined: () => void): Promise<boolean> {
  if (await offerModel(id)) return true;
  declined();
  return false;
}
