import { adjustLayer, makeCanvas, pixelLayer, type Doc, type PixelLayer } from './model';
import { adjustDef, defaults } from './adjust-defs';

const W = 1280;
const H = 800;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise(seed: number): (x: number) => number {
  const r = rng(seed), table = Array.from({ length: 256 }, () => r());
  const at = (i: number): number => table[((i % 256) + 256) % 256];
  return (x) => {
    const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
    return at(i) * (1 - s) + at(i + 1) * s;
  };
}

function layerCanvas(): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = makeCanvas(W, H);
  return { c, g: c.getContext('2d')! };
}

function sky(): HTMLCanvasElement {
  const { c, g } = layerCanvas();
  const grad = g.createLinearGradient(0, 0, 0, H * 0.66);
  grad.addColorStop(0, '#080c2a');
  grad.addColorStop(0.42, '#3a2a70');
  grad.addColorStop(0.72, '#c4527a');
  grad.addColorStop(1, '#ffb070');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const r = rng(7);
  for (let i = 0; i < 260; i++) {
    const y = r() * H * 0.42, fade = 1 - y / (H * 0.42);
    g.fillStyle = `rgba(255,255,255,${(0.15 + r() * 0.7) * fade})`;
    const s = r() < 0.08 ? 2 : 1;
    g.fillRect(r() * W, y, s, s);
  }
  return c;
}

function glow(): HTMLCanvasElement {
  const { c, g } = layerCanvas();
  const cx = W * 0.68, cy = H * 0.6;
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, W * 0.46);
  grad.addColorStop(0, 'rgba(255,214,140,1)');
  grad.addColorStop(0.18, 'rgba(255,150,80,0.85)');
  grad.addColorStop(0.5, 'rgba(210,70,110,0.35)');
  grad.addColorStop(1, 'rgba(120,40,140,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff3d0';
  g.beginPath();
  g.arc(cx, cy, 38, 0, Math.PI * 2);
  g.fill();
  return c;
}

function hills(seed: number, base: number, amp: number, freq: number, colorTop: string, colorBottom: string): HTMLCanvasElement {
  const { c, g } = layerCanvas();
  const n = valueNoise(seed), n2 = valueNoise(seed + 9);
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 4) g.lineTo(x, base - (n(x * freq) * 0.8 + n2(x * freq * 2.3) * 0.2) * amp);
  g.lineTo(W, H);
  g.closePath();
  const grad = g.createLinearGradient(0, base - amp, 0, H);
  grad.addColorStop(0, colorTop);
  grad.addColorStop(1, colorBottom);
  g.fillStyle = grad;
  g.fill();
  return c;
}

function water(): HTMLCanvasElement {
  const { c, g } = layerCanvas();
  const top = H * 0.7;
  const grad = g.createLinearGradient(0, top, 0, H);
  grad.addColorStop(0, '#2b2a66');
  grad.addColorStop(0.35, '#151a4a');
  grad.addColorStop(1, '#070a22');
  g.fillStyle = grad;
  g.fillRect(0, top, W, H - top);
  return c;
}

function reflection(): HTMLCanvasElement {
  const { c, g } = layerCanvas();
  const r = rng(21), cx = W * 0.68, top = H * 0.7;
  for (let y = top; y < H; y += 3) {
    const t = (y - top) / (H - top);
    const half = (24 + t * 150) * (0.5 + r() * 0.7);
    const a = (0.75 - t * 0.6) * (0.4 + r() * 0.6);
    const grad = g.createLinearGradient(cx - half, 0, cx + half, 0);
    grad.addColorStop(0, 'rgba(255,170,90,0)');
    grad.addColorStop(0.5, `rgba(255,190,110,${a})`);
    grad.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = grad;
    g.fillRect(cx - half, y, half * 2, 2);
  }
  return c;
}

function haze(): HTMLCanvasElement {
  const { c, g } = layerCanvas();
  const grad = g.createLinearGradient(0, H * 0.45, 0, H * 0.78);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.55, 'rgba(255,230,200,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  return c;
}

function grain(): HTMLCanvasElement {
  const c = makeCanvas(W, H), g = c.getContext('2d')!;
  const img = g.createImageData(W, H), d = img.data, r = rng(99);
  for (let i = 0; i < d.length; i += 4) {
    const v = 128 + (r() - 0.5) * 120;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function vignette(): HTMLCanvasElement {
  const { c, g } = layerCanvas();
  const grad = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.72);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(40,30,60,1)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  return c;
}

function add(list: PixelLayer[], name: string, canvas: HTMLCanvasElement, blend: PixelLayer['blend'] = 'normal', opacity = 1, visible = true): void {
  const l = pixelLayer(name, canvas);
  l.blend = blend;
  l.opacity = opacity;
  l.visible = visible;
  list.push(l);
}

export function sampleDoc(): Doc {
  const px: PixelLayer[] = [];
  add(px, 'Night sky', sky());
  add(px, 'Sun glow', glow(), 'screen', 0.9);
  add(px, 'Far hills', hills(3, H * 0.66, 120, 0.006, '#4a2f7a', '#241a4a'), 'normal', 0.95);
  add(px, 'Near hills', hills(11, H * 0.74, 90, 0.009, '#1c1238', '#0c0820'));
  add(px, 'Water', water());
  add(px, 'Reflection', reflection(), 'linear-dodge', 0.7);
  add(px, 'Haze', haze(), 'soft-light', 0.8);
  add(px, 'Film grain', grain(), 'overlay', 0.28);
  add(px, 'Vignette', vignette(), 'multiply', 0.75);
  const vib = adjustLayer('Vibrance', 'vibrance', { ...defaults(adjustDef('vibrance')!), vibrance: 35 });
  const photo = adjustLayer('Photo Filter', 'photoFilter', { ...defaults(adjustDef('photoFilter')!) });
  photo.visible = false;
  const layers = [...px, vib, photo];
  return { name: 'Harbour at dusk', w: W, h: H, layers, active: px[1].id };
}

export function blankDoc(w: number, h: number, name: string): Doc {
  const c = makeCanvas(w, h), g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  const l = pixelLayer('Background', c);
  return { name, w, h, layers: [l], active: l.id };
}
