import type { ExtRow, FormExtensions } from '../formext/extensions';
import { PERMISSION_WORDS, type Permission } from '../formext/host-bridge';
import { el, patchList, q, setHidden, setText, setTitle } from './dom';
import { icon } from './icons';

const SOURCE: Record<string, string> = { catalogue: 'Catalogue', sideload: 'File', development: 'Development' };
const STATE: Record<string, string> = { ready: 'Ready', 'needs-permission': 'Needs Permission', refused: 'Refused' };
const CHIP: Record<string, string> = { document: 'Document', 'files-read': 'Open files', 'files-write': 'Save files', network: 'Network', models: 'Models', 'native-code': 'Native code' };

/** Window > Extensions: one row per Form extension (name, version, source, permission chips, state and the refusal's
 *  reason), Open for each panel, the folder of a development extension, Reload and Manage in FormPortal. Built into the
 *  dock before the first paint from the list kept at the last start; `bind` then patches rows in place as the engine's
 *  list changes. */
export function createExtensionsPanel(root: HTMLElement): { bind(ext: FormExtensions, run: (id: string) => void): void } {
  root.insertAdjacentHTML('beforeend',
    '<section class="cv-preset-panel cv-extensions" aria-label="Extensions">' +
    `<div class="cv-panel-head"><span class="cv-comps-title">${icon('pfPlugins', 14)}<span>Extensions</span></span><span></span><span class="cv-comps-count"></span></div>` +
    '<div class="cv-ref-bar"><button class="cv-btn" type="button" data-act="reload">Reload</button><button class="cv-btn" type="button" data-act="manage">Manage in FormPortal</button></div>' +
    '<div class="cv-ext-list" role="list" aria-label="Extensions"></div>' +
    '<p class="cv-ref-note cv-ext-empty">No extensions yet. Find them in FormPortal or make one with form.ext.</p></section>');
  const sec = q(root, 'section.cv-extensions'), list = q(sec, '.cv-ext-list'), empty = q(sec, '.cv-ext-empty'), count = q(sec, '.cv-comps-count');

  const fill = (ext: FormExtensions, row: HTMLElement, r: ExtRow): void => {
    const state = ext.stateOf(r);
    setText(q(row, '.cv-ext-name'), r.name);
    setText(q(row, '.cv-ext-ver'), r.state === 'refused' && r.version === '0.0.0' ? '' : r.version);
    setText(q(row, '.cv-ext-source'), SOURCE[r.source] ?? r.source);
    const st = q(row, '.cv-ext-state');
    setText(st, STATE[state]);
    if (st.dataset.state !== state) st.dataset.state = state;
    const chips = q(row, '.cv-ext-chips'), perms = r.permissions.join(',');
    if (chips.dataset.perms !== perms) {
      chips.dataset.perms = perms;
      chips.replaceChildren(...(r.permissions.length ? r.permissions : ['none']).map((p) => {
        const c = el('<span class="cv-ext-chip"></span>');
        c.textContent = CHIP[p] ?? (p === 'none' ? 'No permissions' : p);
        c.title = PERMISSION_WORDS[p as Permission] ?? '';
        return c;
      }));
    }
    setHidden(chips, state === 'refused' && !r.permissions.length);
    const note = q(row, '.cv-ext-note'), text = state === 'refused' ? `Refused: ${r.reason ?? 'not valid'}.` : r.description ?? '';
    setText(note, text);
    setHidden(note, !text);
    const path = q(row, '.cv-ext-path');
    setText(path, r.path ?? '');
    setTitle(path, r.path ?? '');
    setHidden(path, !r.path);
    const acts = q(row, '.cv-ext-actions'), want = state === 'refused' ? '' : JSON.stringify([state, r.panels]);
    if (acts.dataset.want !== want) {
      acts.dataset.want = want;
      const buttons = state === 'refused' ? [] : r.panels.map((p) => {
        const b = el<HTMLButtonElement>('<button class="cv-btn" type="button"></button>');
        b.textContent = r.panels.length > 1 ? `Open ${p.title}` : 'Open';
        b.addEventListener('click', () => void ext.openPanel(r.id, p.id).catch(() => undefined));
        return b;
      });
      if (state === 'needs-permission') {
        const b = el<HTMLButtonElement>('<button class="cv-btn" type="button">Allow...</button>');
        b.addEventListener('click', () => void ext.allow(r.id));
        buttons.push(b);
      }
      acts.replaceChildren(...buttons);
    }
    setHidden(acts, !acts.childElementCount);
  };

  return {
    bind(ext, run) {
      q(sec, '[data-act="reload"]').addEventListener('click', () => run('extensions-reload'));
      q(sec, '[data-act="manage"]').addEventListener('click', () => run('extensions-manage'));
      const draw = (): void => {
        const rows = ext.list();
        patchList<ExtRow>(list, rows, {
          key: (r) => r.id,
          create: (r) => {
            const row = el('<div class="cv-ext-row" role="listitem"><div class="cv-ext-line"><span class="cv-ext-name"></span><span class="cv-ext-ver"></span><span class="cv-ext-source"></span><span class="cv-ext-state"></span></div>' +
              '<div class="cv-ext-chips"></div><p class="cv-ext-note"></p><p class="cv-ext-path"></p><div class="cv-ext-actions"></div></div>');
            row.dataset.key = r.id;
            fill(ext, row, r);
            return row;
          },
          update: (row, r) => fill(ext, row, r),
        });
        setHidden(empty, rows.length > 0);
        setHidden(list, rows.length === 0);
        setText(count, rows.length ? String(rows.length) : '');
      };
      draw();
      ext.onChange(draw);
    },
  };
}
