/** The single fullscreen pass that paints the sky, the distant hills, and
 *  the lake.
 *
 *  Sky and water share one `skyAt()` function: the water is literally the
 *  sky sampled at a mirrored, wobbling coordinate. That is why the sunset
 *  lands on the lake for free, and why the reflection is always in perfect
 *  agreement with the sky above it. */

import { FS_VERT, FullscreenTri, Shader, type GL } from '../engine/gl';
import type { Lighting } from './lighting';

const FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 o;

uniform vec2  u_view;        // internal resolution in px
uniform vec2  u_cam;         // camera top-left in world px
uniform float u_time;        // seconds
uniform float u_horizon;     // world y of the horizon line

uniform vec3  u_zenith;
uniform vec3  u_mid;
uniform vec3  u_horizonCol;
uniform vec3  u_haze;
uniform vec3  u_sun;
uniform vec2  u_sunDir;      // x: -1 east .. 1 west, y: height
uniform float u_night;
uniform float u_rain;
uniform vec3  u_waterNear;   // local water colour at the near shore

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}

/** Ridgeline height (in px above the horizon) for one hill band. */
float ridge(float x, float freq, float amp, float seed) {
  float n = fbm(vec2(x * freq + seed, seed * 3.7));
  float n2 = fbm(vec2(x * freq * 2.7 + seed * 2.0, seed));
  return amp * (0.55 * n + 0.45 * n2 * n2);
}

/* Where the sun sits horizontally, in screen pixels. */
float sunScreenX() {
  return u_view.x * 0.5 + u_sunDir.x * u_view.x * 0.42;
}

/* Colour of the sky at world column wx, "up" pixels above the horizon. */
vec3 skyAt(float wx, float up) {
  // --- vertical gradient.
  // Everything here is scaled to the ~90px of sky the camera can actually
  // reach. Tuning it for a taller sky puts the whole gradient, the sun and
  // the ridgelines above the top of the screen, where nobody sees them.
  float h = clamp(up / 66.0, 0.0, 1.0);
  vec3 col = mix(u_horizonCol, u_mid, smoothstep(0.0, 0.5, h));
  col = mix(col, u_zenith, smoothstep(0.45, 1.0, h));

  // --- sun / moon, sitting on the same arc.
  // Positioned in screen space: something 150 million km away must not
  // parallax with a camera that moves twenty metres.
  vec2 d = vec2((wx - u_cam.x) - sunScreenX(), up - u_sunDir.y * 54.0);
  float dist = length(d * vec2(1.0, 1.6));
  // Broad atmospheric glow, then the disc itself.
  col += u_sun * exp(-dist * 0.055) * (0.30 - 0.16 * u_night);
  float disc = smoothstep(6.0, 3.5, dist);
  col = mix(col, mix(u_sun, vec3(1.0), 0.5), disc * (1.0 - u_rain * 0.8));

  // --- stars, only once it is actually dark
  if (u_night > 0.02) {
    vec2 sp = floor(vec2(wx * 0.16, up) * 0.7);
    float st = hash21(sp);
    float tw = 0.6 + 0.4 * sin(u_time * 2.0 + st * 40.0);
    float star = step(0.988, st) * tw * smoothstep(5.0, 30.0, up);
    col += vec3(0.85, 0.9, 1.0) * star * u_night * (1.0 - u_rain);
  }

  // --- clouds: two scrolling layers, lit from the sun side
  float cx = wx * 0.030 + u_time * 0.006;
  float cy = up * 0.075;
  float c1 = fbm(vec2(cx, cy * 1.6 - 0.4));
  float c2 = fbm(vec2(cx * 1.9 - 4.0, cy * 2.2 + 2.0));
  float cover = mix(0.63, 0.40, u_rain);
  float cloud = smoothstep(cover, cover + 0.18, c1 * 0.65 + c2 * 0.45);
  cloud *= smoothstep(2.0, 18.0, up);
  // Clouds catch light rather than sitting as grey slabs; the shaded side
  // stays close to the sky it is sitting in.
  vec3 cloudLit = mix(u_haze, mix(u_sun, vec3(1.0), 0.4), 0.62 - 0.35 * u_night);
  vec3 cloudDark = mix(u_haze, u_mid, 0.42);
  float lit = smoothstep(-0.3, 0.6, (c1 - c2) + u_sunDir.x * 0.2);
  col = mix(col, mix(cloudDark, cloudLit, lit), cloud * (0.6 + u_rain * 0.35));

  // --- distant hills. Far band is nearly haze; near band holds its shape.
  float px = wx;
  float r3 = 31.0 + ridge(px * 0.55, 0.004, 17.0, 11.0);
  float r2 = 19.0 + ridge(px * 0.75, 0.006, 13.0, 31.0);
  float r1 = 8.0 + ridge(px * 0.95, 0.011, 8.0, 57.0);

  // Each band is darker and less hazy than the one behind it. The
  // separation between them is what creates the sense of distance.
  // Green, not grey: the far shore is forest. Mixing each band toward the
  // haze colour is what gives aerial perspective, and it also means the
  // hills go orange at dusk and blue at night without extra keyframes.
  vec3 hill3 = mix(u_haze, vec3(0.30, 0.40, 0.45), 0.55);
  vec3 hill2 = mix(u_haze, vec3(0.19, 0.33, 0.30), 0.74 + 0.12 * u_night);
  vec3 hill1 = mix(u_haze, vec3(0.09, 0.21, 0.15), 0.88 + 0.08 * u_night);

  if (up < r3) col = mix(col, hill3, 0.85);
  if (up < r2) col = mix(col, hill2, 0.92);
  if (up < r1) {
    col = mix(col, hill1, 0.95);
    // Ragged treeline crown on the nearest ridge.
    float tree = vnoise(vec2(px * 0.5, 0.0));
    float crown = r1 - 1.0 - tree * 1.8;
    if (up > crown - 2.0 && up < r1) col = mix(col, hill1 * 0.8, 0.6);
  }

  // --- haze stacking up against the horizon
  col = mix(col, u_haze, smoothstep(9.0, 0.0, up) * 0.42);
  return col;
}

void main() {
  float sy = (1.0 - v_uv.y) * u_view.y;
  float wx = u_cam.x + v_uv.x * u_view.x;
  float wy = u_cam.y + sy;
  float up = u_horizon - wy;

  vec3 col;

  if (up > 0.0) {
    col = skyAt(wx, up);
  } else {
    float depth = -up;                      // px below the horizon

    // Reflection: the sky, mirrored and squashed, with the surface chop
    // displacing the sample. Chop grows as the water comes toward us.
    float chop = 1.0 + depth * 0.035;
    float w = sin(depth * 0.26 - u_time * 1.1 + wx * 0.045) * 0.6
            + sin(depth * 0.09 + u_time * 0.7 - wx * 0.018) * 0.4;
    float refUp = depth * 0.38 + w * chop * 1.0;
    col = skyAt(wx + w * chop * 2.4, max(refUp, 0.0));

    // The nearer the water, the less it mirrors and the more it shows
    // its own colour and depth.
    // Near water keeps its own cool colour instead of becoming a mirror,
    // which is what stops a sunset from turning the whole lake orange.
    float near = smoothstep(4.0, 110.0, depth);
    float wash = fbm(vec2(wx * 0.012, depth * 0.018 + u_time * 0.015));
    col = mix(col, u_waterNear * (0.82 + wash * 0.42), near * 0.85);
    col *= mix(1.0, 0.94, near);

    // Horizontal wave bands. Kept sparse — dense chop reads as noise at
    // this resolution and ruins the calm.
    float band = sin(depth * 0.30 - u_time * 0.8 + fbm(vec2(wx * 0.02, depth * 0.008)) * 5.0);
    float crest = smoothstep(0.86, 1.0, band) * (0.16 + near * 0.34);
    col += vec3(0.08, 0.13, 0.15) * crest;

    // Haze piling up on the water right at the horizon. Without this the
    // waterline is a hard seam and the distance stops reading.
    col = mix(col, u_haze, smoothstep(10.0, 0.0, depth) * 0.3);

    // A specular path under the sun — the single thing that sells "lake".
    // Sparkles live on a coarse cell grid and only a few percent are lit at
    // any moment: per-pixel glinting turns the whole surface into static.
    float lane = exp(-abs((wx - u_cam.x) - sunScreenX()) * 0.032);
    vec2 cell = floor(vec2(wx, depth * 0.7));
    float r = hash21(cell);
    float twinkle = step(0.992, fract(r + u_time * 0.5));
    col += u_sun * twinkle * lane * (0.6 - u_night * 0.3) * (1.0 - u_rain * 0.85);

    // Rain stipples the surface flat.
    col = mix(col, u_waterNear * 0.85, u_rain * 0.35);
  }

  o = vec4(col, 1.0);
}`;

export class SkyWater {
  private shader: Shader;
  private tri: FullscreenTri;

  constructor(private gl: GL) {
    this.shader = new Shader(gl, FS_VERT, FRAG, 'skywater');
    this.tri = new FullscreenTri(gl);
  }

  draw(
    viewW: number, viewH: number,
    camX: number, camY: number,
    time: number, horizonY: number,
    L: Lighting, rain: number,
    waterNear: [number, number, number],
  ): void {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    this.shader.use();
    this.shader.v2('u_view', viewW, viewH);
    this.shader.v2('u_cam', camX, camY);
    this.shader.f('u_time', time);
    this.shader.f('u_horizon', horizonY);
    this.shader.v3('u_zenith', ...L.skyZenith);
    this.shader.v3('u_mid', ...L.skyMid);
    this.shader.v3('u_horizonCol', ...L.skyHorizon);
    this.shader.v3('u_haze', ...L.haze);
    this.shader.v3('u_sun', ...L.sunColor);
    this.shader.v2('u_sunDir', L.sunX, L.sunY);
    this.shader.f('u_night', L.night);
    this.shader.f('u_rain', rain);
    this.shader.v3('u_waterNear', ...waterNear);
    this.tri.draw();
    gl.enable(gl.BLEND);
  }
}
