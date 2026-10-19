import { api } from '../io/api';
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

  q(sec, '[data-act="reload"]').addEventListener('click', () => { void load(true); });
  q(sec, '[data-act="browser"]').addEventListener('click', () => {
    const url = loadPrefs().comfyuiUrl.trim();
    if (/^https?:\/\/./i.test(url)) window.open(url, '_blank', 'noopener');
  });
  new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) void load(false); }).observe(sec);
}
