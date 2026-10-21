import { Raster, type Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { GLB_VIEW, cleanView, glbKeep, glbWith, loadModel, placedGlb } from '../../io/glb-scene';

type Three = typeof import('three');
interface View { turn: number; tilt: number; size: number; lightDir: number; lightHeight: number; strength: number; ambient: number; color: string }
const START: View = { turn: 30, tilt: 15, size: 100, lightDir: 40, lightHeight: 45, strength: 150, ambient: 40, color: '#ffffff' };

/** File > Place 3D Model (1.51.9, the capability plan): a .glb or .gltf model posed and lit in a live preview, then
 *  rendered at the document's size on transparency as a new layer. Drawn with three.js (MIT), loaded only when first
 *  used. The model is centred and scaled to fit on load, whatever units it was made in. */
export class Model3DDialog extends Dialog {
  private readonly canvas = el<HTMLCanvasElement>('<canvas class="cv-model3d-preview" width="400" height="260" aria-label="3D preview"></canvas>');
  private readonly note = el('<p class="cv-note cv-model3d-note" role="status"></p>');
  private readonly inputs = new Map<keyof View, HTMLInputElement>();
  private view: View = { ...START };
  private three: Three | null = null;
  private model: import('three').Object3D | null = null;
  private name = 'Model';
  private bytes: ArrayBuffer | null = null;
  private preview: import('three').WebGLRenderer | null = null;
  private frame = 0;

  constructor(private readonly engine: Engine, private readonly toast: (text: string) => void) {
    super('Place 3D Model', 440);
    const rows: Array<[keyof View, string, number, number]> = [['turn', 'Turn', -180, 180], ['tilt', 'Tilt', -80, 80], ['size', 'Size (%)', 20, 300],
      ['lightDir', 'Light direction', -180, 180], ['lightHeight', 'Light height', 0, 90], ['strength', 'Light strength', 0, 400], ['ambient', 'Ambient', 0, 200]];
    this.body.append(this.canvas);
    for (const [key, label, min, max] of rows) {
      const input = el<HTMLInputElement>(`<input type="range" min="${min}" max="${max}" step="1" aria-label="${label}">`), row = el(`<label class="cv-dialog-row"><span>${label}</span></label>`);
      input.addEventListener('input', () => { (this.view[key] as number) = Number(input.value); this.redraw(); });
      row.append(input); this.body.append(row); this.inputs.set(key, input);
    }
    const color = el<HTMLInputElement>('<input type="color" aria-label="Light color">'), crow = el('<label class="cv-dialog-row"><span>Light color</span></label>');
    color.addEventListener('input', () => { this.view.color = color.value; this.redraw(); });
    crow.append(color); this.body.append(crow, this.note); this.inputs.set('color', color);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Place', 'primary', () => void this.place());
  }

  /** Loads `file` and opens the dialog on it. */
  async load(file: File): Promise<void> {
    if (!this.engine.current) { this.toast('Open or create a document to place a 3D model in.'); return; }
    try {
      const THREE = this.three ?? (this.three = await import('three'));
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const bytes = await file.arrayBuffer();
      this.bytes = bytes;
      const gltf = await new Promise<{ scene: import('three').Object3D }>((ok, no) => new GLTFLoader().parse(bytes, '', ok, no));
      const box = new THREE.Box3().setFromObject(gltf.scene), size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3()), k = 1 / Math.max(1e-6, size.x, size.y, size.z);
      const pivot = new THREE.Group(), inner = gltf.scene;
      inner.scale.setScalar(k); inner.position.copy(centre.multiplyScalar(-k));
      pivot.add(inner);
      this.model = pivot;
      this.name = file.name.replace(/\.(glb|gltf)$/i, '');
    } catch (err) {
      this.toast(`${file.name} could not be read as a 3D model${err instanceof Error && err.message ? `: ${err.message}` : ''}.`);
      return;
    }
    this.view = { ...START };
    for (const [k, input] of this.inputs) input.value = String(this.view[k]);
    this.setTitle(`Place 3D Model: ${this.name}`);
    setText(this.note, 'Turn, tilt and light it, then Place: it becomes a layer at the document\'s size.');
    this.open();
    this.redraw();
  }

  /** The preview keeps one renderer for the app's life, reused each time (a canvas whose context was released cannot
   *  be drawn on again); only Place's one-off renderers, each on its own canvas, are released. */
  close(): void {
    cancelAnimationFrame(this.frame);
    super.close();
  }

  private redraw(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      if (!this.three || !this.model) return;
      this.preview ??= this.renderer(this.canvas);
      this.draw(this.preview, this.canvas.width, this.canvas.height);
    });
  }

  private renderer(canvas: HTMLCanvasElement): import('three').WebGLRenderer {
    const THREE = this.three as Three, r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    return r;
  }

  /** The model posed, lit and framed, rendered into `r` at `w` by `h`. */
  private draw(r: import('three').WebGLRenderer, w: number, h: number): void {
    const THREE = this.three as Three, v = this.view, rad = Math.PI / 180, model = this.model as import('three').Object3D;
    r.setSize(w, h, false);
    const scene = new THREE.Scene();
    model.rotation.set(v.tilt * rad, v.turn * rad, 0);
    scene.add(model);
    scene.add(new THREE.AmbientLight(0xffffff, v.ambient / 100));
    const sun = new THREE.DirectionalLight(new THREE.Color(v.color), v.strength / 100 * 2);
    sun.position.set(Math.sin(v.lightDir * rad) * Math.cos(v.lightHeight * rad) * 5, Math.sin(v.lightHeight * rad) * 5, Math.cos(v.lightDir * rad) * Math.cos(v.lightHeight * rad) * 5);
    scene.add(sun);
    const fov = 30, camera = new THREE.PerspectiveCamera(fov, w / h, 0.01, 100), fill = Math.min(1, w / h) * v.size / 100;
    camera.position.set(0, 0, 0.75 / Math.tan((fov * rad) / 2) / Math.max(0.05, fill));   // the model's unit box about three quarters of the frame at 100%
    camera.lookAt(0, 0, 0);
    r.render(scene, camera);
    scene.remove(model);
  }

  private async place(): Promise<void> {
    const p = this.engine.current;
    if (!p || !this.three || !this.model) return;
    const W = p.doc.width, H = p.doc.height, canvas = document.createElement('canvas'), r = this.renderer(canvas);
    try {
      const most = Math.min(r.capabilities.maxTextureSize, 8192), k = Math.min(1, most / Math.max(W, H));   // the graphics card's limit
      this.draw(r, Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k)));
      const layer = new Raster(W, H);
      layer.ctx.drawImage(canvas, 0, 0, W, H);
      layer.touch();
      const bytes = this.bytes, name = this.name, v = this.view;
      this.engine.edit('Place 3D Model', (pp) => {
        this.engine.insertRasterLayer(layer, `3D: ${name}`, 0, 0, {}, 'Place 3D Model');
        const kept = this.engine.activeLayer?.id;
        if (kept && bytes) pp.doc = glbWith(pp.doc, kept, glbKeep({ bytes, name, view: cleanView(GLB_VIEW, v) }));
      });
      const id = this.engine.activeLayer?.id;
      if (id && bytes) void loadModel(bytes.slice(0)).then((m) => placedGlb.set(id, { bytes, name, view: cleanView(GLB_VIEW, v), info: m.info })).catch(() => undefined);
      this.close();
    } finally { r.dispose(); r.forceContextLoss(); }
  }
}
