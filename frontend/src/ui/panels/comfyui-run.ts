import { Raster, type Engine } from '../../engine';
import { api, ApiError } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { loadPrefs } from '../prefs';
import { imagesFor, toPng } from './send-to';
import { ReferencePicker } from './references';

const KEPT = 'formvis.comfyui.workflow';

/** File > Run ComfyUI Workflow (1.51.1): a workflow saved from ComfyUI with Export (API) runs on ComfyUI with formvis's
 *  image (or the selection and its mask) and an optional prompt, and its results come back as layers, masked to the
 *  selection when one was sent, scaled to the document when their size differs. The last workflow is remembered. */
export class RunWorkflowDialog extends Dialog {
  private readonly file = el<HTMLInputElement>('<input type="file" accept=".json,application/json" aria-label="Workflow" hidden>');
  private readonly pick = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Choose...</button>');
  private readonly chosen = el('<span class="cv-note cv-run-chosen"></span>');
  private readonly input = el<HTMLSelectElement>('<select class="cv-input" aria-label="Input"><option value="flattened">Flattened image</option><option value="selection">Selection (image and mask)</option></select>');
  private readonly prompt = el<HTMLTextAreaElement>('<textarea class="cv-input" rows="3" aria-label="Prompt" placeholder="For a text node titled \'formvis prompt\' (optional)"></textarea>');
  private readonly status = el('<p class="cv-note cv-run-status" role="status"></p>');
  private workflow: { name: string; json: string } | null = null;
  private job: string | null = null;
  private readonly refs: ReferencePicker;
  private timer = 0;

  constructor(private readonly engine: Engine, private readonly toast: (text: string) => void) {
    super('Run ComfyUI Workflow', 420);
    const row = (label: string, ...c: HTMLElement[]): HTMLElement => { const r = el(`<label class="cv-dialog-row"><span>${label}</span></label>`); r.append(...c); return r; };
    this.pick.addEventListener('click', () => this.file.click());
    this.file.addEventListener('change', () => void this.choose());
    this.refs = new ReferencePicker(engine);
    this.body.append(row('Workflow', this.pick, this.chosen, this.file), row('Input', this.input), row('Prompt', this.prompt), this.refs.el, this.status);
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
    this.refs.refresh(false);
    this.open();
  }

  private async choose(): Promise<void> {
    const f = this.file.files?.[0];
    this.file.value = '';
    if (!f) return;
    const json = await f.text();
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
    try {
      const refs = await this.refs.chosen();
      const parts = [...await Promise.all(imgs.map(async (x, i) => ({ name: `${i}.png`, blob: await toPng(x.surface) }))), ...refs.map((r, i) => ({ name: `ref${i}.png`, blob: r.blob }))];
      const r = await api.comfyuiRun(target, w.json, [...imgs.map((x) => x.item), ...refs.map((x) => ({ name: x.name, kind: 'reference' }))], parts, this.prompt.value.trim() ? this.prompt.value.trim() : null);
      this.job = r.job;
      const notes = [r.prompt || !this.prompt.value.trim() ? '' : 'No text node is titled formvis prompt, so the prompt was not used.', sel && !r.mask ? 'The workflow has no Load Image (as Mask), so the mask was not used.' : ''].filter(Boolean).join(' ');
      this.follow(target, r.job, sel, p.id, notes);
    } catch (err) {
      setText(this.status, err instanceof ApiError ? err.message : 'Running the workflow failed: the formvis engine is offline (./formvis boot).');
    }
  }

  /** Polls the job once a second until it ends, the dialog closes, or it is cancelled; then layers the results. */
  private follow(target: string, job: string, sel: { x: number; y: number; w: number; h: number; surface(): CanvasImageSource } | null, docId: string, notes: string): void {
    clearInterval(this.timer);
    this.timer = window.setInterval(async () => {
      if (this.job !== job) { clearInterval(this.timer); return; }
      try {
        const s = await api.comfyuiJob(job, target);
        if (this.job !== job) return;
        if (s.state === 'queued') setText(this.status, `Queued in ComfyUI${s.ahead ? `, ${s.ahead} ahead` : ''}. ${notes}`);
        else if (s.state === 'running') setText(this.status, `Running in ComfyUI... ${notes}`);
        else {
          clearInterval(this.timer);
          this.job = null;
          if (s.state === 'failed') { setText(this.status, s.detail ?? 'ComfyUI stopped the workflow with an error.'); return; }
          await this.layer(target, s.images ?? [], sel, docId);
        }
      } catch (err) { clearInterval(this.timer); this.job = null; setText(this.status, err instanceof ApiError ? err.message : 'Lost touch with ComfyUI.'); }
    }, 1000);
  }

  private async layer(target: string, images: Array<{ filename: string; subfolder: string }>, sel: { x: number; y: number; surface(): CanvasImageSource } | null, docId: string): Promise<void> {
    const p = this.engine.current;
    if (!p || p.id !== docId) { setText(this.status, 'The workflow finished, but its document is no longer the active one.'); return; }
    if (!images.length) { setText(this.status, 'The workflow finished without saving an image (it needs a Save Image node).'); return; }
    const W = p.doc.width, H = p.doc.height;
    for (const [i, im] of images.entries()) {
      const bitmap = await createImageBitmap(await api.comfyuiImage(target, im.filename, im.subfolder));
      const r = new Raster(W, H);
      r.ctx.drawImage(bitmap, 0, 0, W, H);   // scaled to the document when its size differs
      bitmap.close();
      r.touch();
      let mask: Raster | null = null;
      if (sel) { mask = new Raster(W, H); mask.ctx.drawImage(sel.surface(), sel.x, sel.y); mask.touch(); }
      this.engine.insertRasterLayer(r, images.length > 1 ? `ComfyUI result ${i + 1}` : 'ComfyUI result', 0, 0, mask ? { mask: { raster: mask, enabled: true, linked: true, placement: null } } : {}, 'ComfyUI Result');
    }
    this.close();
    this.toast(`${images.length === 1 ? 'The result' : `${images.length} results`} from ComfyUI added as ${images.length === 1 ? 'a layer' : 'layers'}${sel ? ', masked to the selection' : ''}.`);
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
