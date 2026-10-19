import { api } from '../io/api';
import { addRecipe, recipes } from '../io/comfy';
import { loadPrefs } from './prefs';
import { q, setHidden, setText } from './dom';
import { icon } from './icons';

/** The ComfyUI panel (Window menu): ComfyUI's own page in a frame, at the address in Preferences > Plugins. The frame is
 *  built once and given its address only after the engine has confirmed that a ComfyUI answers there (the same check the
 *  connection dot uses), and only for an http or https address. The window is cross-origin isolated, so the frame is
 *  credentialless: it loads ComfyUI without cookies and needs no isolation headers from it. A page that refuses to be
 *  framed is opened in a browser tab with the button beside Reload. */
export function createComfyPanel(root: HTMLElement): void {
  root.insertAdjacentHTML('beforeend',
    '<section class="cv-preset-panel cv-comfyui" aria-label="ComfyUI">' +
    `<div class="cv-panel-head"><span class="cv-comps-title">${icon('genPlug', 14)}<span>ComfyUI</span></span><span></span><span class="cv-comps-count"></span></div>` +
    `<div class="cv-ref-bar"><button class="cv-btn" type="button" data-act="reload" title="Load ComfyUI again">${icon('refresh', 14)}<span>Reload</span></button>` +
    `<button class="cv-btn" type="button" data-act="browser" title="Open ComfyUI in a browser tab">${icon('send', 14)}<span>Open in browser</span></button></div>` +
    '<div class="cv-ref-bar cv-comfy-graph"><select class="cv-input" data-recipe aria-label="Recipe to replace"></select>' +
    '<input class="cv-input cv-comfy-name" type="text" data-name placeholder="Recipe name" maxlength="100" spellcheck="false" aria-label="New recipe name">' +
    '<button class="cv-btn" type="button" data-act="save-graph" title="Keep the graph ComfyUI ran last as a recipe">Save graph</button></div>' +
    '<iframe class="cv-comfy-frame" title="ComfyUI" referrerpolicy="no-referrer" credentialless allow="clipboard-read; clipboard-write" hidden></iframe>' +
    '<p class="cv-ref-note" data-note>The ComfyUI window loads when this panel is shown.</p></section>');
  const sec = q(root, 'section.cv-comfyui');
  const frame = q<HTMLIFrameElement>(sec, '.cv-comfy-frame'), note = q(sec, '[data-note]'), count = q(sec, '.cv-comps-count');
  let loadedFor = '', seq = 0;

  const say = (text: string): void => { if (note.textContent !== text) setText(note, text); };
  const load = async (force: boolean): Promise<void> => {
    const url = loadPrefs().comfyuiUrl.trim(), mine = ++seq;
    if (!/^https?:\/\/./i.test(url)) { say('Set the ComfyUI address in Preferences > Plugins.'); return; }
    if (!force && loadedFor === url) return;
    say(`Looking for ComfyUI at ${url}...`);
    const s = await api.comfyuiStatus(url);
    if (mine !== seq) return;
    if (!s?.running) { setHidden(frame, true); loadedFor = ''; setText(count, ''); say(`ComfyUI is not running at ${url}. Start it, or change the address in Preferences > Plugins, then press Reload.`); return; }
    loadedFor = url;
    setText(count, s.version ?? '');
    setHidden(frame, false);
    frame.src = url;
    say(`${url}. If the page stays blank, ComfyUI refuses to be framed: use Open in browser.`);
  };

  const pick = q<HTMLSelectElement>(sec, '[data-recipe]'), nameBox = q<HTMLInputElement>(sec, '[data-name]');
  const syncPick = (): void => {
    const labels = ['New recipe', ...recipes().map((r) => r.name)];
    while (pick.options.length > labels.length) pick.remove(pick.options.length - 1);
    labels.forEach((t, i) => {
      let o = pick.options[i];
      if (!o) { o = document.createElement('option'); pick.appendChild(o); }
      const v = i === 0 ? '' : t;
      if (o.getAttribute('value') !== v) o.setAttribute('value', v);
      if (o.textContent !== t) o.textContent = t;
    });
    nameBox.disabled = pick.value !== '';
  };
  pick.addEventListener('focus', syncPick);
  pick.addEventListener('change', syncPick);
  /** Save graph: the graph ComfyUI ran last replaces the chosen recipe or becomes a new one, then ComfyUI is asked what it lacks. */
  const saveGraph = async (): Promise<void> => {
    const url = loadPrefs().comfyuiUrl.trim(), name = (pick.value || nameBox.value.trim()).slice(0, 100);
    if (!name) { say('Type a name for the new recipe, or choose one to replace.'); nameBox.focus(); return; }
    try {
      const text = await api.comfyuiGraph(url), problem = addRecipe(name, text);
      if (problem) { say(problem); return; }
      nameBox.value = '';
      syncPick();
      pick.value = '';
      const probe = await api.comfyuiProbe(url, [{ name, workflow: text }]).catch(() => null), c = probe?.recipes?.find((x) => x.name === name);
      const gaps = c ? [c.missing_nodes.length ? `${c.missing_nodes.length} missing node${c.missing_nodes.length === 1 ? '' : 's'} (${c.missing_nodes.join(', ')})` : '', c.missing_models.length ? `${c.missing_models.length} model file${c.missing_models.length === 1 ? '' : 's'} not listed` : ''].filter(Boolean) : [];
      say(`${name} saved from the last graph ComfyUI ran${c ? (gaps.length ? `. ComfyUI lacks ${gaps.join(' and ')}.` : '. Every node and model it needs is there.') : '.'}`);
    } catch (err) { say(err instanceof Error ? err.message : 'The graph could not be read.'); }
  };
  q(sec, '[data-act="save-graph"]').addEventListener('click', () => { void saveGraph(); });
  syncPick();

  q(sec, '[data-act="reload"]').addEventListener('click', () => { void load(true); });
  q(sec, '[data-act="browser"]').addEventListener('click', () => {
    const url = loadPrefs().comfyuiUrl.trim();
    if (/^https?:\/\/./i.test(url)) window.open(url, '_blank', 'noopener');
  });
  new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) void load(false); }).observe(sec);
}
