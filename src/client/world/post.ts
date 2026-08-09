/** Final pass: scales the 320x180 buffer up to the window with nearest
 *  filtering, and adds the touches that are cheaper in screen space than
 *  in the scene — bloom around light sources, a vignette, and a warm/cool
 *  grade that follows the time of day. */

import { FS_VERT, FullscreenTri, Shader, type GL } from '../engine/gl';

const FRAG = `#version 300 es
precision mediump float;

in vec2 v_uv;
out vec4 o;

uniform sampler2D u_tex;
uniform vec2  u_size;     // internal resolution
uniform float u_bloom;
uniform float u_vignette;
uniform vec3  u_grade;    // per-channel multiplier
uniform float u_night;
uniform float u_flash;    // white flash, used on a catch

vec3 sampleAt(vec2 uv) {
  return texture(u_tex, uv).rgb;
}

void main() {
  vec2 texel = 1.0 / u_size;
  vec3 base = sampleAt(v_uv);

  // --- bloom: a wide, cheap tap pattern, keeping only what is already bright
  vec3 sum = vec3(0.0);
  const int TAPS = 8;
  for (int i = 0; i < TAPS; i++) {
    float a = (float(i) / float(TAPS)) * 6.2831853;
    vec2 off = vec2(cos(a), sin(a));
    sum += sampleAt(v_uv + off * texel * 2.0);
    sum += sampleAt(v_uv + off * texel * 4.5);
  }
  sum /= float(TAPS * 2);
  float lum = dot(sum, vec3(0.299, 0.587, 0.114));
  vec3 bright = sum * smoothstep(0.55, 0.95, lum);
  vec3 col = base + bright * u_bloom;

  // --- grade, gently pushed toward the ambient tint
  col *= u_grade;

  // --- night lifts the shadows toward blue instead of crushing to black
  col = mix(col, col * vec3(0.72, 0.80, 1.05) + vec3(0.02, 0.03, 0.06), u_night * 0.55);

  // --- vignette
  vec2 d = v_uv - 0.5;
  float vig = 1.0 - dot(d, d) * u_vignette;
  col *= vig;

  col += u_flash;

  o = vec4(col, 1.0);
}`;

export class Post {
  private shader: Shader;
  private tri: FullscreenTri;

  constructor(private gl: GL) {
    this.shader = new Shader(gl, FS_VERT, FRAG, 'post');
    this.tri = new FullscreenTri(gl);
  }

  draw(
    tex: WebGLTexture, w: number, h: number,
    bloom: number, vignette: number,
    grade: [number, number, number], night: number, flash: number,
  ): void {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    this.shader.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    this.shader.i('u_tex', 0);
    this.shader.v2('u_size', w, h);
    this.shader.f('u_bloom', bloom);
    this.shader.f('u_vignette', vignette);
    this.shader.v3('u_grade', ...grade);
    this.shader.f('u_night', night);
    this.shader.f('u_flash', flash);
    this.tri.draw();
    gl.enable(gl.BLEND);
  }
}
