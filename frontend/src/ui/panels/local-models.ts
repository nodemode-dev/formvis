import { el, setHidden, setText } from '../dom';

/** Preferences > Plugins > Local models (1.52.9): Krea 2 Turbo and FLUX.2 [klein] 4B installed on this computer, each
 *  licence shown and accepted before anything downloads (Krea 2's content filter installed with it, as its licence
 *  requires), a build chosen, the download followed and cancellable; the LoRA library and checkpoints. */
type Json = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any

async function api(path: string, init?: RequestInit): Promise<Json> {
  const r = await fetch(`/api${path}`, { ...init, headers: { 'x-formvis-local': '1', ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) } });
  if (!r.ok) { let d = r.statusText; try { const j = await r.json() as Json; if (typeof j.detail === 'string') d = j.detail; } catch { /* the status */ } throw new Error(d); }
  return r.json() as Promise<Json>;
}
const gb = (bytes: number): string => `${(bytes / 1e9).toFixed(1)} GB`;
const li = (items: string[]): HTMLElement => { const u = el('<ul class="cv-local-summary"></ul>'); for (const t of items) { const l = document.createElement('li'); l.textContent = t; u.append(l); } return u; };
const link = (href: string, text: string): HTMLElement => { const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = text; return a; };

export class LocalModelsSection {
  readonly el = el('<div class="cv-panel-section cv-local-models"><span class="cv-refs-title">Local models (this computer)</span></div>');
  private readonly krea = el('<div class="cv-local-card" data-model="krea-2"></div>');
  private readonly klein = el('<div class="cv-local-card" data-model="klein"></div>');
  private readonly library = el('<div class="cv-local-card" data-model="loras"></div>');
  private readonly upscaler = el('<div class="cv-local-card" data-model="ai-upscale"></div>');
  private readonly lama = el('<div class="cv-local-card" data-model="lama-inpaint"></div>');
  private readonly depth = el('<div class="cv-local-card" data-model="depth-anything-v2-small"></div>');
  private readonly ddcolor = el('<div class="cv-local-card" data-model="ddcolor-tiny"></div>');
  private readonly styles = el('<div class="cv-local-card" data-model="fast-style"></div>');
  private job: string | null = null;

  constructor() {
    this.el.append(el('<p class="cv-note">Models that run here, with no key and no cost: they appear in Generate Image, and Krea 2 in Generative Fill. They are large, and each licence is shown for you to accept before anything downloads.</p>'), this.lama, this.depth, this.ddcolor, this.styles, this.upscaler, this.krea, this.klein, this.library);
  }

  async refresh(): Promise<void> {
    try { await Promise.all([this.showDownload(this.lama, 'lama-inpaint', 'LaMa inpainting', 'Download LaMa', 'about 208 MB', 'Generative Fill and Expand on any computer, with no prompt, key or cost: it fills from what surrounds the selection. Apache-2.0.'), this.showDownload(this.depth, 'depth-anything-v2-small', 'Depth Anything V2 Small', 'Download Depth Anything', 'about 99 MB', 'Depth from one picture for the Neural Filters\' Depth Blur, on any computer. The Small checkpoint, Apache-2.0.'), this.showDownload(this.ddcolor, 'ddcolor-tiny', 'DDColor-tiny', 'Download DDColor', 'about 135 MB', 'Colour for black-and-white pictures in the Neural Filters, on any computer; the picture\'s own light is kept. Apache-2.0.'), this.showDownload(this.styles, 'fast-style', 'Style Transfer presets', 'Download the styles', 'about 34 MB', 'Five preset styles (Mosaic, Candy, Rain Princess, Udnie, Pointilism) for the Neural Filters, the ONNX model zoo\'s fast neural style models, on any computer. BSD-3-Clause.'), this.showUpscaler(), this.showKrea(), this.showKlein(), this.showLibrary()]); }
    catch { this.krea.replaceChildren(el('<p class="cv-note">The formvis engine is offline: local models need it.</p>')); }
  }

  private async follow(job: string, note: HTMLElement, done: () => void): Promise<void> {
    this.job = job;
    while (this.job === job) {
      await new Promise((ok) => setTimeout(ok, 800));
      let j: Json;
      try { j = await api(`/jobs/${job}`); } catch { setText(note, 'Lost touch with the engine.'); return; }
      if (j.status === 'done') { setText(note, 'Installed.'); this.job = null; done(); return; }
      if (['error', 'failed', 'cancelled'].includes(j.status)) { setText(note, j.error || j.message || 'The download stopped.'); this.job = null; done(); return; }
      setText(note, `${j.message ?? 'Downloading'}${typeof j.progress === 'number' ? ` (${Math.round(j.progress * 100)}%)` : ''}`);
    }
  }

  private cancelButton(note: HTMLElement): HTMLButtonElement {
    const b = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Cancel</button>');
    b.addEventListener('click', () => { const j = this.job; this.job = null; if (j) void api(`/jobs/${j}`, { method: 'DELETE' }).catch(() => undefined); setText(note, 'Cancelled.'); });
    return b;
  }

  /** A model with no licence to accept (1.53.2: LaMa), downloaded here. */
  private async showDownload(card: HTMLElement, id: string, name: string, button: string, size: string, what: string): Promise<void> {
    const all = await api('/models') as unknown as Json[], m = all.find((x) => x.id === id);
    const state = el('<p class="cv-local-state" role="status"></p>'), note = el('<p class="cv-note cv-local-note" role="status"></p>'), info = el('<p class="cv-note"></p>');
    setText(state, m?.ready ? `${name}: downloaded, ready.` : `${name}: not downloaded (${size}).`); setText(info, what);
    const get = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-primary"></button>'); setText(get, button);
    get.disabled = !m || !!m.ready;
    get.addEventListener('click', () => void (async () => { try { const j = await api(`/models/${id}/download`, { method: 'POST' }); await this.follow(j.job_id, note, () => void this.showDownload(card, id, name, button, size, what)); } catch (err) { setText(note, err instanceof Error ? err.message : 'Could not start the download.'); } })());
    const row = el('<div class="cv-improve"></div>'); row.append(get);
    card.replaceChildren(state, info, row, note);
  }

  /** Real-ESRGAN x4plus (1.53.1): Image > Upscale on this computer; BSD-3-Clause, so no licence to accept. */
  private async showUpscaler(): Promise<void> {
    const all = await api('/models') as unknown as Json[], m = all.find((x) => x.id === 'ai-upscale');
    const state = el('<p class="cv-local-state" role="status"></p>'), note = el('<p class="cv-note cv-local-note" role="status"></p>');
    setText(state, m?.ready ? 'Real-ESRGAN x4plus: downloaded, ready for Image > Upscale.' : 'Real-ESRGAN x4plus: not downloaded (about 67 MB).');
    const get = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-primary">Download Real-ESRGAN</button>');
    get.disabled = !m || !!m.ready;
    get.addEventListener('click', () => void (async () => { try { const j = await api('/models/ai-upscale/download', { method: 'POST' }); await this.follow(j.job_id, note, () => void this.showUpscaler()); } catch (err) { setText(note, err instanceof Error ? err.message : 'Could not start the download.'); } })());
    const row = el('<div class="cv-improve"></div>'); row.append(get);
    this.upscaler.replaceChildren(state, el('<p class="cv-note">Enlarges pictures two or four times on this computer, in tiles, with no key and no cost. BSD-3-Clause.</p>'), row, note);
  }

  private async showKrea(): Promise<void> {
    const [t, s] = await Promise.all([api('/models/krea-2/terms'), api('/models/krea-2/status')]);
    const lic = t.licence as Json, builds = Object.entries(t.builds as Json);
    const state = el('<p class="cv-local-state" role="status"></p>'), note = el('<p class="cv-note cv-local-note" role="status"></p>');
    setText(state, s.ready ? `Krea 2 Turbo: installed (${s.build}), ready.` : `Krea 2 Turbo: ${s.reason}.`);
    const accept = el<HTMLInputElement>('<input type="checkbox" aria-label="Accept the Krea 2 licence">');
    accept.checked = !!s.licenceAccepted; accept.disabled = !!s.licenceAccepted;
    const acceptRow = el('<label class="cv-dialog-row"><span></span></label>');
    setText(acceptRow.querySelector('span') as HTMLElement, `I accept the ${lic.name} (${lic.version})`);
    acceptRow.append(accept);
    const links = el('<p class="cv-note"></p>'); links.append(link(lic.url, 'The licence'), document.createTextNode(' · '), link(lic.usePolicy, 'The use policy'));
    const pick = el<HTMLSelectElement>('<select class="cv-input" aria-label="Krea 2 build"></select>');
    for (const [id, b] of builds) { const o = document.createElement('option'); o.value = id; o.textContent = `${(b as Json).label}: ${gb((b as Json).size)}, ${(b as Json).memory} GB of memory`; o.title = (b as Json).note ?? ''; pick.append(o); }
    if (t.recommended) pick.value = t.recommended;
    const install = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-primary">Install Krea 2</button>');
    install.disabled = !s.licenceAccepted || !builds.length || !!s.ready;
    accept.addEventListener('change', () => void (async () => { if (!accept.checked) return; await api('/models/krea-2/consent', { method: 'POST', body: JSON.stringify({ acceptLicence: true }) }); await this.showKrea(); })());
    const cancel = this.cancelButton(note); setHidden(cancel, true);
    install.addEventListener('click', () => void (async () => {
      try { const j = await api('/models/krea-2/install', { method: 'POST', body: JSON.stringify({ build: pick.value }) }); setHidden(cancel, false); await this.follow(j.job_id, note, () => { setHidden(cancel, true); void this.showKrea(); }); }
      catch (err) { setText(note, err instanceof Error ? err.message : 'Could not start the install.'); }
    })());
    const f = t.filter as Json, filt = el('<p class="cv-note cv-local-filter"></p>');
    setText(filt, s.filterRemoved ? `The content filter (${f.name}) was removed: every Krea 2 picture carries a warning.` : `The content filter (${f.name}, ${f.licence}, ${gb(f.size)}) is installed with Krea 2, as its licence requires, and checks every picture.`);
    const refilter = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Reinstall the filter</button>');
    setHidden(refilter, !s.filterRemoved);
    refilter.addEventListener('click', () => void (async () => { const j = await api('/models/krea-2/filter', { method: 'POST', body: '{}' }); await this.follow(j.job_id, note, () => void this.showKrea()); })());
    const row = el('<div class="cv-improve"></div>'); row.append(pick, install, cancel, refilter);
    this.krea.replaceChildren(state, li(lic.summary ?? []), links, acceptRow, row, filt, note,
      el(`<p class="cv-note">This machine: about ${Number(t.memoryGB).toFixed(0)} GB of memory. ${builds.length ? '' : 'No Krea 2 build runs on this kind of computer.'}</p>`));
  }

  private async showKlein(): Promise<void> {
    const t = await api('/models/klein/terms');
    const cards: HTMLElement[] = [];
    for (const [variant, v] of Object.entries(t.variants as Json)) {
      const lic = (v as Json).licence as Json, note = el('<p class="cv-note cv-local-note" role="status"></p>');
      const accept = el<HTMLInputElement>(`<input type="checkbox" aria-label="Accept the ${(v as Json).label} licence">`);
      const st = (v as Json).status as Json;   // licenceAccepted, build, ready, reason
      accept.checked = !!st.licenceAccepted; accept.disabled = !!st.licenceAccepted;
      const acceptRow = el('<label class="cv-dialog-row"><span></span></label>');
      setText(acceptRow.querySelector('span') as HTMLElement, `I accept the ${lic.name} for ${(v as Json).label}`);
      acceptRow.append(accept);
      accept.addEventListener('change', () => void (async () => { if (!accept.checked) return; await api('/models/klein/consent', { method: 'POST', body: JSON.stringify({ variant, acceptLicence: true }) }); await this.showKlein(); })());
      const install = el<HTMLButtonElement>(`<button type="button" class="cv-btn cv-btn-primary">Install ${(v as Json).label}</button>`);
      install.disabled = !st.licenceAccepted || !!st.build;
      const pick = el<HTMLSelectElement>(`<select class="cv-input" aria-label="${(v as Json).label} build"></select>`);
      for (const [id, b] of Object.entries((v as Json).builds as Json)) { const o = document.createElement('option'); o.value = id; o.textContent = String((b as Json).label); o.disabled = (b as Json).available === false; pick.append(o); }
      const cancel = this.cancelButton(note); setHidden(cancel, true);
      install.addEventListener('click', () => void (async () => {
        try { const j = await api('/models/klein/install', { method: 'POST', body: JSON.stringify({ variant, build: pick.value }) }); setHidden(cancel, false); await this.follow(j.job_id, note, () => { setHidden(cancel, true); void this.showKlein(); }); }
        catch (err) { setText(note, err instanceof Error ? err.message : 'Could not start the install.'); }
      })());
      const title = el('<p class="cv-local-state"></p>'); setText(title, st.ready ? `${(v as Json).label}: installed (${st.build}), ready.` : `${(v as Json).label}: ${st.reason ?? 'not installed'}.`);
      const links = el('<p class="cv-note"></p>'); links.append(link(lic.url, 'The licence'));
      const row = el('<div class="cv-improve"></div>'); row.append(pick, install, cancel);
      cards.push(title, li(lic.summary ?? []), links, acceptRow, row, note);
    }
    this.klein.replaceChildren(...cards);
  }

  private async showLibrary(): Promise<void> {
    const [l, c] = await Promise.all([api('/loras'), api('/checkpoints')]);
    const list = el('<div class="cv-local-loras"></div>');
    for (const e of l.loras as Json[]) {
      const row = el('<div class="cv-plugins-row"><span></span><button type="button" class="cv-btn cv-btn-ghost">Remove</button></div>');
      setText(row.querySelector('span') as HTMLElement, `${e.name} (${(l.bases as Json)[e.base] ?? e.base})`);
      (row.querySelector('button') as HTMLButtonElement).addEventListener('click', () => void (async () => { const [base, stem] = String(e.id).split('/'); await api(`/loras/${encodeURIComponent(base)}/${encodeURIComponent(stem)}`, { method: 'DELETE' }); await this.showLibrary(); })());
      list.append(row);
    }
    if (!(l.loras as Json[]).length) list.append(el('<p class="cv-note">No LoRAs yet.</p>'));
    const base = el<HTMLSelectElement>('<select class="cv-input" aria-label="LoRA base model"></select>');
    for (const [id, label] of Object.entries(l.bases as Json)) { const o = document.createElement('option'); o.value = id; o.textContent = String(label); base.append(o); }
    const file = el<HTMLInputElement>('<input type="file" accept=".safetensors" aria-label="LoRA file" hidden>'), add = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Add LoRA...</button>');
    const note = el('<p class="cv-note" role="status"></p>');
    add.addEventListener('click', () => file.click());
    file.addEventListener('change', () => void (async () => {
      const f = file.files?.[0]; file.value = ''; if (!f) return;
      const form = new FormData(); form.append('file', f); form.append('base', base.value);
      try { await api('/loras/import', { method: 'POST', body: form }); await this.showLibrary(); } catch (err) { setText(note, err instanceof Error ? err.message : 'Could not add it.'); }
    })());
    const row = el('<div class="cv-improve"></div>'); row.append(base, add, file);
    const ck = (c.checkpoints as Json[]).map((x) => x.name ?? x.id);
    const where = el('<p class="cv-note"></p>');
    setText(where, `Checkpoints (your own fine-tunes, in mflux's format): ${ck.length ? ck.join(', ') : 'none yet'}. Drop each in a folder of its own under ${Object.values(c.folders as Json).join(' or ')}.`);
    this.library.replaceChildren(el('<p class="cv-local-state">LoRAs</p>'), list, row, note, where);
  }
}
