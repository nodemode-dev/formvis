import { RIM, SSS, MAX_RELIGHT_LIGHTS, packLights, sceneTerms, shadeRelight, type RelightContent, type RelightGeometry, type SplitMaps } from '../engine/relight';

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
uniform float uGain;
uniform sampler2D uBg;
uniform float uFocal;
uniform float uThick;
uniform vec2 uZRange;

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
// Camera space (1.84.0): x right, y down, z away from the camera, in units of the subject's distance. A pixel's point
// is its depth along its camera ray; the focal length is a fraction of the picture's long side.
vec3 rayAt(vec2 p) { return vec3((p - 0.5 * uSize) / (uFocal * max(uSize.x, uSize.y)), 1.0); }
vec2 toPx(vec3 q) { return 0.5 * uSize + q.xy / max(q.z, 1e-4) * uFocal * max(uSize.x, uSize.y); }
vec2 texAt(vec2 p) { return clamp((floor(p) + 0.5) / uSize, vec2(0.0), vec2(1.0)); }
float zAtPx(vec2 p) { return texture(uGeo, texAt(p)).a; }
// A round light of angular radius asin(sa): the terminator is the cosine smoothed over the source's size.
float sphereLambert(float x, float sa) { return x >= sa ? x : (x <= -sa ? 0.0 : (x + sa) * (x + sa) / (4.0 * sa)); }
// The light sits where its marker is, at the depth of the point it aims at, and Close to Far brings it out toward the
// camera: close is beside the subject (side light, steep falloff), far is well in front of it (frontal, sun-like).
// A sun is always well up: daylight reaches the front of the subject, Close to Far raises it further.
vec3 lightPos(vec2 pos, vec2 aim, float d, bool sun) { float za = zAtPx(aim); return rayAt(pos) * za - vec3(0.0, 0.0, za * (sun ? 0.25 + 0.75 * d : 0.03 + 0.97 * pow(d, 1.5))); }
// Where the line from a point toward the light meets the plane at the pattern centre's depth, in pixels.
vec2 goboPx(vec3 P, vec3 L, vec3 dir, bool sun, float zc) {
  vec3 X;
  if (sun) { float dz = abs(dir.z) < 0.02 ? (dir.z < 0.0 ? -0.02 : 0.02) : dir.z; X = P + dir * ((zc - P.z) / dz); }
  else { float den = P.z - L.z; den = abs(den) < 1e-3 ? (den < 0.0 ? -1e-3 : 1e-3) : den; X = L + (P - L) * ((zc - L.z) / den); }
  return toPx(vec3(X.xy, zc));
}
// Soft shadow: rays from the point toward several points on the light, marched through the depth map. A sample hides
// the light when it passes behind the visible surface and within the surface's thickness: the subject is about as deep
// as it is wide, the background is solid.
float visibility(vec3 P, vec3 Lc, vec3 toL, bool sun, float rad, float steps) {
  vec3 ax = sun ? toL : normalize(Lc - P);
  vec3 u = normalize(cross(ax, abs(ax.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), v = cross(ax, u);
  float total = 0.0;
  for (int k = 0; k < 8; k++) {
    float a = 6.2831853 * (float(k) + 0.5) / 8.0, rr = (k % 2 == 0) ? 1.0 : 0.45;
    vec3 d; float T;
    if (sun) { d = normalize(ax + (u * cos(a) + v * sin(a)) * rr * rad); T = 2.5 * P.z; }
    else { vec3 q = Lc + (u * cos(a) + v * sin(a)) * rr * rad; d = normalize(q - P); T = min(length(q - P), 2.5 * P.z); }
    float vis = 1.0;
    for (int j = 1; j <= 32; j++) {
      if (float(j) > steps) break;
      float f = float(j) / steps, t = f * f * T + 0.006 * P.z;
      vec3 Q = P + d * t;
      if (Q.z < 0.05) break;
      vec2 qp = toPx(Q);
      if (qp.x < 0.0 || qp.y < 0.0 || qp.x >= uSize.x || qp.y >= uSize.y) break;
      vec2 tq = texAt(qp);
      float zs = texture(uGeo, tq).a, m = texture(uRes, tq).a, dz = Q.z - zs;
      float th = m > 0.5 || m < -0.5 ? uThick : 1e4;
      if (dz > 0.0 && dz < th) vis = min(vis, 1.0 - sstep(0.004 * Q.z, 0.03 * Q.z, dz));
      if (vis <= 0.0) break;
    }
    total += vis;
  }
  return total / 8.0;
}
float patternAt(float kind, vec2 q, float s, vec4 d, vec4 e, float soft, bool frameOnly) {
  float k = abs(kind);
  if (k < 0.5 || (frameOnly && (kind < 0.0 || (k > 3.5 && k < 5.5) || (k > 7.5 && k < 8.5)))) return 1.0;
  float rot = e.w, cr = cos(rot), sr = sin(rot);
  float x = (q.x * cr + q.y * sr) / s, y = (-q.x * sr + q.y * cr) / s;
  float feather = max(0.002, e.z * 0.25 + soft * 0.08);
  float m = 1.0;
  if (k < 1.5) {
    float half_ = 0.28 * d.y, hw = half_ * d.z;
    float frame = sstep(hw, hw - feather, abs(x)) * sstep(half_, half_ - feather, abs(y));
    float period = (2.0 * half_) / max(2.0, d.w), ph = fract((y + half_) / period), f = feather / period;
    float hf = min(f, 0.3) * 0.5, wash = clamp((f - 0.3) / 0.7, 0.0, 1.0), q = abs(fract(ph - e.x * 0.5 + 0.5) - 0.5);
    m = frameOnly ? frame : frame * (sstep(e.x * 0.5 + hf, e.x * 0.5 - hf, q) * (1.0 - wash) + e.x * wash);
  } else if (k < 2.5) {
    float hl = 0.58 * e.y * d.y, hw = 0.5 * d.z * 0.2 * d.y;
    float fw = max(0.002, 2.0 * hw * (e.z + 0.3 * soft));
    m = sstep(hl + fw * 0.5, hl - fw * 0.5, abs(y)) * sstep(hw + fw * 0.5, hw - fw * 0.5, abs(x));
  } else if (k < 3.5) {
    float half_ = 0.32 * d.y, bar = 0.02 * d.y;
    float frame = sstep(half_, half_ - feather, abs(x)) * sstep(half_ * 1.3, half_ * 1.3 - feather, abs(y));
    m = frameOnly ? frame : frame * sstep(bar, bar + feather, abs(x)) * sstep(bar, bar + feather, abs(y));
  } else if (k < 4.5) {
    float sc = 6.0 / max(0.1, d.y);
    float n = vnoise(vec2(x, y) * sc) * 0.65 + vnoise(vec2(x, y) * sc * 2.3 + vec2(7.0, 3.0)) * 0.35;
    m = sstep(1.0 - e.x - feather, 1.0 - e.x + feather, n);
  } else if (k < 5.5) {
    float sc = (2.0 + 0.3 * d.w) / max(0.1, d.y);
    vec2 pp = vec2(x, y) * sc;
    vec2 qq = pp + vec2(vnoise(pp + vec2(3.1, 1.7)) - 0.5, vnoise(pp + vec2(8.3, 2.8)) - 0.5) * 1.6;
    vec2 ww = vec2(vnoise(qq * 2.1 + vec2(1.9, 6.1)) - 0.5, vnoise(qq * 2.1 + vec2(4.4, 9.7)) - 0.5);
    float n = vnoise(qq) * 0.55 + vnoise(qq * 2.03 + vec2(5.2, 1.3) + ww * 0.8) * 0.3 + vnoise(qq * 4.1 + vec2(9.1, 4.7)) * 0.15;
    float ridge = max(0.0, 1.0 - abs(2.0 * n - 1.0)), pw = (2.0 + 14.0 * (1.0 - e.x)) / (1.0 + 8.0 * feather);
    m = 0.25 + 0.75 * pow(ridge, pw);
  } else if (k < 6.5) {
    float hx = 0.32 * d.y, hy = hx * 1.3;
    float frame = sstep(hx, hx - feather, abs(x)) * sstep(hy, hy - feather, abs(y));
    float per = (2.0 * hx) / max(2.0, d.w), bw = (1.0 - e.x) * 0.3 * per, fl = min(feather, per * 0.3);
    float da = abs(fract((x + y) / per + 0.5) - 0.5) * per * 0.70710678118654752, db = abs(fract((x - y) / per + 0.5) - 0.5) * per * 0.70710678118654752;
    m = frameOnly ? frame : frame * sstep(bw, bw + fl, da) * sstep(bw, bw + fl, db);
  } else if (k < 7.5) {
    float hh = 0.4 * d.y, hw = min(0.22 * d.z, 0.4) * d.y, yc = hw - hh, bar = 0.018 * d.y, y2 = (yc + hh) * 0.5;
    float dd = y < yc ? length(vec2(x, y - yc)) - hw : max(abs(x) - hw, y - hh);
    float frame = sstep(0.0, -feather, dd);
    m = frameOnly ? frame : frame * sstep(bar, bar + feather, abs(x)) * sstep(bar, bar + feather, abs(y - yc)) * sstep(bar, bar + feather, abs(y - y2));
  } else if (k < 8.5) {
    float cs = 0.1 * d.y, ix = floor(x / cs), iy = floor(y / cs), miss = 1.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        float cx = ix + float(i), cy = iy + float(j);
        if (hash(vec2(cx + 17.3, cy + 5.1)) >= e.x) continue;
        float dx = x - (cx + 0.1 + 0.8 * hash(vec2(cx + 3.7, cy + 11.9))) * cs, dy = y - (cy + 0.1 + 0.8 * hash(vec2(cx + 29.1, cy + 7.3))) * cs;
        float r = 0.5 * cs * (0.5 + 0.8 * hash(vec2(cx + 41.7, cy + 23.9)));
        miss *= 1.0 - sstep(r, max(0.0, 0.55 * r - feather), length(vec2(dx, dy)));
      }
    }
    m = 1.0 - miss;
  } else if (k < 9.5) {
    float rad = 0.3 * d.y;
    m = sstep(rad, rad - feather, length(vec2(x / max(0.05, d.z), y)));
  }
  return kind < 0.0 ? 1.0 - m : m;
}
// One surface layer lit by every light (1.84.0): E gathers light that multiplies the surface colour, Sp gathers
// glints that sit on top. P is the point in camera space, nV its normal (z toward the viewer).
void shadeLayer(vec2 p, vec3 P, vec3 nV, float subj, float tex, float warm, inout vec3 E, inout vec3 Sp) {
  vec3 nW = normalize(vec3(nV.xy, -nV.z)), V = normalize(-P);
  float near = clamp((uZRange.y - P.z) / max(1e-4, uZRange.y - uZRange.x), 0.0, 1.0);
  for (int i = 0; i < ${MAX_RELIGHT_LIGHTS}; i++) {
    if (i >= uCount) break;
    vec4 A = uA[i], B = uB[i], C = uC[i], D = uD[i], Ee = uE[i], F = uF[i];
    float win = (F.x <= 0.0 ? 1.0 : sstep(F.x - 0.04, F.x + 0.04, near)) * (F.y >= 1.0 ? 1.0 : sstep(F.y + 0.04, F.y - 0.04, near));
    if (win <= 0.0) continue;
    float type = A.x, intensity = A.y, softness = A.z, diffusion = A.w, d = B.w;
    bool sun = abs(type - 2.0) < 0.5, ring = abs(type - 5.0) < 0.5;
    vec2 pos = C.xy, aim = C.zw;
    vec3 PA = rayAt(aim) * zAtPx(aim), L = ring ? rayAt(pos) * zAtPx(aim) * 0.12 : lightPos(pos, aim, d, sun);
    float dA = max(0.05, length(L - PA)), rad, sa, atten = 1.0;
    vec3 Lc = L, toL;
    if (sun) {
      toL = normalize(L - PA);
      rad = tan(radians(0.6 + 24.0 * softness));
      sa = sin(atan(rad));
    } else {
      if (abs(type - 4.0) < 0.5) { vec3 tg = normalize(cross(normalize(PA - L), vec3(0.0, 0.0, 1.0))); Lc = L + tg * clamp(dot(P - L, tg), -0.35 * dA, 0.35 * dA); }
      vec3 v = Lc - P;
      float dist = max(1e-3, length(v));
      toL = v / dist;
      rad = (0.03 + 0.35 * softness + (abs(type - 3.0) < 0.5 ? 0.25 : 0.0) + (ring ? 0.3 : 0.0)) * dA;
      sa = min(0.95, rad / dist);
      atten = min(4.0, pow((dA + rad) / (dist + rad), 1.6));
      if (abs(type - 1.0) < 0.5) {
        float cosA = dot(-toL, normalize(PA - L));
        atten *= sstep(cos(radians(30.0 + 30.0 * softness)), cos(radians(18.0 + 22.0 * softness)), cosA);
      }
    }
    float ndl = dot(nW, toL), wrap = diffusion * 0.6;
    float lam = sphereLambert((ndl + wrap) / (1.0 + wrap), max(sa, 0.02));
    float back = clamp(toL.z + 0.5, 0.0, 1.0);
    vec2 nxy = nW.xy / max(1e-3, length(nW.xy)), lxy = toL.xy / max(1e-3, length(toL.xy));
    float rim = subj > 0.0 ? ${RIM.toFixed(3)} * subj * back * pow(clamp(1.0 - abs(nV.z), 0.0, 1.0), 2.0) * max(0.0, dot(nxy, lxy)) * (0.6 + 0.8 * tex) : 0.0;
    float spill = sphereLambert((ndl + 0.45) / 1.45, 0.3);
    if (lam <= 0.0 && rim <= 0.0 && spill <= 0.0) continue;
    float shadow = 1.0;
    if (!ring && uSteps > 0) shadow = 1.0 - (1.0 - visibility(P + nW * 0.004 * P.z, Lc, toL, sun, rad, float(uSteps))) * uShadows;
    float pattern = 1.0, frame = 1.0;
    if (abs(D.x) > 0.5) {
      float zc = zAtPx(F.zw);
      vec2 q = goboPx(P, Lc, toL, sun, zc) - F.zw;
      float spread = softness + (abs(abs(D.x) - 2.0) < 0.5 ? 0.0 : 0.8 * max(0.0, P.z - zc));
      pattern = patternAt(D.x, q, max(uSize.x, uSize.y), D, Ee, spread, false);
      frame = patternAt(D.x, q, max(uSize.x, uSize.y), D, Ee, spread, true);
    }
    float level = intensity * 3.2 * (sun ? 2.7 : 2.2) * atten, amount = level * shadow * pattern;
    E += B.rgb * (amount * (lam + rim) * (1.0 - diffusion) + level * diffusion * 0.3 * frame * clamp(0.5 + 0.5 * ndl, 0.0, 1.0)) * win * uGain;
    E += B.rgb * vec3(1.0, 0.35, 0.0) * amount * (1.0 - diffusion) * ${SSS.toFixed(3)} * max(0.0, spill - lam) * warm * win * uGain;
    vec3 H = normalize(toL + V);
    float g = 8.0 + 120.0 * (1.0 - softness) * (1.0 - softness);
    Sp += B.rgb * pow(max(0.0, dot(nW, H)), g) * (g + 8.0) / 25.13 * max(0.0, ndl) * 0.04 * (0.4 + 1.6 * tex) * amount * win * uGain;
  }
}

void main() {
  vec2 uv = vUv;
  vec2 p = uv * uSize;
  vec4 base = texture(uBase, uv);
  vec4 g = texture(uGeo, uv);
  vec4 s0t = uSplit > 0.5 ? texture(uS0, uv) : vec4(1.0, 1.0, 1.0, 0.0);
  vec3 s0 = max(s0t.rgb, vec3(1e-4));
  vec4 resid = texture(uRes, uv);
  float subj = uSplit > 0.5 ? resid.a : -1.0, tex = max(0.0, s0t.a);
  vec3 alb = vec3(toLin(base.r), toLin(base.g), toLin(base.b));
  vec3 photo = uSplit > 0.5 ? alb * s0 + resid.rgb : alb;
  // Very dark pixels keep their brightness but not their colour, so added light does not lift colour noise.
  float yp = dot(photo, vec3(0.2126, 0.7152, 0.0722)), ya = dot(alb, vec3(0.2126, 0.7152, 0.0722));
  alb = mix(vec3(ya), alb, sstep(0.0015, 0.012, yp));
  float warm = clamp((alb.r - alb.b) / (alb.r + 1e-3) * 1.6, 0.0, 1.0);
  vec3 Es = vec3(0.0), Eb = vec3(0.0), Ss = vec3(0.0), Sb = vec3(0.0);
  vec2 pc = floor(p) + 0.5;
  float m = subj < 0.0 ? 0.0 : clamp(subj, 0.0, 1.0);
  vec4 bg = texture(uBg, uv);
  // Two layers blended by the cut-out: the subject on its own surface, the background on the one filled in behind it.
  if (subj < 0.0 || m < 0.98) shadeLayer(pc, rayAt(pc) * (subj < 0.0 ? g.a : bg.a), subj < 0.0 ? g.rgb : bg.rgb, 0.0, 0.0, warm, Eb, Sb);
  if (m > 0.02) { float zs = m > 0.98 ? g.a : max(0.05, (g.a - (1.0 - m) * bg.a) / m); shadeLayer(pc, rayAt(pc) * zs, g.rgb, m, tex, warm, Es, Ss); }
  vec3 Ea = mix(Eb, Es, m), Sa = mix(Sb, Ss, m) * uShine * 2.0;
  Sa = Sa / (1.0 + Sa);
  float kd = 1.0 / (1.0 + (texture(uShade, uv).r - 1.0) * uDelight);
  vec3 kept = uAmbient * pow(s0, vec3(uTakeOut));
  vec3 o = alb * kd * pow(s0, vec3(1.0 - uTakeOut)) * (kept + Ea) + (uSplit > 0.5 ? resid.rgb * uOrig : vec3(0.0)) + Sa;
  o = max(o, vec3(0.0));
  // A dark background can only be brightened so far.
  if (uSplit > 0.5) o = mix(min(o, photo * 6.0 + 0.02), o, m);
  float peak = max(max(o.r, o.g), max(o.b, 1e-6));
  o *= tone(peak) / peak;
  outColor = vec4(toSrgb(o.r), toSrgb(o.g), toSrgb(o.b), base.a);
}`;

interface GlState { gl: WebGL2RenderingContext; canvas: HTMLCanvasElement | OffscreenCanvas; prog: WebGLProgram; base: WebGLTexture; geo: WebGLTexture; shade: WebGLTexture; s0: WebGLTexture; res: WebGLTexture; bg: WebGLTexture; loc: Record<string, WebGLUniformLocation | null> }

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
    if (gl.getShaderParameter(o, gl.COMPILE_STATUS)) return o;
    console.warn('[relight] shader:', gl.getShaderInfoLog(o));
    return null;
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
  const base = tex(), geo = tex(), shade = tex(), s0 = tex(), res = tex(), bg = tex();
  if (!base || !geo || !shade || !s0 || !res || !bg) return null;
  const loc: Record<string, WebGLUniformLocation | null> = {};
  for (const k of ['uBase', 'uGeo', 'uSize', 'uCount', 'uOrig', 'uShine', 'uSteps', 'uA', 'uB', 'uC', 'uD', 'uE', 'uF', 'uShade', 'uDelight', 'uShadows', 'uAmbient', 'uS0', 'uRes', 'uSplit', 'uTakeOut', 'uGain', 'uBg', 'uFocal', 'uThick', 'uZRange']) loc[k] = gl.getUniformLocation(prog, k);
  state = { gl, canvas, prog, base, geo, shade, s0, res, bg, loc };
  return state;
}

export const relightGpuAvailable = (): boolean => !!init();

let uploaded: { base: Uint8ClampedArray | null; geo: Float32Array | null; shade: Float32Array | null | undefined; split: SplitMaps | null | undefined } = { base: null, geo: null, shade: undefined, split: undefined };
const ONE = new Float32Array([1]);
const ONE4 = new Float32Array([1, 1, 1, 1]);
const NO_SUBJECT = new Float32Array([0, 0, 0, -1]);

function rgba(src: Float32Array, n: number, alpha?: Float32Array | null): Float32Array {
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { out[i * 4] = src[i * 3]; out[i * 4 + 1] = src[i * 3 + 1]; out[i * 4 + 2] = src[i * 3 + 2]; out[i * 4 + 3] = alpha ? alpha[i] : -1; }
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
  if (uploaded.geo !== geo.data) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, geo.data);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, st.bg);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, geo.bg ?? geo.data);
    uploaded.geo = geo.data;
  }
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, st.bg);
  gl.uniform1i(loc.uBg, 5);
  gl.uniform1f(loc.uFocal, geo.focal ?? 1.2); gl.uniform1f(loc.uThick, geo.thickness ?? 0.3);
  gl.uniform2f(loc.uZRange, geo.zNear ?? 0.8, geo.zFar ?? 2.5);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, st.shade);
  if (uploaded.shade !== shade) {
    if (shade) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, shade);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, ONE);
    uploaded.shade = shade;
  }
  if (uploaded.split !== split) {
    for (const [unit, t, src] of [[3, st.s0, split?.shading], [4, st.res, split?.residual]] as const) {
      gl.activeTexture(unit === 3 ? gl.TEXTURE3 : gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, t);
      if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, rgba(src, w * h, unit === 4 ? split?.subject : split?.texture));
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, unit === 4 ? NO_SUBJECT : ONE4);
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
  gl.uniform1f(loc.uGain, split?.gain ?? 1);
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
  gl.uniform4fv(loc.uF, pack((i) => [lights[i].range[0], lights[i].range[1], ...lights[i].center]));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  const out = new Uint8ClampedArray(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
  return out;
}

export function forgetRelightUploads(): void { uploaded = { base: null, geo: null, shade: undefined, split: undefined }; }
