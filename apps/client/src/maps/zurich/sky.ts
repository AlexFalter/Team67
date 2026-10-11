import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from "three";
import type { MapTheme } from "./theme";

/**
 * Procedural evening sky dome: zenith-to-horizon gradient, warm glow around the sun, a crisp sun disc and
 * posterised drifting clouds. Detail is snapped to a fine angular grid (`pixel` degrees), so it reads as pixel
 * art next to the textured buildings without looking low-res. Follows the camera; never tone mapped, so the
 * theme colours show exactly. `sunDir` points from the ground towards the sun.
 */
export function createSky(sky: NonNullable<MapTheme["skyDome"]>, sunDir: Vector3) {
  const lin = (hex: string) => new Color(hex); // Color() converts sRGB hex to linear working space
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    uniforms: {
      sunDir: { value: sunDir.clone().normalize() },
      zenith: { value: lin(sky.zenith) },
      upper: { value: lin(sky.upper) },
      horizon: { value: lin(sky.horizon) },
      glow: { value: lin(sky.glow) },
      sunColor: { value: lin(sky.sun) },
      cloudLit: { value: lin(sky.cloudLit) },
      cloudShade: { value: lin(sky.cloudShade) },
      pixel: { value: ((sky.pixel ?? 0.12) * Math.PI) / 180 },
      sunSize: { value: ((sky.sunSize ?? 2.2) * Math.PI) / 180 },
      time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir, zenith, upper, horizon, glow, sunColor, cloudLit, cloudShade;
      uniform float pixel, sunSize, time;
      varying vec3 vDir;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.0), f.x), f.y);
      }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      // 4x4 Bayer dither for soft, pixel-style banding
      float bayer(vec2 c) {
        ivec2 p = ivec2(mod(c, 4.0));
        int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
        return float(m[p.y * 4 + p.x]) / 16.0 - 0.5;
      }

      void main() {
        vec3 dir = normalize(vDir);
        // snap the direction to an angular pixel grid (azimuth x elevation)
        float az = atan(dir.x, -dir.z), el = asin(clamp(dir.y, -1.0, 1.0));
        vec2 cell = floor(vec2(az * cos(el), el) / pixel);
        float elS = (cell.y + 0.5) * pixel;
        vec3 d = normalize(vec3(sin(az) * cos(elS), sin(elS), -cos(az) * cos(elS)));

        float h = max(d.y, 0.0);
        float toSun = dot(d, sunDir);
        // gradient: warm horizon -> upper band -> deep evening blue, plus dither to break up banding
        float t = pow(h, 0.45) + bayer(cell) * 0.035;
        vec3 col = mix(horizon, upper, smoothstep(0.0, 0.35, t));
        col = mix(col, zenith, smoothstep(0.3, 1.0, t));
        // sunset glow hugging the horizon on the sun side
        float g = pow(max(toSun, 0.0), 6.0) * (1.0 - smoothstep(0.0, 0.6, h)) + pow(max(toSun, 0.0), 60.0) * 0.6;
        col = mix(col, glow, clamp(g + bayer(cell) * 0.04, 0.0, 1.0));
        // below the horizon: fade into a hazy horizon tone
        if (dir.y < 0.0) col = mix(horizon, upper * 0.6, smoothstep(0.0, 0.4, -dir.y));

        // clouds: noise on a high plane, posterised into lit / shaded tones, thinning out towards the zenith
        if (d.y > 0.015) {
          vec2 uv = d.xz / (d.y + 0.08) * 1.4 + vec2(time * 0.004, time * 0.0015);
          float n = fbm(uv) - smoothstep(0.1, 0.9, d.y) * 0.35;
          float cover = step(0.56, n + bayer(cell) * 0.03);
          float core = step(0.64, n);
          float lit = clamp(0.5 + 0.5 * toSun, 0.0, 1.0);
          vec3 cloud = mix(cloudShade, mix(cloudShade, cloudLit, lit), 0.35 + 0.65 * core);
          col = mix(col, cloud, cover * smoothstep(0.015, 0.08, d.y));
        }

        // sun disc with a stepped halo
        float ang = acos(clamp(toSun, -1.0, 1.0));
        col = mix(col, mix(glow, sunColor, 0.5), step(ang, sunSize * 1.6) * 0.5);
        col = mix(col, sunColor, step(ang, sunSize));

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new Mesh(new SphereGeometry(1000, 32, 16), material);
  mesh.name = "Sky";
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  // keep the dome centred on whichever camera renders it
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    mesh.position.copy(camera.position);
    mesh.updateMatrixWorld();
    material.uniforms.time.value = performance.now() / 1000;
  };
  return { mesh, dispose: () => { mesh.geometry.dispose(); material.dispose(); } };
}
