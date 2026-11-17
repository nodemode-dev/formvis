import { installModel, modelEntry } from '../io/local-gen';
import { chooseSelectionModel, selectionModels, type SelectionKind } from '../io/selection-models';
import { confirmAction, confirmChoice } from './dialogs';
import { t } from './i18n';
import { toast } from './toast';

const installing = new Map<string, Promise<boolean>>();

/** `english` in the current language with each {key} filled in, the way status.ts and properties.ts assemble text. */
export const tf = (english: string, values: Record<string, string>): string =>
  Object.entries(values).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), t(english));

const installLabel = (size: string | null): string => tf('Install now ({size})', { size: size ?? '?' });

async function install(id: string, name: string): Promise<boolean> {
  const dismiss = toast(tf('Installing {name}. The action carries on when it is done.', { name }), 'info', { ms: 0 });
  let said = '';
  try {
    if (await installModel(id, (text) => { said = text; })) return true;
    toast(`${said || tf('{name} did not download.', { name })} ${t('Try again from Preferences > Plugins > Local models.')}`, 'error');
    return false;
  } catch (err) {
    toast(tf('{name} could not start downloading ({reason}).', { name, reason: err instanceof Error ? err.message : t('the engine did not answer') }), 'error');
    return false;
  } finally { dismiss(); }
}

/** A model an action needs: true at once when it is here; else the person is asked, with its size, and Install now
 *  downloads it through the engine's model manager (true once it is in place). Cancel downloads nothing. */
export function offerModel(id: string): Promise<boolean> {
  let offer = offers.get(id);
  if (!offer) { offer = askAndInstall(id).finally(() => offers.delete(id)); offers.set(id, offer); }
  return offer;
}

/** One offer a model at a time: actions that find it missing together share one question and one download. */
const offers = new Map<string, Promise<boolean>>();

async function askAndInstall(id: string): Promise<boolean> {
  const entry = await modelEntry(id);
  if (!entry) return false;
  if (entry.ready) return true;
  const name = entry.name, size = entry.size;
  const ok = await confirmAction(tf('Install {name}?', { name }),
    tf('This needs {name}, which is not on this computer yet. It downloads once, about {size}, and then runs on this computer, with no key and no cost. It can be removed in Preferences > Plugins > Local models.', { name, size: size ?? '?' }),
    installLabel(size));
  if (!ok) return false;
  let run = installing.get(id);
  if (!run) { run = install(id, name).finally(() => installing.delete(id)); installing.set(id, run); }
  return run;
}

const BETTER: Record<SelectionKind, string> = {
  subject: '{name} is the recommended model for Select Subject: it finds the subject with cleaner edges, hair and fine detail than the small model, {small}. It downloads once, about {size}, and runs on this computer, with no key and no cost ({license}). You can switch in Preferences > Plugins > Local models.',
  object: '{name} is the recommended model for Object Selection: it follows the object you click more closely than the small model, {small}. It downloads once, about {size}, and runs on this computer, with no key and no cost ({license}). You can switch in Preferences > Plugins > Local models.',
};

/** Select Subject and Object Selection offer their recommended model first while it is not here: Install now downloads
 *  it and the action runs on it; Use the small model keeps the small one (saved, so it is not asked again). */
export async function offerRecommended(kind: SelectionKind): Promise<void> {
  const state = (await selectionModels())?.[kind];
  const best = state?.options.find((o) => o.role === 'recommended'), small = state?.options.find((o) => o.role === 'small');
  if (!state || !best || !small || state.choice !== 'recommended' || best.ready) return;
  const answer = await confirmChoice(tf('Use {name} for {action}?', { name: best.name, action: t(state.label) }),
    tf(BETTER[kind], { name: best.name, small: small.size ? `${small.name} (${small.size})` : small.name, size: best.size ?? '?', license: best.license }),
    installLabel(best.size), t('Use the small model'));
  if (answer === 'dismiss') return;
  if (answer === 'cancel') {
    try { await chooseSelectionModel(kind, 'small'); } catch (err) { toast(err instanceof Error ? t(err.message) : t('The model choice could not be saved.'), 'error'); }
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
