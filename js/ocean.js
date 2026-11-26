/**
 * Nagi — oceano noturno realista (WebGL puro, um shader de tela cheia).
 * Altura do mar = soma de ondas direcionais com crista afiada + ruído fino; traçado do campo de altura por
 * raio, reflexo do céu com lua (Fresnel), cor de fundo azul-abissal, brilho de luz atravessando a crista,
 * espuma nas cristas mais altas e névoa no horizonte. Renderiza em resolução reduzida e pausa com a aba oculta.
 */

const VERT = `
attribute vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uLook;      // parallax do mouse (-1..1)
uniform float uCalm;     // 0 = mar agitado (capa), 1 = mar calmo (telas de trabalho)

const int TRACE_STEPS = 72;
const int DETAIL_OCT = 5;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

// onda direcional com crista afiada (perfil trocoide aproximado)
float swell(vec2 p, vec2 dir, float k, float spd, float sharp) {
  float ph = dot(p, normalize(dir)) * k + uTime * spd;
  ph += noise(p * 0.08 + uTime * 0.03) * 1.6;      // quebra a regularidade
  float s = 0.5 + 0.5 * sin(ph);
  return pow(s, sharp);
}

float seaHeight(vec2 p, int oct) {
  float agit = mix(1.0, 0.55, uCalm);
  float h = 0.0;
  h += 1.35 * swell(p, vec2(1.0, 0.35), 0.16, 0.55, 2.6);
  h += 0.85 * swell(p, vec2(-0.6, 1.0), 0.23, 0.70, 2.2);
  h += 0.55 * swell(p, vec2(0.9, -0.8), 0.37, 0.95, 1.8);
  h += 0.30 * swell(p, vec2(-1.0, -0.2), 0.61, 1.25, 1.5);
  // detalhe fino (fbm)
  float a = 0.22, f = 0.9;
  vec2 q = p;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    h += a * (noise(q * f + uTime * (0.25 + float(i) * 0.12)) - 0.5);
    f *= 2.03; a *= 0.48; q = mat2(0.8, -0.6, 0.6, 0.8) * q;
  }
  return h * agit;
}

float mapSea(vec3 p, int oct) { return p.y - seaHeight(p.xz, oct); }

// traçado por bissecção do campo de altura
float traceSea(vec3 ro, vec3 rd, out vec3 hit) {
  float tm = 0.0, tx = 220.0;
  float hx = mapSea(ro + rd * tx, 2);
  if (hx > 0.0) { hit = ro + rd * tx; return tx; }
  float hm = mapSea(ro, 2);
  float tmid = 0.0;
  for (int i = 0; i < TRACE_STEPS; i++) {
    tmid = mix(tm, tx, hm / (hm - hx));
    hit = ro + rd * tmid;
    float hmid = mapSea(hit, 2);
    if (hmid < 0.0) { tx = tmid; hx = hmid; } else { tm = tmid; hm = hmid; }
    if (abs(hmid) < 0.002) break;
  }
  return tmid;
}

vec3 seaNormal(vec3 p, float eps) {
  float h = seaHeight(p.xz, DETAIL_OCT);
  return normalize(vec3(h - seaHeight(p.xz + vec2(eps, 0.0), DETAIL_OCT), eps, h - seaHeight(p.xz + vec2(0.0, eps), DETAIL_OCT)));
}

const vec3 MOON_DIR = normalize(vec3(0.35, 0.28, 1.0));

vec3 sky(vec3 rd, float estrelas) {
  float y = max(rd.y, 0.0);
  vec3 zen = vec3(0.012, 0.028, 0.075);
  vec3 hor = vec3(0.07, 0.16, 0.32);
  vec3 c = mix(hor, zen, pow(y, 0.45));
  float m = max(dot(rd, MOON_DIR), 0.0);
  c += vec3(0.18, 0.32, 0.65) * pow(m, 22.0) * 0.45;     // halo largo (o disco entra no fim)
  c += vec3(0.10, 0.20, 0.45) * pow(m, 4.0) * 0.18;
  // estrelas
  vec2 sp = rd.xz / (rd.y + 0.12) * 220.0;
  float st = step(0.9965, hash(floor(sp))) * smoothstep(0.05, 0.4, y) * estrelas;
  c += vec3(0.75, 0.85, 1.0) * st * (0.4 + 0.6 * hash(floor(sp) + 3.1));
  return c;
}

vec3 seaColor(vec3 p, vec3 n, vec3 rd, float dist) {
  float fres = clamp(1.0 - dot(n, -rd), 0.0, 1.0);
  fres = pow(fres, 3.0) * 0.72;
  vec3 refl = sky(reflect(rd, n), 0.0);
  vec3 deep = vec3(0.004, 0.022, 0.058);
  vec3 body = vec3(0.02, 0.11, 0.24);
  float h = p.y;
  // luz atravessando a crista (azul-turquesa)
  vec3 sss = vec3(0.05, 0.32, 0.55) * smoothstep(0.6, 2.4, h) * pow(max(dot(n, MOON_DIR), 0.0), 2.0) * 0.9;
  vec3 col = mix(deep, body, clamp(0.25 + h * 0.18, 0.0, 1.0));
  col = mix(col + sss, refl, fres);
  // brilho especular da lua na água
  float spec = pow(max(dot(reflect(rd, n), MOON_DIR), 0.0), 260.0);
  col += vec3(0.75, 0.88, 1.0) * spec * 2.2;
  // espuma nas cristas
  float foam = smoothstep(1.85, 2.55, h) * (0.55 + 0.45 * noise(p.xz * 3.1 + uTime * 0.6));
  foam *= mix(1.0, 0.35, uCalm);
  col = mix(col, vec3(0.70, 0.82, 0.95), foam * 0.55);
  // névoa do horizonte
  float fog = 1.0 - exp(-dist * 0.0105);
  col = mix(col, vec3(0.06, 0.14, 0.28), fog);
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  float bob = sin(uTime * 0.35) * 0.18;
  vec3 ro = vec3(uTime * 1.1, 4.1 + bob + uLook.y * 0.35, 0.0);
  vec3 fw = normalize(vec3(0.12 + uLook.x * 0.06, -0.11 + uLook.y * 0.03, 1.0));
  vec3 rt = normalize(cross(vec3(0, 1, 0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(fw * 1.55 + rt * uv.x + up * uv.y);

  vec3 col;
  if (rd.y > 0.02) {
    col = sky(rd, 1.0);
  } else {
    vec3 hit;
    float t = traceSea(ro, rd, hit);
    vec3 n = seaNormal(hit, 0.012 + t * 0.0016);
    col = seaColor(hit, n, rd, t);
    col = mix(col, sky(rd, 0.0), smoothstep(-0.02, 0.02, rd.y));
  }
  // vinheta + curva de tom suave
  vec2 q = gl_FragCoord.xy / uRes;
  col *= 0.55 + 0.45 * pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.18);
  col = pow(col, vec3(0.88));
  // lua por cima de tudo: disco de borda limpa + brilho em volta
  if (rd.y > 0.0) {
    float m = max(dot(rd, MOON_DIR), 0.0);
    float disco = smoothstep(0.99935, 0.99962, m);
    float tex = 0.9 + 0.1 * noise(rd.xy * 900.0);          // leve textura de crateras
    col = mix(col, vec3(1.0, 1.0, 1.0) * tex, disco);
    col += vec3(0.55, 0.72, 1.0) * (pow(m, 420.0) * 0.7 + pow(m, 90.0) * 0.22);  // brilho em volta
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Oceano {
  constructor(canvas, { escala = 0.55, calmo = 0 } = {}) {
    this.canvas = canvas;
    this.escala = escala;
    this.calmo = calmo;
    this.alvoCalmo = calmo;
    this.look = [0, 0];
    this.alvoLook = [0, 0];
    this.t0 = performance.now();
    this.parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) { canvas.classList.add('sem-webgl'); return; }
    this.gl = gl;
    const prog = this.programa(VERT, FRAG);
    if (!prog) { canvas.classList.add('sem-webgl'); return; }
    this.prog = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {
      res: gl.getUniformLocation(prog, 'uRes'),
      time: gl.getUniformLocation(prog, 'uTime'),
      look: gl.getUniformLocation(prog, 'uLook'),
      calm: gl.getUniformLocation(prog, 'uCalm'),
    };
    this.redimensionar();
    addEventListener('resize', () => this.redimensionar());
    addEventListener('pointermove', (e) => {
      this.alvoLook = [(e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1)];
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.loop(); });
    this.loop();
  }

  programa(vs, fs) {
    const gl = this.gl;
    const sh = (tipo, src) => {
      const s = gl.createShader(tipo);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); return null; }
    gl.useProgram(p);
    return p;
  }

  redimensionar() {
    const k = this.escala * Math.min(devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.max(320, Math.floor(innerWidth * k));
    this.canvas.height = Math.max(200, Math.floor(innerHeight * k));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (this.parado) this.desenhar(12);
  }

  setCalmo(v) { this.alvoCalmo = v; }

  desenhar(t) {
    const gl = this.gl;
    this.calmo += (this.alvoCalmo - this.calmo) * 0.03;
    this.look[0] += (this.alvoLook[0] - this.look[0]) * 0.03;
    this.look[1] += (this.alvoLook[1] - this.look[1]) * 0.03;
    gl.uniform2f(this.u.res, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.time, t);
    gl.uniform2f(this.u.look, this.look[0], this.look[1]);
    gl.uniform1f(this.u.calm, this.calmo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  loop() {
    if (this.rodando || this.parado) return;
    this.rodando = true;
    const passo = () => {
      if (document.hidden) { this.rodando = false; return; }
      this.desenhar((performance.now() - this.t0) / 1000);
      requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }
}
