// タイトルの川だけを動かす描画（WebGL）。街の絵そのものは CSS の背景のまま残し、
// その上に重ねた透明なキャンバスへ「川の範囲だけ」を描く。橋・岸・建物は描かないので動かない。
// キャンバスは絵と同じ縦横比（1536×1024）で作り、CSS の object-fit: cover・中央寄せで背景と同じように伸び縮みさせる
import { ART_SIZE, EDGE_FEATHER, FLOW_DIR, RIVER, WATER, type WaterQuality } from "./river";

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() { v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5); gl_Position = vec4(a_pos, 0.0, 1.0); }`;

// 主役は「下流へ流れる動き」。どれも流れの向き（along）に沿ってゆっくり進む。岸に近いほど弱め、岸の色を引き込まない
// 1. 揺れ：水面を数ピクセル波打たせる。波の山が下流へ進む
// 2. 流れの濃淡：水面全体に、下流へ流れていく明暗のうねり
// 3. 光の筋：流れの向きに細長い光が、下流へ運ばれていく
// 4. 反射：明るい水面でまれに瞬く（控えめ）
const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_art, u_mask;
uniform float u_time, u_ripple, u_glint;
uniform vec2 u_size, u_flow;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float m = texture2D(u_mask, v_uv).r;
  if (m < 0.01) discard;
  vec2 px = v_uv * u_size, across = vec2(-u_flow.y, u_flow.x);
  float along = dot(px, u_flow), side = dot(px, across), t = u_time;
  float inner = smoothstep(0.35, 1.0, m);
  float drift = along - t * 34.0; // 下流へ 34px/秒で進む座標（ゆったり）
  vec2 wobble = (u_flow * sin(drift * 0.05 + sin(side * 0.035 + t * 0.4) * 1.6)
               + across * sin(drift * 0.031 + side * 0.06) * 0.8) * u_ripple * inner;
  vec3 col = texture2D(u_art, (px + wobble) / u_size).rgb;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float swell = sin(drift * 0.018 + sin(side * 0.02) * 1.5) * 0.5 + 0.5;
  col *= mix(0.94, 1.08, swell * inner);
  float band = sin(side * 0.11 + sin(drift * 0.012) * 2.2) * (0.6 + 0.4 * sin(drift * 0.022 + side * 0.013));
  float streak = pow(max(band, 0.0), 6.0) * 0.32;
  vec2 cell = floor(px / vec2(14.0, 9.0));
  float r = hash(cell);
  float twinkle = step(0.975, r) * pow(max(sin(t * (0.9 + r * 1.2) + r * 40.0), 0.0), 24.0) * 0.3;
  col += vec3(1.0, 0.97, 0.88) * (streak * (0.5 + lum) + twinkle * smoothstep(0.35, 0.6, lum)) * u_glint * inner;
  gl_FragColor = vec4(col * m, m);
}`;

function shader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
  return s;
}

function texture(gl: WebGLRenderingContext, unit: number, src: TexImageSource) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, t);
  for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]])
    gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
}

// 川の範囲を白で塗った画像（縁を少しぼかす）。シェーダーはこれを見て、川の外を描かない
function riverMask(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!, k = w / ART_SIZE.width;
  g.filter = `blur(${EDGE_FEATHER * k}px)`;
  g.fillStyle = "#fff";
  g.beginPath();
  RIVER.forEach(([x, y], i) => (i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)));
  g.closePath();
  g.fill();
  return c;
}

export class RiverWater {
  private gl: WebGLRenderingContext;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private raf = 0;
  private last = 0;
  private start = performance.now();
  private readonly q: (typeof WATER)[WaterQuality];

  // WebGL が使えない環境では例外を投げる（呼び出し側は静止画のままにする）
  constructor(private canvas: HTMLCanvasElement, art: HTMLImageElement, quality: WaterQuality) {
    this.q = WATER[quality];
    const w = Math.round(ART_SIZE.width * this.q.scale), h = Math.round(ART_SIZE.height * this.q.scale);
    canvas.width = w; canvas.height = h;
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false, powerPreference: "low-power" });
    if (!gl) throw new Error("WebGL を使えません");
    this.gl = gl;
    const p = gl.createProgram()!;
    gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "program");
    gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(p, "a_pos");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    for (const n of ["u_art", "u_mask", "u_time", "u_ripple", "u_glint", "u_size", "u_flow"]) this.loc[n] = gl.getUniformLocation(p, n);
    texture(gl, 0, art);
    texture(gl, 1, riverMask(w, h));
    gl.uniform1i(this.loc.u_art, 0);
    gl.uniform1i(this.loc.u_mask, 1);
    gl.uniform2f(this.loc.u_size, ART_SIZE.width, ART_SIZE.height);
    gl.uniform2f(this.loc.u_flow, FLOW_DIR.x, FLOW_DIR.y);
    gl.uniform1f(this.loc.u_ripple, this.q.ripple);
    gl.uniform1f(this.loc.u_glint, this.q.glint);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
  }

  private draw(now: number) {
    const gl = this.gl;
    gl.uniform1f(this.loc.u_time, (now - this.start) / 1000);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // 動かす。タブが隠れている間はブラウザが requestAnimationFrame を止めるので、描画も止まる
  play() {
    if (this.raf) return;
    const frame = 1000 / this.q.fps;
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      if (now - this.last < frame - 1) return;
      this.last = now;
      this.draw(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // 止めて川の上の描画を消す（下の静止画がそのまま見える）
  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  destroy() {
    this.stop();
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
