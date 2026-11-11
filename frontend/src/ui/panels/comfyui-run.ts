import { Raster, type Engine } from '../../engine';
import { api, ApiError } from '../../io/api';
import { apiWorkflow, countRun, jobWords } from '../../io/comfy';
import { Dialog } from '../dialogs';
import { el, setClass, setHidden, setText } from '../dom';
import { loadPrefs } from '../prefs';
import { imagesFor, toPng } from './send-to';
import { ReferencePicker, controlPictures } from './references';
import { PromptImprover } from './prompt-improver';

const KEPT = 'formvis.comfyui.workflow';

/** File > Run ComfyUI Workflow (1.51.1): a workflow saved from ComfyUI with Export (API) runs on ComfyUI with formvis's
 *  image (or the selection and its mask) and an optional prompt, and its results come back as layers, masked to the
 *  selection when one was sent, scaled to the document when their size differs. The last workflow is remembered. */
export class RunWorkflowDialog extends Dialog {
  private readonly file = el<HTMLInputElement>('<input type="file" accept=".json,application/json" aria-label="Workflow" hidden>');
  private readonly pick = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Choose...</button>');
  private readonly chosen = el('<span class="cv-note cv-run-chosen"></span>');
  private readonly input = el<HTMLSelectElement>('<select class="cv-input" aria-label="Input"><option value="flattened">Flattened image</option><option value="selection">Selection (image and mask)</option></select>');
  private readonly size = el<HTMLSelectElement>('<select class="cv-input" aria-label="Result size"><option value="fit">Fit the document</option><option value="keep">Keep its size (new document, for an upscale)</option></select>');
  private readonly prompt = el<HTMLTextAreaElement>('<textarea class="cv-input" rows="3" aria-label="Prompt" placeholder="For a text node titled \'formvis prompt\' (optional)"></textarea>');
  private readonly status = el('<p class="cv-note cv-run-status" role="status"></p>');
  private readonly fill = el('<i></i>');
  private readonly bar = el('<div class="cv-run-bar" role="progressbar" aria-label="ComfyUI progress" aria-valuemin="0" aria-valuemax="100" hidden></div>');
  private workflow: { name: string; json: string } | null = null;
  private job: string | null = null;
  private readonly refs: ReferencePicker;
  private readonly improver: PromptImprover;
  private timer = 0;

  constructor(private readonly engine: Engine, private readonly toast: (text: string) => void) {
    super('Run ComfyUI Workflow', 420);
    const row = (label: string, ...c: HTMLElement[]): HTMLElement => { const r = el(`<label class="cv-dialog-row"><span>${label}</span></label>`); r.append(...c); return r; };
    this.pick.addEventListener('click', () => this.file.click());
    this.file.addEventListener('change', () => void this.choose());
    this.refs = new ReferencePicker(engine);
    this.improver = new PromptImprover(this.prompt, 'Richer detail');
    this.bar.append(this.fill);
    this.body.append(row('Workflow', this.pick, this.chosen, this.file), row('Input', this.input), row('Result size', this.size), row('Prompt', this.prompt), this.improver.el, this.refs.el, this.bar, this.status);
    this.button('Cancel', 'ghost', () => void this.stop());
    this.button('Run', 'primary', () => void this.run());
    try { const k = JSON.parse(localStorage.getItem(KEPT) ?? 'null') as { name: string; json: string } | null; if (k?.json) this.workflow = k; } catch { /* none kept */ }
  }

  show(): void {
    const p = this.engine.current;
    if (!p) return;
    (this.input.querySelector('option[value="selection"]') as HTMLOptionElement).disabled = !p.selection;
    this.input.value = p.selection ? 'selection' : 'flattened';
    setText(this.chosen, this.workflow ? this.workflow.name : 'None chosen: in ComfyUI, save it with Export (API).');
    setText(this.status, '');
    setHidden(this.bar, true);
    this.refs.refresh(false);
    this.improver.refresh();
    this.open();
  }

  private async choose(): Promise<void> {
    const f = this.file.files?.[0];
    this.file.value = '';
    if (!f) return;
    let json = await f.text();
    try { json = await apiWorkflow(json, loadPrefs().comfyuiUrl, f.name); } catch (err) { setText(this.status, err instanceof Error ? err.message : `${f.name} could not be converted.`); return; }
    try {
      const w = JSON.parse(json) as Record<string, unknown>;
      if ('nodes' in w || !Object.values(w).every((n) => typeof n === 'object' && n !== null && 'class_type' in n)) {
        setText(this.status, `${f.name} is in ComfyUI's editor format. In ComfyUI, save it with Export (API) and choose that file.`);
        return;
      }
    } catch { setText(this.status, `${f.name} is not a ComfyUI workflow.`); return; }
    this.workflow = { name: f.name, json };
    setText(this.chosen, f.name);
    setText(this.status, '');
    try { if (json.length < 500_000) localStorage.setItem(KEPT, JSON.stringify(this.workflow)); } catch { /* not kept; still used */ }
  }

  private async run(): Promise<void> {
    const p = this.engine.current, w = this.workflow;
    if (!p || this.job) return;
    if (!w) { setText(this.status, 'Choose a workflow first (in ComfyUI, save it with Export (API)).'); return; }
    const target = loadPrefs().comfyuiUrl, what = this.input.value === 'selection' && p.selection ? 'selection' : 'flattened', sel = what === 'selection' ? p.selection : null;
    const imgs = imagesFor(this.engine, what, 'comfyui', p.name);
    setText(this.status, 'Sending to ComfyUI...');
    const sentAt = Date.now(), run = countRun();
    try {
      const refs = await this.refs.chosen();
      const controls = await controlPictures(this.engine, this.refs.fitValue());
      const parts = [...await Promise.all(imgs.map(async (x, i) => ({ name: `${i}.png`, blob: await toPng(x.surface) }))), ...refs.map((r, i) => ({ name: `ref${i}.png`, blob: r.blob })), ...controls.map((c) => ({ name: `control-${c.role}.png`, blob: c.blob }))];
      const r = await api.comfyuiRun(target, w.json, [...imgs.map((x) => x.item), ...refs.map((x) => ({ name: x.name, kind: 'reference' })), ...controls.map((c) => ({ name: c.name, kind: `control ${c.role}` }))], parts, this.prompt.value.trim() ? this.prompt.value.trim() : null);
      if (!this.isOpen) { void api.comfyuiCancel(r.job, target); return; }
      this.job = r.job;
      setClass(this.bar, 'is-wait', true);
      this.fill.style.width = '';
      setHidden(this.bar, false);
      const notes = [r.prompt || !this.prompt.value.trim() ? '' : 'No text node is titled formvis prompt, so the prompt was not used.', sel && !r.mask ? 'The workflow has no Load Image (as Mask), so the mask was not used.' : ''].filter(Boolean).join(' ');
      this.follow(target, r.job, sel, p.id, notes, sentAt, run);
    } catch (err) {
      setText(this.status, err instanceof ApiError ? err.message : 'Running the workflow failed: the formvis engine is offline (./formvis boot).');
    }
  }

  /** Polls the job once a second until it ends, the dialog closes, or it is cancelled; then layers the results. */
  private follow(target: string, job: string, sel: { x: number; y: number; w: number; h: number; surface(): CanvasImageSource } | null, docId: string, notes: string, sentAt: number, run: number): void {
    clearInterval(this.timer);
    this.timer = window.setInterval(async () => {
      if (this.job !== job) { clearInterval(this.timer); return; }
      try {
        const s = await api.comfyuiJob(job, target);
        if (this.job !== job) return;
        if (s.state === 'queued' || s.state === 'running') {
          setText(this.status, `${jobWords(s, sentAt, run)}. ${notes}`);
          const p = s.state === 'running' ? s.progress : undefined;
          setClass(this.bar, 'is-wait', !p);
          this.fill.style.width = p && p.max > 0 ? `${Math.round((100 * p.value) / p.max)}%` : '';
          if (p && p.max > 0) this.bar.setAttribute('aria-valuenow', String(Math.round((100 * p.value) / p.max))); else this.bar.removeAttribute('aria-valuenow');
        } else {
          clearInterval(this.timer);
          this.job = null;
          setHidden(this.bar, true);
          if (s.state === 'failed') { setText(this.status, s.detail ?? 'ComfyUI stopped the workflow with an error.'); return; }
          await this.layer(target, s.images ?? [], sel, docId);
        }
      } catch (err) { clearInterval(this.timer); this.job = null; setHidden(this.bar, true); setText(this.status, err instanceof ApiError ? err.message : 'Lost touch with ComfyUI.'); }
    }, 1000);
  }

  private async layer(target: string, images: Array<{ filename: string; subfolder: string }>, sel: { x: number; y: number; surface(): CanvasImageSource } | null, docId: string): Promise<void> {
    const p = this.engine.current;
    if (!p || p.id !== docId) { setText(this.status, 'The workflow finished, but its document is no longer the active one.'); return; }
    if (!images.length) { setText(this.status, 'The workflow finished without saving an image (it needs a Save Image node).'); return; }
    let W = p.doc.width, H = p.doc.height, own = false;
    for (const [i, im] of images.entries()) {
      const bitmap = await createImageBitmap(await api.comfyuiImage(target, im.filename, im.subfolder));
      if (this.size.value === 'keep' && !sel && !own && (bitmap.width !== W || bitmap.height !== H) && this.engine.newDocument(bitmap.width, bitmap.height, `${p.name} ComfyUI`)) { W = bitmap.width; H = bitmap.height; own = true; }   // an upscale keeps its size in a document of its own
      const r = new Raster(W, H);
      r.ctx.drawImage(bitmap, 0, 0, W, H);   // scaled to the document when its size differs
      bitmap.close();
      r.touch();
      let mask: Raster | null = null;
      if (sel) { mask = new Raster(W, H); mask.ctx.drawImage(sel.surface(), sel.x, sel.y); mask.touch(); }
      this.engine.insertRasterLayer(r, images.length > 1 ? `ComfyUI result ${i + 1}` : 'ComfyUI result', 0, 0, mask ? { mask: { raster: mask, enabled: true, linked: true, placement: null } } : {}, 'ComfyUI Result');
    }
    this.close();
    this.toast(`${images.length === 1 ? 'The result' : `${images.length} results`} from ComfyUI added as ${images.length === 1 ? 'a layer' : 'layers'}${own ? ` in a new ${W} by ${H} document` : sel ? ', masked to the selection' : ''}.`);
  }

  private async stop(): Promise<void> { this.close(); }

  /** Closing, by Cancel, Escape or otherwise, cancels a job still running: its results would have nowhere to go. */
  close(): void {
    const job = this.job;
    this.job = null;
    clearInterval(this.timer);
    if (job) void api.comfyuiCancel(job, loadPrefs().comfyuiUrl);
    super.close();
  }
}
