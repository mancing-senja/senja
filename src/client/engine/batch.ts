/** Sprite batcher: one dynamic buffer of textured, tinted quads.
 *  Everything that is not a fullscreen shader pass goes through here. */

import { Shader, type GL } from './gl';
import { view } from './view';

const VERT = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in vec2 a_uv;
layout(location=2) in vec4 a_col;
uniform vec2 u_view;   // internal resolution
uniform vec2 u_cam;    // camera top-left in world px
out vec2 v_uv;
out vec4 v_col;
out vec2 v_world;
void main(){
  vec2 p = a_pos - u_cam;
  vec2 clip = vec2(p.x / u_view.x * 2.0 - 1.0, 1.0 - p.y / u_view.y * 2.0);
  v_uv = a_uv;
  v_col = a_col;
  v_world = a_pos;
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec4 v_col;
in vec2 v_world;
uniform sampler2D u_tex;
uniform sampler2D u_norm;
/** 0 = normal tint (multiply), 1 = flat fill keeping source alpha.
 *  The flat mode draws silhouettes: shadows, water reflections, flash. */
uniform float u_flat;
/** Direction the light arrives from, in screen space, normalised. */
uniform vec3 u_lightDir;
/** How much shading the normal map is allowed to do. Zero restores the
 *  old flat look exactly, which is what the HUD pass wants. */
uniform float u_lightAmt;
/** Colour of the key light, so a sunset warms the lit faces and not only
 *  the ambient tint. */
uniform vec3 u_lightCol;

/** Lanterns, torches, windows and neon, in world pixels.
 *
 *  Eight is not a budget, it is a design decision: the nearest handful is
 *  all that can be told apart, and a lake edge lined with thirty lamps
 *  would just wash to a flat glow. xy is the position, z the radius. */
#define MAX_LAMPS 8
uniform int u_lampN;
uniform vec3 u_lampPos[MAX_LAMPS];
uniform vec3 u_lampCol[MAX_LAMPS];
out vec4 o;
void main(){
  vec4 t = texture(u_tex, v_uv);
  if (t.a < 0.004) discard;
  vec3 rgb = mix(t.rgb * v_col.rgb, v_col.rgb, u_flat);

  if (u_lightAmt > 0.001) {
    vec3 n = normalize(texture(u_norm, v_uv).rgb * 2.0 - 1.0);
    // Half-lambert. Straight N.L drives the away-facing half to black, and
    // on a 48-colour palette that means every sprite grows a dead flat
    // silhouette on its shadow side. Wrapping it keeps shape in the dark.
    float lam = dot(n, u_lightDir) * 0.5 + 0.5;
    float key = mix(1.0, lam * lam * 1.4, u_lightAmt);
    rgb *= mix(vec3(1.0), u_lightCol, u_lightAmt * 0.30) * key;

    // Lamps. These *add* rather than multiply: a lantern brightens what it
    // reaches and leaves everything else exactly as the sun left it, which
    // is what stops a lit street flattening the shading it sits on.
    vec3 lamp = vec3(0.0);
    for (int i = 0; i < MAX_LAMPS; i++) {
      if (i >= u_lampN) break;
      vec2 d2 = u_lampPos[i].xy - v_world;
      float r = u_lampPos[i].z;
      float dist = length(d2);
      if (dist > r) continue;
      // Smooth to zero at the rim. A linear falloff leaves a visible disc
      // edge, and a disc edge on a light is worse than no light.
      float fall = 1.0 - dist / r;
      fall *= fall;
      // The lamp sits above the ground, so its direction has a height term.
      // Without it a lamp lights the sprite's left and right sides equally
      // and everything under it reads as flat.
      vec3 ldir = normalize(vec3(d2 / max(r, 1.0), 0.75));
      float nl = max(0.0, dot(n, ldir)) * 0.65 + 0.35;
      lamp += u_lampCol[i] * fall * nl;
    }
    rgb += lamp * u_lightAmt;
  }

  o = vec4(rgb, t.a * v_col.a);
}`;

export const enum Blend {
  Alpha,
  Add,
}

const MAX_QUADS = 6000;
const FLOATS_PER_VERT = 8;

export class SpriteBatch {
  private shader: Shader;
  /** The normal atlas, bound to unit 1. */
  private norm: WebGLTexture | null = null;
  private lightAmt = 0;
  private lx = -0.4;
  private ly = -0.6;
  private lz = 0.7;
  private lr = 1;
  private lg = 1;
  private lb = 1;
  private lampN = 0;
  private lampPos = new Float32Array(8 * 3);
  private lampCol = new Float32Array(8 * 3);
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private data: Float32Array;
  private count = 0; // quads
  private tex: WebGLTexture | null = null;
  private blend: Blend = Blend.Alpha;
  private flat = 0;
  private camX = 0;
  private camY = 0;
  drawCalls = 0;

  constructor(private gl: GL) {
    this.shader = new Shader(gl, VERT, FRAG, 'sprite');
    this.data = new Float32Array(MAX_QUADS * 4 * FLOATS_PER_VERT);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    this.vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);

    const stride = FLOATS_PER_VERT * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);

    // Static index buffer: 0,1,2, 0,2,3 per quad.
    const idx = new Uint16Array(MAX_QUADS * 6);
    for (let i = 0; i < MAX_QUADS; i++) {
      const v = i * 4;
      const o = i * 6;
      idx[o] = v;
      idx[o + 1] = v + 1;
      idx[o + 2] = v + 2;
      idx[o + 3] = v;
      idx[o + 4] = v + 2;
      idx[o + 5] = v + 3;
    }
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
  }

  begin(camX: number, camY: number): void {
    this.camX = camX;
    this.camY = camY;
    this.count = 0;
    this.drawCalls = 0;
  }

  setCamera(camX: number, camY: number): void {
    if (camX === this.camX && camY === this.camY) return;
    this.flush();
    this.camX = camX;
    this.camY = camY;
  }

  private ensure(tex: WebGLTexture, blend: Blend, flat: number): void {
    if (this.tex !== tex || this.blend !== blend || this.flat !== flat) {
      this.flush();
      this.tex = tex;
      this.blend = blend;
      this.flat = flat;
    }
    if (this.count >= MAX_QUADS) this.flush();
  }

  /** Axis-aligned quad. Source rect is in texture pixels. */
  push(
    tex: WebGLTexture,
    texW: number,
    texH: number,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    r = 1,
    g = 1,
    b = 1,
    a = 1,
    blend: Blend = Blend.Alpha,
    flat = 0,
    flipX = false,
    flipY = false,
  ): void {
    this.ensure(tex, blend, flat);

    let u0 = sx / texW;
    let u1 = (sx + sw) / texW;
    let v0 = sy / texH;
    let v1 = (sy + sh) / texH;
    if (flipX) {
      const t = u0;
      u0 = u1;
      u1 = t;
    }
    if (flipY) {
      const t = v0;
      v0 = v1;
      v1 = t;
    }

    const d = this.data;
    let o = this.count * 4 * FLOATS_PER_VERT;
    const x0 = dx;
    const y0 = dy;
    const x1 = dx + dw;
    const y1 = dy + dh;

    // tl, tr, br, bl
    d[o++] = x0; d[o++] = y0; d[o++] = u0; d[o++] = v0; d[o++] = r; d[o++] = g; d[o++] = b; d[o++] = a;
    d[o++] = x1; d[o++] = y0; d[o++] = u1; d[o++] = v0; d[o++] = r; d[o++] = g; d[o++] = b; d[o++] = a;
    d[o++] = x1; d[o++] = y1; d[o++] = u1; d[o++] = v1; d[o++] = r; d[o++] = g; d[o++] = b; d[o++] = a;
    d[o++] = x0; d[o++] = y1; d[o++] = u0; d[o++] = v1; d[o++] = r; d[o++] = g; d[o++] = b; d[o++] = a;

    this.count++;
  }

  /** Where the key light is and what colour it is, this frame.
   *
   *  `dir` is the direction light arrives *from*, in screen space, and does
   *  not need to be normalised. `amount` at zero is a bit-exact fallback to
   *  the unlit look, which is what the HUD and the catch card use — a card
   *  is a piece of paper on the screen, not an object in the world. */
  setLight(
    dx: number, dy: number, dz: number,
    r: number, g: number, b: number, amount: number,
  ): void {
    const len = Math.hypot(dx, dy, dz) || 1;
    this.lx = dx / len;
    this.ly = dy / len;
    this.lz = dz / len;
    this.lr = r; this.lg = g; this.lb = b;
    this.lightAmt = amount;
  }

  setNormalTexture(t: WebGLTexture): void {
    this.norm = t;
  }

  /** The lamps that matter this frame, in world pixels.
   *
   *  Whoever calls this is responsible for handing over the nearest ones —
   *  the shader takes the first eight and does not sort. */
  setLamps(lamps: ReadonlyArray<{
    x: number; y: number; r: number; col: [number, number, number];
  }>): void {
    const n = Math.min(8, lamps.length);
    for (let i = 0; i < n; i++) {
      const l = lamps[i];
      this.lampPos[i * 3] = l.x;
      this.lampPos[i * 3 + 1] = l.y;
      this.lampPos[i * 3 + 2] = Math.max(1, l.r);
      this.lampCol[i * 3] = l.col[0];
      this.lampCol[i * 3 + 1] = l.col[1];
      this.lampCol[i * 3 + 2] = l.col[2];
    }
    this.lampN = n;
  }

  flush(): void {
    if (this.count === 0 || !this.tex) return;
    const gl = this.gl;

    this.shader.use();
    this.shader.v2('u_view', view.w, view.h);
    this.shader.v2('u_cam', this.camX, this.camY);
    this.shader.f('u_flat', this.flat);
    this.shader.i('u_tex', 0);
    this.shader.i('u_norm', 1);
    this.shader.f('u_lightAmt', this.lightAmt);
    this.shader.v3('u_lightDir', this.lx, this.ly, this.lz);
    this.shader.v3('u_lightCol', this.lr, this.lg, this.lb);
    this.shader.i('u_lampN', this.lampN);
    if (this.lampN > 0) {
      this.shader.v3v('u_lampPos', this.lampPos, this.lampN);
      this.shader.v3v('u_lampCol', this.lampCol, this.lampN);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    if (this.norm) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.norm);
      gl.activeTexture(gl.TEXTURE0);
    }

    if (this.blend === Blend.Add) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    } else {
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.count * 4 * FLOATS_PER_VERT);
    gl.drawElements(gl.TRIANGLES, this.count * 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);

    this.drawCalls++;
    this.count = 0;
  }
}
