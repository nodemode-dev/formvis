import type { Action, ActionStep, Actions } from './actions';
import { asks } from './panels/actions-dialogs';
import { el, patchList, q, setChecked, setDisabled, setHidden, setText } from './dom';
import { icon } from './icons';
import { toast } from './toast';

const MODE_KEY = 'formvis.actions.buttonMode';

export interface ActionsPanelHooks { play(a: Action): Promise<void>; options(): void }

/** The Actions panel (Window > Actions, Alt+F9): the actions as a list or, in Button Mode, as one coloured button each;
 *  Record, Stop and Play, the steps of the chosen action with their include and Dialog toggles. Built once into the dock
 *  before the actions exist; `bind` hands it the store and the app's player, and every change after that patches rows in
 *  place. */
export function createActionsPanel(root: HTMLElement): { bind(store: Actions, hooks: ActionsPanelHooks): void } {
  root.insertAdjacentHTML('beforeend',
    '<section class="cv-preset-panel cv-actions-panel" aria-label="Actions">' +
    `<div class="cv-panel-head"><span class="cv-comps-title">${icon('play', 14)}<span>Actions</span></span><span></span><span class="cv-comps-count"></span></div>` +
    '<div class="cv-ref-bar"><input class="cv-input cv-actions-name" type="text" placeholder="New action name" spellcheck="false" aria-label="New action name" maxlength="80">' +
    '<button class="cv-btn" type="button" data-act="record">Record</button><button class="cv-btn" type="button" data-act="stop">Stop</button></div>' +
    '<div class="cv-ref-bar"><button class="cv-btn" type="button" data-act="play">Play</button><button class="cv-btn" type="button" data-act="options">Options...</button>' +
    '<label class="cv-actions-mode"><input type="checkbox" data-act="mode"><span>Button Mode</span></label></div>' +
    '<div class="cv-list cv-actions-list" role="listbox" aria-label="Actions"></div>' +
    '<div class="cv-action-buttons cv-actions-grid" role="group" aria-label="Actions" hidden></div>' +
    '<div class="cv-list cv-steps cv-actions-steps" role="listbox" aria-label="Steps"></div>' +
    '<p class="cv-ref-note" data-note></p></section>');
  const sec = q(root, 'section.cv-actions-panel');
  const list = q(sec, '.cv-actions-list'), grid = q(sec, '.cv-actions-grid'), steps = q(sec, '.cv-actions-steps'), note = q(sec, '[data-note]'), count = q(sec, '.cv-comps-count');
  const name = q<HTMLInputElement>(sec, '.cv-actions-name'), recordBtn = q<HTMLButtonElement>(sec, '[data-act="record"]'), stopBtn = q<HTMLButtonElement>(sec, '[data-act="stop"]');
  const playBtn = q<HTMLButtonElement>(sec, '[data-act="play"]'), mode = q<HTMLInputElement>(sec, '[data-act="mode"]');
  const ids = new WeakMap<Action, string>();
  let seq = 0, store: Actions | null = null, hooks: ActionsPanelHooks | null = null, chosen: Action | null = null, queued = false;
  const idOf = (a: Action): string => { let k = ids.get(a); if (!k) { k = String(++seq); ids.set(a, k); } return k; };
  try { mode.checked = localStorage.getItem(MODE_KEY) === '1'; } catch { /* storage unavailable */ }

  const say = (text: string): void => { if (note.textContent !== text) setText(note, text); };
  const label = (a: Action): string => `${a.set ? `${a.set} / ` : ''}${a.name}`;

  const fillRow = (row: HTMLElement, a: Action): void => {
    setText(q(row, '.cv-action-name'), label(a));
    setText(q(row, '.cv-action-meta'), `${a.steps.length}${a.key ? `, ${a.key}` : ''}`);
    const on = a === chosen;
    row.classList.toggle('is-selected', on);
    row.setAttribute('aria-selected', String(on));
  };
  const fillButton = (b: HTMLElement, a: Action): void => {
    const cls = `cv-action-btn${a.colour ? ` is-${a.colour}` : ''}`;
    if (b.className !== cls) b.className = cls;
    setText(q(b, '.cv-action-btn-name'), a.name);
    setText(q(b, '.cv-action-btn-sub'), [a.set, a.key].filter(Boolean).join(', '));
    const t = `${a.name}, ${a.steps.length} step${a.steps.length === 1 ? '' : 's'}`;
    if (b.title !== t) b.title = t;
  };
  const fillStep = (row: HTMLElement, s: ActionStep, i: number): void => {
    const skipped = s.kind === 'unsupported', on = q<HTMLInputElement>(row, '.cv-step-on'), ask = q<HTMLButtonElement>(row, '.cv-step-ask');
    setText(q(row, '.cv-step-n'), `${i + 1}.`);
    setChecked(on, !s.off && !skipped);
    setDisabled(on, skipped);
    row.classList.toggle('is-off', !!s.off || skipped);
    setText(q(row, '.cv-step-label'), s.kind === 'stop' ? `Stop: ${s.message || 'pause'}` : s.label);
    const can = asks(s);
    setHidden(ask, !can);
    ask.setAttribute('aria-pressed', String(can && 'ask' in s && !!s.ask));
  };

  const sync = (): void => {
    queued = false;
    if (!store) return;
    const all = store.list;
    if (chosen && !all.includes(chosen)) chosen = null;
    if (!chosen && all.length) chosen = all[0];
    const bm = mode.checked, rec = store.recording;
    setHidden(list, bm);
    setHidden(steps, bm);
    setHidden(grid, !bm);
    patchList<Action>(list, all, {
      key: idOf,
      create: (a) => {
        const row = el('<div class="cv-list-row cv-action-row" role="option"><span></span><span class="cv-action-name"></span><span class="cv-action-meta"></span></div>');
        q(row, 'span').innerHTML = icon('play', 12);
        fillRow(row, a);
        return row;
      },
      update: fillRow,
    });
    patchList<Action>(grid, all, {
      key: idOf,
      create: (a) => {
        const b = el<HTMLButtonElement>('<button class="cv-action-btn" type="button"><span class="cv-action-btn-name"></span><span class="cv-action-btn-sub"></span></button>');
        fillButton(b, a);
        return b;
      },
      update: fillButton,
    });
    const list2 = chosen?.steps ?? [];
    patchList<ActionStep>(steps, list2, {
      key: (s) => String(list2.indexOf(s)),
      create: (s) => {
        const row = el('<div class="cv-list-row cv-step-row" role="option"><input class="cv-step-on" type="checkbox" title="Include this step when the action plays" aria-label="Include step"><span class="cv-step-n"></span><span class="cv-step-label"></span><button class="cv-btn cv-btn-ghost cv-step-ask" type="button" title="Open this step\'s dialog during playback">Dialog</button></div>');
        fillStep(row, s, list2.indexOf(s));
        return row;
      },
      update: (row, s) => fillStep(row, s, list2.indexOf(s)),
    });
    setText(count, all.length ? String(all.length) : '');
    setDisabled(playBtn, !chosen?.steps.length);
    setDisabled(stopBtn, !rec);
    setDisabled(recordBtn, !!rec);
    say(rec ? `Recording "${rec.name}". Press Stop when done.` : all.length ? 'Choose an action, then Play. Record adds to the chosen action, or starts a new one when a name is typed.' : 'No actions yet. Type a name and press Record.');
  };
  const schedule = (): void => { if (queued) return; queued = true; requestAnimationFrame(sync); };

  const play = (a: Action | null): void => { if (a && hooks) void hooks.play(a); };
  recordBtn.addEventListener('click', () => {
    if (!store) return;
    const n = name.value.trim(), a = n ? store.start(n) : chosen ? store.resume(chosen) : null;
    if (!a) { say('Type a name for a new action, or choose one to add steps to.'); name.focus(); return; }
    name.value = '';
    chosen = a;
    sync();
  });
  stopBtn.addEventListener('click', () => {
    if (!store) return;
    const x = store.recording;
    store.stop();
    if (x) toast(`Recorded "${x.name}", ${x.steps.length} step${x.steps.length === 1 ? '' : 's'}.`);
    sync();
  });
  playBtn.addEventListener('click', () => play(chosen));
  q(sec, '[data-act="options"]').addEventListener('click', () => hooks?.options());
  mode.addEventListener('change', () => { try { localStorage.setItem(MODE_KEY, mode.checked ? '1' : '0'); } catch { /* storage unavailable */ } sync(); });
  const byRow = (e: Event): Action | null => {
    const n = (e.target as HTMLElement).closest<HTMLElement>('[data-key]');
    return n && store ? store.list.find((a) => idOf(a) === n.dataset.key) ?? null : null;
  };
  list.addEventListener('click', (e) => { const a = byRow(e); if (a) { chosen = a; sync(); } });
  list.addEventListener('dblclick', (e) => play(byRow(e)));
  grid.addEventListener('click', (e) => { const a = byRow(e); if (a) { chosen = a; play(a); } });
  steps.addEventListener('click', (e) => {
    const t = e.target as HTMLElement, row = t.closest<HTMLElement>('.cv-step-row'), s = row && chosen ? chosen.steps[Number(row.dataset.key)] : null;
    if (!s || !store) return;
    if (t.classList.contains('cv-step-on')) { if ((t as HTMLInputElement).checked) delete s.off; else s.off = true; store.save(); }
    else if (t.closest('.cv-step-ask') && asks(s) && (s.kind === 'filter' || s.kind === 'adjustment')) { if (s.ask) delete s.ask; else s.ask = true; store.save(); }
  });

  return {
    bind(s, h) {
      store = s;
      hooks = h;
      s.onChange(schedule);
      sync();
    },
  };
}
