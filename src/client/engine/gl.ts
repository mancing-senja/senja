/** Thin WebGL2 helpers. No framework — the whole game only needs a
 *  sprite batcher, a couple of fullscreen shader passes, and one
 *  offscreen target it can scale up with nearest filtering. */

export type GL = WebGL2RenderingContext;

export function createContext(canvas: HTMLCanvasElement): GL {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error('WebGL2 tidak tersedia di browser ini.');
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  return gl;
}

function compile(gl: GL, type: number, src: string, label: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader "${label}" gagal compile:\n${log}`);
  }
  return sh;
}

export class Shader {
  readonly program: WebGLProgram;
  private readonly loc = new Map<string, WebGLUniformLocation | null>();

  constructor(private gl: GL, vsSrc: string, fsSrc: string, label = 'shader') {
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc, `${label}.vert`);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, `${label}.frag`);
    const p = gl.createProgram()!;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error(`Program "${label}" gagal link:\n${log}`);
    }
    this.program = p;
  }

  use(): void {
    this.gl.useProgram(this.program);
  }

  private u(name: string): WebGLUniformLocation | null {
    let l = this.loc.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.program, name);
      this.loc.set(name, l);
    }
    return l;
  }

  f(name: string, v: number): void {
    this.gl.uniform1f(this.u(name), v);
  }
  i(name: string, v: number): void {
    this.gl.uniform1i(this.u(name), v);
  }
  v2(name: string, x: number, y: number): void {
    this.gl.uniform2f(this.u(name), x, y);
  }
  v3(name: string, x: number, y: number, z: number): void {
    this.gl.uniform3f(this.u(name), x, y, z);
  }
  /** An array of vec3s. `n` is how many entries are live, so a half-full
   *  buffer never uploads stale slots. */
  v3v(name: string, data: Float32Array, n: number): void {
    this.gl.uniform3fv(this.u(name), data.subarray(0, n * 3));
  }
  v4(name: string, x: number, y: number, z: number, w: number): void {
    this.gl.uniform4f(this.u(name), x, y, z, w);
  }
}

/** Offscreen RGBA target with nearest filtering, used as the pixel canvas.
 *  Resizable, because the internal resolution follows the window. */
export class RenderTarget {
  readonly fbo: WebGLFramebuffer;
  readonly tex: WebGLTexture;
  w: number;
  h: number;

  constructor(private gl: GL, w: number, h: number) {
    this.w = w;
    this.h = h;
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Framebuffer tidak lengkap: 0x${status.toString(16)}`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  bind(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.w, this.h);
  }

  resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
}

/** A single triangle covering the viewport — cheaper and seam-free
 *  compared to two triangles, and it is all the fullscreen passes need. */
export class FullscreenTri {
  private vao: WebGLVertexArrayObject;

  constructor(private gl: GL) {
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  draw(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }
}

export const FS_VERT = `#version 300 es
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export function makeTextureFromCanvas(gl: GL, src: HTMLCanvasElement): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
