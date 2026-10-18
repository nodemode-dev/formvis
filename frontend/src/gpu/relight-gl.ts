import { ALBEDO_FLOOR, MAX_RELIGHT_LIGHTS, SCENE_DEPTH, packLights, sceneTerms, shadeRelight, type RelightContent, type RelightGeometry, type SplitMaps } from '../engine/relight';

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uBase;
uniform sampler2D uGeo;
uniform vec2 uSize;
uniform int uCount;
uniform float uOrig;
uniform float uShine;
uniform int uSteps;
uniform vec4 uA[${MAX_RELIGHT_LIGHTS}];
uniform vec4 uB[${MAX_RELIGHT_LIGHTS}];
uniform vec4 uC[${MAX_RELIGHT_LIGHTS}];
uniform vec4 uD[${MAX_RELIGHT_LIGHTS}];
uniform vec4 uE[${MAX_RELIGHT_LIGHTS}];
uniform vec4 uF[${MAX_RELIGHT_LIGHTS}];
uniform sampler2D uShade;
uniform float uDelight;
uniform float uShadows;
uniform vec3 uAmbient;
uniform sampler2D uS0;
uniform sampler2D uRes;
uniform float uSplit;
uniform float uTakeOut;

float toLin(float v) { return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4); }
float toSrgb(float v) { return v <= 0.0031308 ? v * 12.92 : 1.055 * pow(v, 1.0 / 2.4) - 0.055; }
float tone(float v) { return v <= 0.8 ? max(0.0, v) : 0.8 + 0.2 * (1.0 - exp(-(v - 0.8) / 0.2)); }
float sstep(float a, float b, float x) { float d = b - a; d = abs(d) < 1e-6 ? (d < 0.0 ? -1e-6 : 1e-6) : d; float t = clamp((x - a) / d, 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float hash(vec2 p) { return fract(sin(p.x * 127.1 + p.y * 311.7) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = p - i, u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
}
float zAt(vec2 p, float relief) {
  vec2 uv = clamp((floor(p) + 0.5) / uSize, vec2(0.0), vec2(1.0));
  return texture(uGeo, uv).a * relief;
}
float patternAt(float kind, vec2 q, float s, vec4 d, vec4 e, float soft, bool frameOnly) {
  float k = abs(kind);
  if (k < 0.5 || (frameOnly && (kind < 0.0 || k > 3.5))) return 1.0;
  float rot = e.w, cr = cos(rot), sr = sin(rot);
  float x = (q.x * cr + q.y * sr) / s, y = (-q.x * sr + q.y * cr) / s;
  float feather = max(0.002, e.z * 0.25 + soft * 0.08);
  float m = 1.0;
  if (k < 1.5) {
    float half_ = 0.33 * d.y, hw = half_ * d.z;
    float frame = sstep(hw, hw - feather, abs(x)) * sstep(half_, half_ - feather, abs(y));
    float period = (2.0 * half_) / max(2.0, d.w), ph = fract((y + half_) / period), f = feather / period;
    float hf = min(f, 0.3) * 0.5, wash = clamp((f - 0.3) / 0.7, 0.0, 1.0);
    m = frameOnly ? frame : frame * (sstep(e.x + hf, e.x - hf, ph) * sstep(-hf, hf, ph) * (1.0 - wash) + e.x * wash);
  } else if (k < 2.5) {
    float hl = 0.58 * e.y * d.y, hw = 0.5 * d.z * 0.14 * d.y;
    m = sstep(hl, hl - feather, abs(y)) * sstep(hw, hw - feather, abs(x));
  } else if (k < 3.5) {
    float half_ = 0.32 * d.y, bar = 0.02 * d.y;
    float frame = sstep(half_, half_ - feather, abs(x)) * sstep(half_ * 1.3, half_ * 1.3 - feather, abs(y));
    m = frameOnly ? frame : frame * sstep(bar, bar + feather, abs(x)) * sstep(bar, bar + feather, abs(y));
  } else {
    float sc = 6.0 / max(0.1, d.y);
    float n = vnoise(vec2(x, y) * sc) * 0.65 + vnoise(vec2(x, y) * sc * 2.3 + vec2(7.0, 3.0)) * 0.35;
    m = sstep(1.0 - e.x - feather, 1.0 - e.x + feather, n);
  }
  return kind < 0.0 ? 1.0 - m : m;
}
void main() {
  vec2 uv = vUv;
  vec4 base = texture(uBase, uv);
  vec4 g = texture(uGeo, uv);
  float s = max(uSize.x, uSize.y), relief = ${SCENE_DEPTH.toFixed(3)} * s;
  vec2 p = uv * uSize;
  vec3 n = g.rgb;
  float pz = g.a * relief;
  vec3 s0 = uSplit > 0.5 ? max(texture(uS0, uv).rgb, vec3(1e-4)) : vec3(1.0);
  vec3 E = uAmbient * pow(s0, vec3(uTakeOut)), S = uSplit > 0.5 ? texture(uRes, uv).rgb * uOrig : vec3(0.0);
  for (int i = 0; i < ${MAX_RELIGHT_LIGHTS}; i++) {
    if (i >= uCount) break;
    vec4 A = uA[i], B = uB[i], C = uC[i], D = uD[i], Ee = uE[i], F = uF[i];
    float win = (F.x <= 0.0 ? 1.0 : sstep(F.x - 0.04, F.x + 0.04, g.a)) * (F.y >= 1.0 ? 1.0 : sstep(F.y + 0.04, F.y - 0.04, g.a));
    if (win <= 0.0) continue;
    float type = A.x, intensity = A.y, softness = A.z, diffusion = A.w, distance_ = B.w;
    vec2 pos = C.xy, aim = C.zw;
    float zAim = zAt(aim, relief), hL = zAim + (0.12 + 0.9 * distance_) * 0.5 * s;
    vec3 l; float atten = 1.0; float maxRun = 0.45 * s;
    if (abs(type - 2.0) < 0.5) {
      vec2 dd = aim - pos; float dl = max(1e-6, length(dd)); float elev = radians(30.0 + 50.0 * distance_);
      l = vec3(-dd / dl * cos(elev), sin(elev));
    } else {
      vec2 q = pos;
      if (abs(type - 4.0) < 0.5) {
        vec2 dd = aim - pos; float dl = max(1e-6, length(dd)); vec2 t = vec2(-dd.y, dd.x) / dl;
        q += t * clamp(dot(p - pos, t), -0.25 * s, 0.25 * s);
      }
      vec3 v = vec3(q - p, (abs(type - 5.0) < 0.5 ? relief + 0.6 * s : hL) - pz);
      float dist = length(v);
      l = v / dist;
      float R = (0.4 + distance_) * s;
      atten = 2.6 / (1.0 + (dist / R) * (dist / R));
      maxRun = min(maxRun, length(v.xy));
      if (abs(type - 1.0) < 0.5) {
        vec3 ax = vec3(aim - pos, zAim - hL);
        float cosA = -dot(l, ax) / max(1e-6, length(ax));
        atten *= sstep(cos(radians(30.0 + 30.0 * softness)), cos(radians(18.0 + 22.0 * softness)), cosA);
      }
    }
    bool sun = abs(type - 2.0) < 0.5;
    float behind = zAim - pz, reach = (sun ? 0.18 + 1.8 * distance_ : 0.05 + 0.4 * distance_) * relief, rr = behind > 0.0 ? behind / reach : -behind / (reach * 2.5);
    atten = atten / (1.0 + rr * rr * (sun ? 1.0 : rr * rr)) * (sun ? 1.9 : 1.0);
    float wrapExtra = abs(type - 3.0) < 0.5 ? 0.35 : (abs(type - 5.0) < 0.5 ? 0.5 : 0.3);
    float wr = clamp(diffusion + wrapExtra, 0.0, 1.5);
    float ndl = dot(n, l), lam = clamp((ndl + wr) / (1.0 + wr), 0.0, 1.0);
    if (lam <= 0.0 || atten <= 1e-4) continue;
    float shadow = 1.0;
    if (abs(type - 5.0) >= 0.5 && uSteps > 0 && l.z < 0.999) {
      float flat_ = max(1e-6, length(l.xy));
      float k = (1.5 + 4.5 * (1.0 - softness)) * (abs(type - 3.0) < 0.5 ? 0.5 : 1.0);
      float run = max(4.0, maxRun), bias = relief * 0.004;
      float spread = (0.04 + 0.22 * softness) * (abs(type - 3.0) < 0.5 ? 1.6 : 1.0);
      vec2 dd = l.xy / flat_, oo = vec2(-dd.y, dd.x);
      float total = 0.0;
      for (int q = 0; q < 4; q++) {
        float o = q == 0 ? -1.0 : (q == 1 ? -0.33 : (q == 2 ? 0.33 : 1.0));
        vec2 sxy = dd + oo * o * spread;
        vec2 u = sxy / max(1e-6, length(sxy));
        float uz = l.z / flat_ * (1.0 + abs(o) * spread * 0.5), sh = 1.0;
        for (int j = 1; j <= 32; j++) {
          if (j > uSteps) break;
          float fj = float(j) / float(uSteps), t = fj * fj * run;
          float occ = zAt(p + u * t, relief) - (pz + uz * t) - bias;
          if (occ > 0.0) sh = min(sh, clamp(1.0 - k * occ / max(1.0, t), 0.0, 1.0));
          if (sh <= 0.0) break;
        }
        total += sh;
      }
      shadow = total * 0.25;
    }
    shadow = 1.0 - (1.0 - shadow) * uShadows;
    float pattern = 1.0, frame = 1.0;
    if (abs(D.x) > 0.5) {
      float par = (pz - zAim) * 0.05 / max(0.25, l.z);
      vec2 gp = p + l.xy * par;
      float spread = softness + (abs(abs(D.x) - 2.0) < 0.5 ? 0.0 : 4.0 * max(0.0, behind) / relief);
      pattern = patternAt(D.x, gp - aim, s, D, Ee, spread, false);
      frame = patternAt(D.x, gp - aim, s, D, Ee, spread, true);
    }
    float amount = intensity * 3.2 * atten * shadow * pattern;
    vec3 hv = normalize(l + vec3(0.0, 0.0, 1.0));
    float gloss = 8.0 + 56.0 * (1.0 - softness);
    vec3 add = B.rgb * (amount * lam * (1.0 - diffusion) + intensity * 3.2 * atten * diffusion * 0.3 * frame * clamp(0.5 + 0.5 * ndl, 0.0, 1.0)) * win;
    E += add;
    S += add * ${ALBEDO_FLOOR.toFixed(3)};
    if (ndl > 0.0) S += B.rgb * pow(max(0.0, dot(n, hv)), gloss) * amount * 0.15 * uShine * win;
  }
  float kd = 1.0 / (1.0 + (texture(uShade, uv).r - 1.0) * uDelight);
  vec3 lin = vec3(toLin(base.r), toLin(base.g), toLin(base.b)) * kd * pow(s0, vec3(1.0 - uTakeOut));
  vec3 o = lin * E + S;
  outColor = vec4(toSrgb(tone(o.r)), toSrgb(tone(o.g)), toSrgb(tone(o.b)), base.a);
}`;

interface GlState { gl: WebGL2RenderingContext; canvas: HTMLCanvasElement | OffscreenCanvas; prog: WebGLProgram; base: WebGLTexture; geo: WebGLTexture; shade: WebGLTexture; s0: WebGLTexture; res: WebGLTexture; loc: Record<string, WebGLUniformLocation | null> }

let state: GlState | null | undefined;

function makeCanvas(): HTMLCanvasElement | OffscreenCanvas | null {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(1, 1);
  if (typeof document !== 'undefined') return document.createElement('canvas');
  return null;
}

function init(): GlState | null {
  if (state !== undefined) return state;
  state = null;
  const canvas = makeCanvas(), gl = canvas?.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true }) as WebGL2RenderingContext | null;
  if (!canvas || !gl) return null;
  const sh = (type: number, src: string): WebGLShader | null => {
    const o = gl.createShader(type);
    if (!o) return null;
    gl.shaderSource(o, src); gl.compileShader(o);
    return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null;
  };
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG), prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.bindAttribLocation(prog, 0, 'aPos'); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const tex = (): WebGLTexture | null => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]] as const) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  };
  const base = tex(), geo = tex(), shade = tex(), s0 = tex(), res = tex();
  if (!base || !geo || !shade || !s0 || !res) return null;
  const loc: Record<string, WebGLUniformLocation | null> = {};
  for (const k of ['uBase', 'uGeo', 'uSize', 'uCount', 'uOrig', 'uShine', 'uSteps', 'uA', 'uB', 'uC', 'uD', 'uE', 'uF', 'uShade', 'uDelight', 'uShadows', 'uAmbient', 'uS0', 'uRes', 'uSplit', 'uTakeOut']) loc[k] = gl.getUniformLocation(prog, k);
  state = { gl, canvas, prog, base, geo, shade, s0, res, loc };
  return state;
}

export const relightGpuAvailable = (): boolean => !!init();

let uploaded: { base: Uint8ClampedArray | null; geo: Float32Array | null; shade: Float32Array | null | undefined; split: SplitMaps | null | undefined } = { base: null, geo: null, shade: undefined, split: undefined };
const ONE = new Float32Array([1]);
const ONE4 = new Float32Array([1, 1, 1, 1]);

function rgba(src: Float32Array, n: number): Float32Array {
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { out[i * 4] = src[i * 3]; out[i * 4 + 1] = src[i * 3 + 1]; out[i * 4 + 2] = src[i * 3 + 2]; out[i * 4 + 3] = 1; }
  return out;
}

export function renderRelight(base: Uint8ClampedArray, geo: RelightGeometry, content: RelightContent, steps = 24, shade: Float32Array | null = null, split: SplitMaps | null = null): Uint8ClampedArray {
  const st = init(), w = geo.width, h = geo.height;
  const maxTex = st ? st.gl.getParameter(st.gl.MAX_TEXTURE_SIZE) as number : 0;
  if (!st || w > maxTex || h > maxTex) return shadeRelight(base, geo, content, { shadowSteps: Math.min(steps, 16), shade, split });
  const { gl, canvas, prog, loc } = st;
  canvas.width = w; canvas.height = h;
  gl.viewport(0, 0, w, h);
  gl.useProgram(prog);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, st.base);
  if (uploaded.base !== base) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, base); uploaded.base = base; }
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, st.geo);
  if (uploaded.geo !== geo.data) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, geo.data); uploaded.geo = geo.data; }
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, st.shade);
  if (uploaded.shade !== shade) {
    if (shade) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, shade);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, ONE);
    uploaded.shade = shade;
  }
  if (uploaded.split !== split) {
    for (const [unit, t, src] of [[3, st.s0, split?.shading], [4, st.res, split?.residual]] as const) {
      gl.activeTexture(unit === 3 ? gl.TEXTURE3 : gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, t);
      if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, rgba(src, w * h));
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, ONE4);
    }
    uploaded.split = split;
  }
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, st.s0);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, st.res);
  gl.uniform1i(loc.uS0, 3); gl.uniform1i(loc.uRes, 4); gl.uniform1f(loc.uSplit, split ? 1 : 0);
  gl.uniform1i(loc.uBase, 0); gl.uniform1i(loc.uGeo, 1); gl.uniform1i(loc.uShade, 2);
  const sc = sceneTerms(content);
  gl.uniform3f(loc.uAmbient, sc.ambient[0], sc.ambient[1], sc.ambient[2]);
  gl.uniform1f(loc.uDelight, shade && !split ? sc.delight : 0);
  gl.uniform1f(loc.uShadows, sc.shadows);
  gl.uniform1f(loc.uTakeOut, sc.takeOut);
  gl.uniform2f(loc.uSize, w, h);
  const lights = packLights(content, w, h);
  gl.uniform1i(loc.uCount, lights.length);
  gl.uniform1f(loc.uOrig, content.original / 100);
  gl.uniform1f(loc.uShine, content.shine / 100);
  gl.uniform1i(loc.uSteps, Math.min(32, steps));
  const pack = (f: (i: number) => number[]): Float32Array => { const a = new Float32Array(MAX_RELIGHT_LIGHTS * 4); lights.forEach((_, i) => a.set(f(i), i * 4)); return a; };
  gl.uniform4fv(loc.uA, pack((i) => [lights[i].type, lights[i].intensity, lights[i].softness, lights[i].diffusion]));
  gl.uniform4fv(loc.uB, pack((i) => [...lights[i].color, lights[i].distance]));
  gl.uniform4fv(loc.uC, pack((i) => [...lights[i].pos, ...lights[i].aim]));
  gl.uniform4fv(loc.uD, pack((i) => [lights[i].pattern, lights[i].pat[0], lights[i].pat[1], lights[i].pat[2]]));
  gl.uniform4fv(loc.uE, pack((i) => [lights[i].pat[3], lights[i].pat2[0], lights[i].pat2[1], lights[i].pat2[2]]));
  gl.uniform4fv(loc.uF, pack((i) => [lights[i].range[0], lights[i].range[1], 0, 0]));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  const out = new Uint8ClampedArray(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
  return out;
}

export function forgetRelightUploads(): void { uploaded = { base: null, geo: null, shade: undefined, split: undefined }; }
