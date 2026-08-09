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
void main(){
  vec2 p = a_pos - u_cam;
  vec2 clip = vec2(p.x / u_view.x * 2.0 - 1.0, 1.0 - p.y / u_view.y * 2.0);
  v_uv = a_uv;
  v_col = a_col;
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec4 v_col;
uniform sampler2D u_tex;
/** 0 = normal tint (multiply), 1 = flat fill keeping source alpha.
 *  The flat mode draws silhouettes: shadows, water reflections, flash. */
uniform float u_flat;
out vec4 o;
void main(){
  vec4 t = texture(u_tex, v_uv);
  if (t.a < 0.004) discard;
  vec3 rgb = mix(t.rgb * v_col.rgb, v_col.rgb, u_flat);
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

  flush(): void {
    if (this.count === 0 || !this.tex) return;
    const gl = this.gl;

    this.shader.use();
    this.shader.v2('u_view', view.w, view.h);
    this.shader.v2('u_cam', this.camX, this.camY);
    this.shader.f('u_flat', this.flat);
    this.shader.i('u_tex', 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);

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
