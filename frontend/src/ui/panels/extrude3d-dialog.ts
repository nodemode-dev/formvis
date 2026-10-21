import { Raster, type Engine } from '../../engine';
import type { Layer } from '../../engine/types';
import type { Anchor, SubPath, VectorPath } from '../../engine/paths';
import { traceAlpha } from '../../engine/trace-outline';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

type Three = typeof import('three');
type Pt2 = { x: number; y: number };

/** What a 3D extrusion layer keeps so it can be re-rendered later (DEV_PLAN 32.9). */
export interface Extrude3DSettings {
  sourceId: string; depth: number; bevel: number; turn: number; tilt: number; size: number;
  lightDir: number; lightHeight: number; strength: number; ambient: number; metal: number; rough: number; color: string;
}
type NumKey = Exclude<keyof Extrude3DSettings, 'sourceId' | 'color'>;

const START: Omit<Extrude3DSettings, 'sourceId'> = { depth: 40, bevel: 4, turn: 25, tilt: -15, size: 100, lightDir: 40, lightHeight: 45, strength: 150, ambient: 40, metal: 20, rough: 40, color: '#cccccc' };
const ROWS: Array<[NumKey, string, number, number]> = [['depth', 'Depth', 1, 200], ['bevel', 'Bevel', 0, 20], ['turn', 'Turn', -180, 180], ['tilt', 'Tilt', -80, 80], ['size', 'Size (%)', 20, 300],
  ['lightDir', 'Light direction', -180, 180], ['lightHeight', 'Light height', 0, 90], ['strength', 'Light strength', 0, 400], ['ambient', 'Ambient', 0, 200], ['metal', 'Metalness', 0, 100], ['rough', 'Roughness', 0, 100]];

const hex = (c: { r: number; g: number; b: number }): string => `#${[c.r, c.g, c.b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

/** Reads saved settings back, declining anything that is not the right shape. */
export function readExtrude3D(v: unknown): Extrude3DSettings | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.sourceId !== 'string' || typeof o.color !== 'string') return null;
  const out: Extrude3DSettings = { ...START, sourceId: o.sourceId, color: o.color };
  for (const [k] of ROWS) { const n = o[k]; if (typeof n === 'number' && Number.isFinite(n)) out[k] = n; }
  return out;
}

const flatten = (s: SubPath): Pt2[] => {
  const pts: Pt2[] = [], a = s.anchors, n = a.length;
  for (let i = 0; i < n; i++) {
    const p: Anchor = a[i], q: Anchor = a[(i + 1) % n];
    pts.push({ x: p.x, y: p.y });
    if (p.outX !== p.x || p.outY !== p.y || q.inX !== q.x || q.inY !== q.y) {
      for (let t = 1; t < 6; t++) {
        const u = t / 6, m = 1 - u;
        pts.push({ x: m * m * m * p.x + 3 * m * m * u * p.outX + 3 * m * u * u * q.inX + u * u * u * q.x, y: m * m * m * p.y + 3 * m * m * u * p.outY + 3 * m * u * u * q.inY + u * u * u * q.y });
      }
    }
  }
  return pts;
};
const area = (pts: Pt2[]): number => { let s = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p.x * q.y - q.x * p.y; } return s / 2; };
const inside = (pt: Pt2, poly: Pt2[]): boolean => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};

/** Layer > 3D > New 3D Extrusion from Selected Layer (DEV_PLAN 32.9): a shape, type or pixel layer pushed into depth
 *  with a bevel, lit and given a material, then rendered at the document's size as a layer that keeps its settings. */
export class Extrude3DDialog extends Dialog {
  private readonly canvas = el<HTMLCanvasElement>('<canvas class="cv-model3d-preview" width="400" height="260" aria-label="3D extrusion preview"></canvas>');
  private readonly note = el('<p class="cv-note cv-model3d-note" role="status"></p>');
  private readonly inputs = new Map<keyof Extrude3DSettings, HTMLInputElement>();
  private s: Extrude3DSettings = { sourceId: '', ...START };
  private three: Three | null = null;
  private path: VectorPath | null = null;
  private name = 'Layer';
  private editId: string | null = null;
  private geo: { key: string; mesh: import('three').Mesh } | null = null;
  private preview: import('three').WebGLRenderer | null = null;
  private frame = 0;

  constructor(private readonly engine: Engine, private readonly toast: (text: string) => void) {
    super('New 3D Extrusion', 440);
    this.body.append(this.canvas);
    for (const [key, label, min, max] of ROWS) {
      const input = el<HTMLInputElement>(`<input type="range" min="${min}" max="${max}" step="1" aria-label="${label}">`), row = el(`<label class="cv-dialog-row"><span>${label}</span></label>`);
      input.addEventListener('input', () => { this.s[key] = Number(input.value); this.redraw(); });
      row.append(input); this.body.append(row); this.inputs.set(key, input);
    }
    const color = el<HTMLInputElement>('<input type="color" aria-label="Color">'), crow = el('<label class="cv-dialog-row"><span>Color</span></label>');
    color.addEventListener('input', () => { this.s.color = color.value; this.redraw(); });
    crow.append(color); this.body.append(crow, this.note); this.inputs.set('color', color);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Place', 'primary', () => void this.place());
  }

  /** Opens on the active layer, or on the settings kept by an extrusion layer whose source still exists. */
  async start(): Promise<void> {
    const p = this.engine.current, active = p?.activeLayer;
    if (!p || !active) { this.toast('Select a shape, type or pixel layer to extrude.'); return; }
    const kept = readExtrude3D(active.extrude3d), src = kept ? p.doc.layers.find((x) => x.id === kept.sourceId) : undefined;
    const source = src ?? active;
    this.editId = kept && src ? active.id : null;
    try {
      this.three ??= await import('three');
      const path = this.pathOf(source);
      if (!path) { this.toast('That layer has no shape to extrude.'); return; }
      this.path = path;
    } catch (err) {
      this.toast(`The extrusion could not be prepared${err instanceof Error && err.message ? `: ${err.message}` : ''}.`);
      return;
    }
    this.name = source.name;
    const fill = source.vector?.fill ?? source.text?.color ?? null;
    this.s = kept && src ? kept : { sourceId: source.id, ...START, color: fill ? hex(fill) : START.color };
    this.geo = null;
    for (const [k, input] of this.inputs) input.value = String(this.s[k]);
    this.setTitle(`${this.editId ? 'Edit' : 'New'} 3D Extrusion: ${this.name}`);
    setText(this.note, this.editId ? 'Change the settings, then Place: the layer is re-rendered in place.' : 'Set depth, bevel, light and material, then Place: it becomes a layer at the document\'s size.');
    this.open();
    this.redraw();
  }

  /** The source layer's outline: its vector path, else its alpha traced in document pixels. */
  private pathOf(l: Layer): VectorPath | null {
    if (l.vector && l.vector.path.subpaths.length) return l.vector.path;
    const r = l.raster;
    if (!r || !r.width || !r.height) return null;
    const data = r.ctx.getImageData(0, 0, r.width, r.height).data, alpha = new Uint8ClampedArray(r.width * r.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    const path = traceAlpha(alpha, r.width, r.height, { scale: l.transform.w / r.width, offsetX: l.transform.x, offsetY: l.transform.y });
    return path.subpaths.length ? path : null;
  }

  /** Closed subpaths as THREE shapes; a subpath wound against the largest one and lying inside another becomes its hole.
   *  y is flipped, since the paths have y pointing down. */
  private shapes(path: VectorPath): import('three').Shape[] {
    const THREE = this.three as Three;
    const subs = path.subpaths.filter((s) => s.closed && s.anchors.length > 2).map((s) => ({ s, poly: flatten(s) })).map((x) => ({ ...x, a: area(x.poly) })).filter((x) => x.a !== 0);
    if (!subs.length) return [];
    const biggest = subs.reduce((m, x) => (Math.abs(x.a) > Math.abs(m.a) ? x : m)), outerSign = Math.sign(biggest.a);
    const build = <T extends import('three').Path>(sub: SubPath, target: T): T => {
      const a = sub.anchors;
      target.moveTo(a[0].x, -a[0].y);
      for (let i = 1; i <= a.length; i++) {
        const p = a[i - 1], q = a[i % a.length];
        target.bezierCurveTo(p.outX, -p.outY, q.inX, -q.inY, q.x, -q.y);
      }
      target.closePath();
      return target;
    };
    const outers = subs.filter((x) => Math.sign(x.a) === outerSign).map((x) => ({ x, shape: build(x.s, new THREE.Shape()) }));
    for (const h of subs.filter((x) => Math.sign(x.a) !== outerSign)) {
      const host = outers.filter((o) => Math.abs(o.x.a) > Math.abs(h.a) && inside({ x: h.s.anchors[0].x, y: h.s.anchors[0].y }, o.x.poly)).sort((p, q) => Math.abs(p.x.a) - Math.abs(q.x.a))[0];
      if (host) host.shape.holes.push(build(h.s, new THREE.Path()));
    }
    return outers.map((o) => o.shape);
  }

  /** The extruded mesh, centred in a unit box; rebuilt only when depth or bevel change. */
  private mesh(): import('three').Mesh | null {
    const THREE = this.three as Three, key = `${this.s.depth}|${this.s.bevel}`;
    if (this.geo?.key === key) return this.geo.mesh;
    if (!this.path) return null;
    const shapes = this.shapes(this.path);
    if (!shapes.length) return null;
    const flat = new THREE.ShapeGeometry(shapes), fb = (flat.computeBoundingBox(), flat.boundingBox as import('three').Box3), h = Math.max(1e-6, fb.max.y - fb.min.y);
    flat.dispose();
    const bevel = h * this.s.bevel / 100 * 0.5, on = bevel > 0;
    const geometry = new THREE.ExtrudeGeometry(shapes, { depth: h * this.s.depth / 100, bevelEnabled: on, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 12 });
    geometry.computeBoundingBox();
    const box = geometry.boundingBox as import('three').Box3, size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3()), k = 1 / Math.max(1e-6, size.x, size.y, size.z);
    geometry.translate(-centre.x, -centre.y, -centre.z);
    geometry.scale(k, k, k);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    this.geo?.mesh.geometry.dispose();
    this.geo = { key, mesh };
    return mesh;
  }

  close(): void {
    cancelAnimationFrame(this.frame);
    super.close();
  }

  private redraw(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      if (!this.three || !this.path) return;
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

  /** The extrusion posed, lit and framed, rendered into `r` at `w` by `h`; false when there is nothing to draw. */
  private draw(r: import('three').WebGLRenderer, w: number, h: number): boolean {
    const THREE = this.three as Three, v = this.s, rad = Math.PI / 180, mesh = this.mesh();
    if (!mesh) { setText(this.note, 'That layer has no closed shape to extrude.'); return false; }
    r.setSize(w, h, false);
    const m = mesh.material as import('three').MeshStandardMaterial;
    m.color.set(v.color); m.metalness = v.metal / 100; m.roughness = v.rough / 100;
    const scene = new THREE.Scene(), pivot = new THREE.Group();
    pivot.rotation.set(v.tilt * rad, v.turn * rad, 0);
    pivot.add(mesh);
    scene.add(pivot);
    scene.add(new THREE.AmbientLight(0xffffff, v.ambient / 100));
    const sun = new THREE.DirectionalLight(0xffffff, v.strength / 100 * 2);
    sun.position.set(Math.sin(v.lightDir * rad) * Math.cos(v.lightHeight * rad) * 5, Math.sin(v.lightHeight * rad) * 5, Math.cos(v.lightDir * rad) * Math.cos(v.lightHeight * rad) * 5);
    scene.add(sun);
    const fov = 30, camera = new THREE.PerspectiveCamera(fov, w / h, 0.01, 100), fill = Math.min(1, w / h) * v.size / 100;
    camera.position.set(0, 0, 0.75 / Math.tan((fov * rad) / 2) / Math.max(0.05, fill));
    camera.lookAt(0, 0, 0);
    r.render(scene, camera);
    pivot.remove(mesh);
    return true;
  }

  private async place(): Promise<void> {
    const p = this.engine.current;
    if (!p || !this.three || !this.path) return;
    const W = p.doc.width, H = p.doc.height, canvas = document.createElement('canvas'), r = this.renderer(canvas);
    try {
      const most = Math.min(r.capabilities.maxTextureSize, 8192), k = Math.min(1, most / Math.max(W, H));
      if (!this.draw(r, Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k)))) return;
      const raster = new Raster(W, H);
      raster.ctx.drawImage(canvas, 0, 0, W, H);
      raster.touch();
      const settings: Extrude3DSettings = { ...this.s }, id = this.editId;
      if (id && p.doc.layers.some((x) => x.id === id)) {
        this.engine.edit('Edit 3D Extrusion', (pp) => { const l = pp.doc.layers.find((x) => x.id === id); if (l) pp.updateLayer(id, { raster, transform: { ...l.transform, x: 0, y: 0, w: W, h: H }, extrude3d: settings }); });
      } else {
        this.engine.insertRasterLayer(raster, `3D: ${this.name}`, 0, 0, { extrude3d: settings }, 'New 3D Extrusion');
      }
      this.close();
    } finally { r.dispose(); r.forceContextLoss(); }
  }
}
