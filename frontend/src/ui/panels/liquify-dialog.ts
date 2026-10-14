import type { Engine, ID } from '../../engine';
import { clearFreeze, dabField, fieldIsZero, freezeAt, invertFreeze, liquifyImage, makeField, meshFromJson, meshToJson, paintFreeze, pushField, pushLeftField, resetField, type LiquifyField, type LiquifyTool } from '../../engine/liquify';
import { FACE_SLIDERS, faceField, noFaceChange, type Face, type FaceSettings, type FaceSlider } from '../../engine/face-liquify';
import { faceReady, findFaces } from '../../io/local-gen';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { paint } from '../palette';
import { toast } from '../toast';
import { sliderRow, type Row } from './controls';

const PW = 640, PH = 440;
const TOOLS: ReadonlyArray<readonly [LiquifyTool, string]> = [['warp', 'Forward Warp'], ['pushLeft', 'Push Left'], ['reconstruct', 'Reconstruct'], ['twirlCW', 'Twirl Clockwise'], ['twirlCCW', 'Twirl Counterclockwise'], ['pucker', 'Pucker'], ['bloat', 'Bloat'], ['freeze', 'Freeze Mask'], ['thaw', 'Thaw Mask']];

/** Filter > Liquify (Shift+Mod+X), Photoshop's workspace: the active layer in a preview, brushed with Forward Warp,
 *  Reconstruct, Twirl either way, Pucker or Bloat; Restore All clears the field; OK applies once as a Liquify step,
 *  Cancel leaves the layer untouched. The field is kept at the layer's full resolution and the preview is resampled
 *  from the original pixels each frame, so strokes never soften one another. The preview keeps one size whatever
 *  the layer's, so the dialog never resizes. */
export class LiquifyDialog extends Dialog {
  private tool: LiquifyTool = 'warp';
  private size = 100;
  private pressure = 50;
  private liq: LiquifyField | null = null;
  /** Face-Aware Liquify (1.56.7): the faces the engine found, the sliders, and the note under them. */
  private faces: Face[] = [];
  private faceSet: FaceSettings = noFaceChange();
  private readonly faceRows = new Map<FaceSlider, Row<number>>();
  private readonly faceNote = el('<p class="cv-dialog-note" role="status" style="min-height: 1.4em"></p>');
  private src: ImageData | null = null;
  private layerId: ID | null = null;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private shown: ImageData | null = null;
  private frame = 0;
  private held: ReturnType<typeof setInterval> | 0 = 0;
  private last: { x: number; y: number } | null = null;
  private hover: { x: number; y: number } | null = null;
  private readonly canvas = el(`<canvas class="cv-liquify-canvas" width="${PW}" height="${PH}"></canvas>`) as HTMLCanvasElement;
  private readonly toolButtons: HTMLButtonElement[] = [];
  private readonly sizeRow: Row<number>;
  private readonly pressureRow: Row<number>;

  constructor(private readonly engine: Engine) {
    super('Liquify', PW + 48);
    const bar = el('<div class="cv-row-actions cv-liquify-tools"></div>');
    for (const [id, label] of TOOLS) {
      const b = el(`<button class="cv-btn" type="button"></button>`) as HTMLButtonElement;
      b.textContent = label;
      b.addEventListener('click', () => { this.tool = id; this.syncTools(); });
      this.toolButtons.push(b);
      bar.appendChild(b);
    }
    this.sizeRow = sliderRow('Brush size (px)', 1, 600, 1, (v) => { this.size = v; this.draw(); });
    this.pressureRow = sliderRow('Brush pressure (%)', 1, 100, 1, (v) => { this.pressure = v; });
    const restore = el('<button class="cv-btn" type="button">Restore All</button>') as HTMLButtonElement;
    restore.addEventListener('click', () => { if (this.liq) { resetField(this.liq); this.render(); } });
    const maskNone = el('<button class="cv-btn cv-btn-ghost" type="button">Mask None</button>') as HTMLButtonElement;
    maskNone.addEventListener('click', () => { if (this.liq) { clearFreeze(this.liq); this.render(); } });
    const maskInvert = el('<button class="cv-btn cv-btn-ghost" type="button">Invert Mask</button>') as HTMLButtonElement;
    maskInvert.addEventListener('click', () => { if (this.liq) { invertFreeze(this.liq); this.render(); } });
    const saveMesh = el<HTMLButtonElement>('<button class="cv-btn cv-btn-ghost" type="button">Save Mesh...</button>');
    saveMesh.addEventListener('click', () => this.saveMesh());
    const loadMesh = el<HTMLButtonElement>('<button class="cv-btn cv-btn-ghost" type="button">Load Mesh...</button>');
    loadMesh.addEventListener('click', () => this.loadMesh());
    const actions = el('<div class="cv-row-actions"></div>');
    actions.append(restore, maskNone, maskInvert, saveMesh, loadMesh);
    const findFaces = el('<button class="cv-btn" type="button">Find faces</button>') as HTMLButtonElement;
    findFaces.addEventListener('click', () => void this.findFaces());
    const resetFace = el('<button class="cv-btn cv-btn-ghost" type="button">Reset face</button>') as HTMLButtonElement;
    resetFace.addEventListener('click', () => { this.faceSet = noFaceChange(); for (const r of this.faceRows.values()) r.set(0); this.render(); });
    const faceBar = el('<div class="cv-row-actions"><strong style="margin-right: 8px">Face-Aware Liquify</strong></div>');
    faceBar.append(findFaces, resetFace);
    const grid = el('<div style="display: grid; grid-template-columns: 1fr 1fr; column-gap: 16px"></div>');
    for (const [k, label] of FACE_SLIDERS) { const r = sliderRow(label, -100, 100, 1, (v) => { this.faceSet[k] = v; this.render(); }); this.faceRows.set(k, r); grid.appendChild(r.el); }
    this.body.append(bar, this.canvas, this.sizeRow.el, this.pressureRow.el, actions, faceBar, this.faceNote, grid);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.onClose = () => this.release();
    this.bindCanvas();
    // The brush size, pressure and tool stay; the face sliders belong to the faces found in this picture.
    this.remember(Array.from(this.faceRows.values()).flatMap((r) => Array.from(r.el.querySelectorAll('input'))), {
      read: () => ({ tool: String(this.tool) }),
      write: (v) => { const t = TOOLS.find(([id]) => id === v.tool); if (t) { this.tool = t[0]; this.syncTools(); } },
      onChange: (notify) => { for (const b of this.toolButtons) b.addEventListener('click', notify); },
    });
  }

  show(): void {
    const p = this.engine.current, l = p?.activeLayer;
    if (this.isOpen || !p || !l) return;
    if (!l.raster || l.vector || l.smart || l.isGroup || l.adjustment) { toast('Liquify works on a pixel layer. Rasterize shape layers and smart objects first.'); return; }
    if (p.maskTarget && l.mask) { toast('Liquify works on layer pixels. Click the layer thumbnail to target them.'); return; }
    this.engine.settle();
    this.src = l.raster.read();
    this.layerId = l.id;
    this.liq = makeField(this.src.width, this.src.height);
    this.faces = []; this.faceSet = noFaceChange(); for (const r of this.faceRows.values()) r.set(0); setText(this.faceNote, 'Find faces to shape them with the sliders.');
    this.scale = Math.min(1, PW / this.src.width, PH / this.src.height);
    this.ox = Math.floor((PW - this.src.width * this.scale) / 2);
    this.oy = Math.floor((PH - this.src.height * this.scale) / 2);
    this.sizeRow.set(this.size);
    this.pressureRow.set(this.pressure);
    this.syncTools();
    this.render();
    this.open();
  }

  /** Alt held while dragging: Push Left pushes right instead (36.4). */
  private altDown = false;

  /** Save Mesh (36.4): the field as a JSON file through a one-shot link. */
  private saveMesh(): void {
    if (!this.liq) return;
    const url = URL.createObjectURL(new Blob([meshToJson(this.liq)], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = 'liquify-mesh.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Load Mesh (36.4): a saved field for a layer of the same size, applied to the preview. */
  private loadMesh(): void {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file || !this.liq) return;
      void file.text().then((t) => { if (this.liq && meshFromJson(this.liq, t)) this.render(); else toast('That mesh was saved for a layer of another size, or is not a liquify mesh.'); });
    });
    input.click();
  }

  private syncTools(): void { TOOLS.forEach(([id], i) => this.toolButtons[i].classList.toggle('is-active', id === this.tool)); }

  /** Pointer position on the canvas in layer pixels. */
  private at(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect(), cx = ((e.clientX - r.left) / r.width) * PW, cy = ((e.clientY - r.top) / r.height) * PH;
    return { x: (cx - this.ox) / this.scale, y: (cy - this.oy) / this.scale };
  }

  private dab(pt: { x: number; y: number }): void {
    const f = this.liq;
    if (!f) return;
    const s = this.pressure / 100;
    if (this.tool === 'warp') { if (this.last) pushField(f, this.last.x, this.last.y, pt.x, pt.y, this.size / 2, s); }
    else if (this.tool === 'pushLeft') { if (this.last) pushLeftField(f, this.last.x, this.last.y, pt.x, pt.y, this.size / 2, s, this.altDown); }
    else if (this.tool === 'freeze' || this.tool === 'thaw') paintFreeze(f, pt.x, pt.y, this.size / 2, s, this.tool === 'thaw');
    else dabField(f, this.tool, pt.x, pt.y, this.size / 2, s);
    this.last = pt;
    this.render();
  }

  private bindCanvas(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.liq) return;
      c.setPointerCapture(e.pointerId);
      this.last = this.at(e);
      if (this.tool !== 'warp' && this.tool !== 'pushLeft') { this.dab(this.last); this.held = setInterval(() => { if (this.last) this.dab(this.last); }, 50); }
    });
    c.addEventListener('pointermove', (e) => {
      this.altDown = e.altKey;
      this.hover = this.at(e);
      if (c.hasPointerCapture(e.pointerId)) this.dab(this.hover);
      else this.draw();
    });
    const end = (e: PointerEvent): void => { if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId); this.stopHeld(); this.last = null; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
  }

  private stopHeld(): void { if (this.held) clearInterval(this.held); this.held = 0; }

  /** Resamples the preview on the next frame. */
  private render(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.src || !this.liq) return;
      const w = Math.max(1, Math.round(this.src.width * this.scale)), h = Math.max(1, Math.round(this.src.height * this.scale));
      this.shown = liquifyImage(this.src, this.combined(this.liq), this.scale, w, h);
      this.draw();
    });
  }

  /** The last preview and the brush circle. */
  private draw(): void {
    const g = this.canvas.getContext('2d');
    if (!g) return;
    const pal = paint();
    g.clearRect(0, 0, PW, PH);
    if (this.shown) g.putImageData(this.shown, this.ox, this.oy);
    const f = this.liq;
    if (f?.freeze && this.shown) {
      const w = this.shown.width, h = this.shown.height, img = g.getImageData(this.ox, this.oy, w, h), d = img.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const m = freezeAt(f, x / this.scale, y / this.scale);
        if (m <= 0.01) continue;
        const i = (y * w + x) * 4, k = m * 0.5;
        d[i] = d[i] + (255 - d[i]) * k; d[i + 1] = d[i + 1] * (1 - k); d[i + 2] = d[i + 2] * (1 - k);
      }
      g.putImageData(img, this.ox, this.oy);
    }
    if (this.hover) {
      g.strokeStyle = pal.accent;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(this.ox + this.hover.x * this.scale, this.oy + this.hover.y * this.scale, Math.max(1, (this.size / 2) * this.scale), 0, Math.PI * 2);
      g.stroke();
    }
  }

  private apply(): void {
    const f = this.liq ? this.combined(this.liq) : null, id = this.layerId;
    this.close();
    if (f && id && !fieldIsZero(f)) this.engine.applyLiquify(id, f);
  }

  /** The brushes' field with the face's sliders added (Face-Aware Liquify, 1.56.7), recomputed so they never compound. */
  private combined(f: LiquifyField): LiquifyField {
    const face = this.faces[0];
    if (!face || Object.values(this.faceSet).every((v) => !v)) return f;
    const add = faceField(f, face, this.faceSet), d = new Float32Array(f.d);
    for (let i = 0; i < d.length; i++) d[i] += add[i];
    return { ...f, d };
  }

  /** Finds the faces in the layer with the engine's YuNet; the sliders work on the largest. */
  private async findFaces(): Promise<void> {
    if (!this.src) return;
    try {
      if (!(await faceReady())) { setText(this.faceNote, 'Face-Aware Liquify needs the face finder (YuNet, 232 KB, MIT): download it in Preferences > Plugins > Local models.'); return; }
      setText(this.faceNote, 'Finding faces...');
      const c = document.createElement('canvas'); c.width = this.src.width; c.height = this.src.height; (c.getContext('2d') as CanvasRenderingContext2D).putImageData(this.src, 0, 0);
      const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('no pixels'))), 'image/png'));
      this.faces = await findFaces(blob);
      setText(this.faceNote, this.faces.length ? `${this.faces.length} face${this.faces.length > 1 ? 's' : ''} found; the sliders shape the largest.` : 'No face found in this layer.');
      this.render();
    } catch (err) { setText(this.faceNote, err instanceof Error ? err.message : 'The faces could not be found.'); }
  }

  private release(): void {
    this.stopHeld();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.liq = null;
    this.src = null;
    this.shown = null;
    this.hover = null;
  }
}
