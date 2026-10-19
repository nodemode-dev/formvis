/** 3D object layers (U2): a glTF or GLB model posed, lit and framed, then rendered to pixels at the document's size.
 *  Drawn with three.js (MIT), loaded only when first used. The posed model of a layer placed in this session is kept
 *  here by layer id, so glb_edit can pose it again; a saved project also keeps the model and pose (Doc.glb). */
type Three = typeof import('three');
type Obj = import('three').Object3D;

export interface GlbView {
  turn: number; tilt: number; roll: number; size: number; x: number; y: number; z: number; fov: number;
  lightDir: number; lightHeight: number; strength: number; ambient: number; room: number; shadow: number; color: string;
}
export const GLB_VIEW: GlbView = { turn: 30, tilt: 15, roll: 0, size: 100, x: 0, y: 0, z: 0, fov: 30, lightDir: 40, lightHeight: 45, strength: 150, ambient: 40, room: 0, shadow: 0, color: '#ffffff' };
export const GLB_LIMITS: Record<Exclude<keyof GlbView, 'color'>, [number, number]> = {
  turn: [-180, 180], tilt: [-80, 80], roll: [-180, 180], size: [20, 300], x: [-100, 100], y: [-100, 100], z: [-100, 100], fov: [10, 90],
  lightDir: [-180, 180], lightHeight: [0, 90], strength: [0, 400], ambient: [0, 200], room: [0, 200], shadow: [0, 100],
};

export interface GlbInfo { meshes: number; triangles: number; vertices: number; materials: number; textures: number; animations: number; nodes: number; size: [number, number, number]; generator: string; extensions: string[] }
export interface GlbModel { pivot: Obj; info: GlbInfo }

let three: Three | null = null;
const lib = async (): Promise<Three> => (three ??= await import('three'));

/** `view` with only the numbers inside their limits and a valid colour. */
export function cleanView(base: GlbView, patch: Partial<Record<keyof GlbView, unknown>>): GlbView {
  const out: GlbView = { ...base };
  for (const k of Object.keys(GLB_LIMITS) as Array<keyof typeof GLB_LIMITS>) {
    const v = patch[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.min(GLB_LIMITS[k][1], Math.max(GLB_LIMITS[k][0], v));
  }
  if (typeof patch.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(patch.color)) out.color = patch.color;
  return out;
}

/** The model read from GLB or self-contained glTF bytes, centred and scaled to a unit box whatever its units. */
export async function loadModel(bytes: ArrayBuffer): Promise<GlbModel> {
  const T = await lib(), { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new Promise<{ scene: Obj; animations: unknown[]; asset?: { generator?: string }; parser: { json: { extensionsUsed?: string[]; nodes?: unknown[] } } }>((ok, no) => new GLTFLoader().parse(bytes, '', ok as never, no));
  const box = new T.Box3().setFromObject(gltf.scene), size = box.getSize(new T.Vector3()), centre = box.getCenter(new T.Vector3()), k = 1 / Math.max(1e-6, size.x, size.y, size.z);
  let meshes = 0, triangles = 0, vertices = 0;
  const materials = new Set<unknown>(), textures = new Set<unknown>();
  gltf.scene.traverse((o) => {
    const m = o as import('three').Mesh;
    if (!m.isMesh) return;
    meshes++;
    const pos = m.geometry.getAttribute('position'), idx = m.geometry.getIndex();
    vertices += pos?.count ?? 0; triangles += idx ? idx.count / 3 : (pos?.count ?? 0) / 3;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      materials.add(mat);
      for (const v of Object.values(mat)) if (v && (v as { isTexture?: boolean }).isTexture) textures.add(v);
    }
  });
  const inner = gltf.scene, pivot = new T.Group();
  inner.scale.setScalar(k); inner.position.copy(centre.multiplyScalar(-k));
  pivot.add(inner);
  return { pivot, info: { meshes, triangles: Math.round(triangles), vertices, materials: materials.size, textures: textures.size, animations: gltf.animations.length, nodes: gltf.parser.json.nodes?.length ?? 0, size: [size.x, size.y, size.z], generator: gltf.asset?.generator ?? '', extensions: gltf.parser.json.extensionsUsed ?? [] } };
}

/** Draws `model` as `v` describes into a fresh canvas of w by h: colour on transparency, or depth (near bright, far dark, opaque). */
export async function renderModel(model: GlbModel, v: GlbView, w: number, h: number, mode: 'colour' | 'depth' = 'colour'): Promise<HTMLCanvasElement> {
  const T = await lib(), canvas = document.createElement('canvas'), rad = Math.PI / 180;
  const r = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  try {
    const most = Math.min(r.capabilities.maxTextureSize, 8192), k = Math.min(1, most / Math.max(w, h));
    r.setSize(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)), false);
    r.setClearColor(0x000000, mode === 'depth' ? 1 : 0);
    r.outputColorSpace = T.SRGBColorSpace;
    const scene = new T.Scene(), pivot = model.pivot;
    pivot.rotation.set(v.tilt * rad, v.turn * rad, v.roll * rad);
    const aspect = w / h, fill = Math.min(1, aspect) * v.size / 100, dist = 0.75 / Math.tan((v.fov * rad) / 2) / Math.max(0.05, fill), visH = 2 * dist * Math.tan((v.fov * rad) / 2);
    pivot.position.set((v.x / 100) * (visH * aspect) / 2, (v.y / 100) * visH / 2, (v.z / 100) * dist * 0.5);
    scene.add(pivot);
    const camera = new T.PerspectiveCamera(v.fov, aspect, Math.max(0.01, dist - 3), dist + 3);
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    if (mode === 'depth') {
      const near = dist - 0.9, far = dist + 0.9;
      scene.overrideMaterial = new T.ShaderMaterial({
        uniforms: { uNear: { value: near }, uFar: { value: far } }, side: T.DoubleSide,
        vertexShader: 'varying float vZ; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vZ = -mv.z; gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform float uNear; uniform float uFar; varying float vZ; void main(){ float t = clamp((uFar - vZ) / (uFar - uNear), 0.0, 1.0); gl_FragColor = vec4(vec3(t), 1.0); }',
      });
    } else {
      scene.add(new T.AmbientLight(0xffffff, v.ambient / 100));
      if (v.room > 0) scene.add(new T.HemisphereLight(0xffffff, 0x808080, v.room / 100));
      const sun = new T.DirectionalLight(new T.Color(v.color), v.strength / 100 * 2);
      sun.position.set(Math.sin(v.lightDir * rad) * Math.cos(v.lightHeight * rad) * 5, Math.sin(v.lightHeight * rad) * 5, Math.cos(v.lightDir * rad) * Math.cos(v.lightHeight * rad) * 5);
      if (v.shadow > 0) {
        r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
        pivot.updateMatrixWorld(true);
        const box = new T.Box3().setFromObject(pivot), c = box.getCenter(new T.Vector3());
        sun.target.position.copy(c); scene.add(sun.target);
        sun.position.add(c);
        sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005;
        const cam = sun.shadow.camera as import('three').OrthographicCamera;
        cam.left = -2; cam.right = 2; cam.top = 2; cam.bottom = -2; cam.near = 0.1; cam.far = 20; cam.updateProjectionMatrix();
        pivot.traverse((o) => { const m = o as import('three').Mesh; if (m.isMesh) m.castShadow = true; });
        const ground = new T.Mesh(new T.PlaneGeometry(8, 8), new T.ShadowMaterial({ opacity: Math.min(1, v.shadow / 100 * 0.7) }));
        ground.rotation.x = -Math.PI / 2; ground.position.set(c.x, box.min.y - 0.002, c.z); ground.receiveShadow = true;
        scene.add(ground);
      }
      scene.add(sun);
    }
    r.render(scene, camera);
    return canvas;
  } finally {
    // the picture stays in the canvas; the context is kept until the caller has drawn it (see drawn)
    setTimeout(() => { r.dispose(); r.forceContextLoss(); }, 0);
  }
}

export interface PlacedGlb { bytes: ArrayBuffer; name: string; view: GlbView; info: GlbInfo; depthId?: string }
export const placedGlb = new Map<string, PlacedGlb>();

/** What a saved document keeps of a 3D layer (Doc.glb, by layer id): the model's own bytes in base64 and its pose, so
 *  glb_edit and the 3D panel can pose it again after the file is reopened. */
export interface GlbKept { name: string; view: object; data: string; depthId?: string }
export const GLB_KEEP_CHARS = 40_000_000;
const encoded = new WeakMap<ArrayBuffer, string>();

export function glbEncode(bytes: ArrayBuffer): string {
  const hit = encoded.get(bytes);
  if (hit) return hit;
  const u = new Uint8Array(bytes), parts: string[] = [];
  for (let i = 0; i < u.length; i += 0x8000) parts.push(String.fromCharCode(...u.subarray(i, i + 0x8000)));
  const text = btoa(parts.join(''));
  encoded.set(bytes, text);
  return text;
}

export function glbDecode(data: string): ArrayBuffer {
  const bin = atob(data), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

export const glbKeep = (g: Pick<PlacedGlb, 'bytes' | 'name' | 'view'>): GlbKept => ({ name: g.name, view: g.view, data: glbEncode(g.bytes) });

/** `doc` with the 3D layer `id` kept (or `kept` null: forgotten); unchanged when the document would hold too much model data. */
export function glbWith<D extends { glb?: Readonly<Record<string, GlbKept>> }>(doc: D, id: string, kept: GlbKept | null): D {
  const rest = { ...(doc.glb ?? {}) };
  if (kept) rest[id] = kept; else delete rest[id];
  if (Object.values(rest).reduce((n, k) => n + k.data.length, 0) > GLB_KEEP_CHARS) return doc;
  return { ...doc, glb: Object.keys(rest).length ? rest : undefined };
}

/** The kept 3D layers read back from a saved document: only layers that still exist, poses held to their limits, models of sane size. */
export function glbKeptFrom(raw: unknown, ids: ReadonlySet<string>): Record<string, GlbKept> {
  const out: Record<string, GlbKept> = {};
  if (!raw || typeof raw !== 'object') return out;
  let total = 0;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>).slice(0, 64)) {
    const o = (v ?? {}) as Record<string, unknown>;
    if (!ids.has(id) || typeof o.data !== 'string' || !o.data || typeof o.name !== 'string' || total + o.data.length > GLB_KEEP_CHARS) continue;
    total += o.data.length;
    out[id] = { name: o.name.slice(0, 120), view: cleanView(GLB_VIEW, (o.view ?? {}) as Partial<Record<keyof GlbView, unknown>>), data: o.data };
  }
  return out;
}

/** A kept layer made live again: its model read from the saved bytes. */
export async function glbRestore(k: GlbKept): Promise<PlacedGlb> {
  const bytes = glbDecode(k.data), m = await loadModel(bytes.slice(0));
  return { bytes, name: k.name, view: cleanView(GLB_VIEW, k.view as Partial<Record<keyof GlbView, unknown>>), info: m.info, ...(k.depthId ? { depthId: k.depthId } : {}) };
}
