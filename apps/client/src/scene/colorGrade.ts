import { Camera, HalfFloatType, Scene, Vector3, WebGLRenderTarget, type WebGLRenderer } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/** Display-referred colour grade, applied after tone mapping (like a grading layer on the final image). */
export interface ColorGrade {
  exposure: number;    // tone-mapping exposure (renderer.toneMappingExposure)
  temperature: number; // -1 cool .. +1 warm (white balance)
  tint: number;        // -1 green .. +1 magenta
  saturation: number;  // 1 = unchanged
  vibrance: number;    // boosts dull colours more than already saturated ones
  contrast: number;    // 1 = unchanged, around mid grey
  brightness: number;  // added offset
  gamma: number;       // 1 = unchanged; > 1 brightens mid tones
  lift: number;        // raises the blacks (0..0.2)
  shadowTint: string;  // colour toning of the shadows (#808080 = neutral)
  highlightTint: string; // colour toning of the highlights (#808080 = neutral)
}
export const NEUTRAL_GRADE: ColorGrade = {
  exposure: 1.1, temperature: 0, tint: 0, saturation: 1, vibrance: 0, contrast: 1, brightness: 0, gamma: 1, lift: 0,
  shadowTint: "#808080", highlightTint: "#808080",
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    temperature: { value: 0 }, tint: { value: 0 }, saturation: { value: 1 }, vibrance: { value: 0 },
    contrast: { value: 1 }, brightness: { value: 0 }, gamma: { value: 1 }, lift: { value: 0 },
    shadowTint: { value: new Vector3(0.5, 0.5, 0.5) }, highlightTint: { value: new Vector3(0.5, 0.5, 0.5) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float temperature, tint, saturation, vibrance, contrast, brightness, gamma, lift;
    uniform vec3 shadowTint, highlightTint;
    varying vec2 vUv;
    const vec3 W = vec3(0.2126, 0.7152, 0.0722);
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;
      c *= vec3(1.0 + 0.10 * temperature, 1.0 - 0.06 * tint, 1.0 - 0.10 * temperature);   // white balance
      c += brightness;
      c = (c - 0.5) * contrast + 0.5;
      float l = dot(c, W);
      c = mix(vec3(l), c, saturation);
      float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
      c = mix(vec3(l), c, 1.0 + vibrance * (1.0 - clamp(mx - mn, 0.0, 1.0)));             // vibrance
      l = clamp(dot(c, W), 0.0, 1.0);
      c += (shadowTint - 0.5) * 0.5 * (1.0 - l) + (highlightTint - 0.5) * 0.5 * l;         // split toning
      c = c + lift * (1.0 - c);
      c = pow(max(c, 0.0), vec3(1.0 / gamma));
      gl_FragColor = vec4(c, src.a);
    }`,
};

const hex = (h: string) => {
  const n = parseInt(h.replace("#", ""), 16);
  return new Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** Scene -> (4x MSAA) -> tone mapping + sRGB (OutputPass) -> grade. Call render() instead of renderer.render. */
export function createColorGrade(renderer: WebGLRenderer, scene: Scene, camera: Camera, initial: Partial<ColorGrade> = {}) {
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());
  const pass = new ShaderPass(GradeShader);
  composer.addPass(pass);
  const grade: ColorGrade = { ...NEUTRAL_GRADE, ...initial };
  const apply = () => {
    const u = pass.uniforms;
    renderer.toneMappingExposure = grade.exposure;
    for (const k of ["temperature", "tint", "saturation", "vibrance", "contrast", "brightness", "gamma", "lift"] as const) u[k].value = grade[k];
    u.shadowTint.value = hex(grade.shadowTint); u.highlightTint.value = hex(grade.highlightTint);
  };
  apply();
  return {
    grade,
    set(next: Partial<ColorGrade>) { Object.assign(grade, next); apply(); },
    render() { composer.render(); },
    setSize(width: number, height: number, density: number) { composer.setPixelRatio(density); composer.setSize(width, height); },
    dispose() { composer.dispose(); target.dispose(); pass.material.dispose(); },
  };
}
export type ColorGradeHandle = ReturnType<typeof createColorGrade>;

/**
 * Dev overlay (open with ?grade): sliders for the grade, autosaved in this browser, "Download JSON"
 * for the theme ("grade" section). Plain DOM, no React state; returns a dispose function.
 */
export function mountGradePanel(handle: ColorGradeHandle) {
  const KEY = "zurich-color-grade", initial = { ...handle.grade };  // theme values: what Reset returns to
  try { const saved = localStorage.getItem(KEY); if (saved) handle.set(JSON.parse(saved)); } catch { /* private mode */ }
  const panel = document.createElement("div");
  panel.style.cssText = "position:fixed;top:12px;right:12px;z-index:1000;width:260px;padding:10px 12px;border-radius:8px;" +
    "background:rgba(20,22,26,.9);color:#eee;font:12px system-ui,sans-serif;display:none";
  const sliders: [keyof ColorGrade, string, number, number, number][] = [
    ["exposure", "Exposure", 0.5, 2, 0.01], ["temperature", "Warmth", -1, 1, 0.01], ["tint", "Tint (green/magenta)", -1, 1, 0.01],
    ["saturation", "Saturation", 0, 2, 0.01], ["vibrance", "Vibrance", -1, 2, 0.01], ["contrast", "Contrast", 0.5, 1.5, 0.01],
    ["brightness", "Brightness", -0.2, 0.2, 0.005], ["gamma", "Gamma", 0.6, 1.6, 0.01], ["lift", "Lift (blacks)", 0, 0.2, 0.005],
  ];
  const rows: HTMLElement[] = [];
  const title = document.createElement("div"); title.textContent = "Colour grade"; title.style.cssText = "font-weight:600;margin-bottom:6px";
  panel.append(title);
  const refresh: (() => void)[] = [];
  for (const [key, label, min, max, step] of sliders) {
    const row = document.createElement("label"); row.style.cssText = "display:block;margin:4px 0";
    const text = document.createElement("span"); const input = document.createElement("input");
    Object.assign(input, { type: "range", min, max, step }); input.style.width = "100%";
    const show = () => { input.value = String(handle.grade[key]); text.textContent = `${label}: ${(handle.grade[key] as number).toFixed(2)}`; };
    input.oninput = () => { handle.set({ [key]: +input.value }); show(); save(); };
    show(); refresh.push(show); row.append(text, input); rows.push(row); panel.append(row);
  }
  for (const [key, label] of [["shadowTint", "Shadow colour"], ["highlightTint", "Highlight colour"]] as const) {
    const row = document.createElement("label"); row.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin:4px 0";
    const input = document.createElement("input"); input.type = "color";
    const show = () => { input.value = handle.grade[key]; };
    input.oninput = () => { handle.set({ [key]: input.value }); save(); };
    show(); refresh.push(show); row.append(label, input); panel.append(row);
  }
  const buttons = document.createElement("div"); buttons.style.cssText = "display:flex;gap:6px;margin-top:8px";
  const button = (text: string, onClick: () => void) => {
    const b = document.createElement("button"); b.textContent = text; b.onclick = onClick;
    b.style.cssText = "flex:1;padding:4px;border-radius:4px;border:1px solid #555;background:#333;color:#eee;cursor:pointer";
    buttons.append(b);
  };
  button("Download JSON", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ grade: handle.grade }, null, 2)], { type: "application/json" }));
    a.download = "color-grade.json"; a.click();
  });
  button("Reset", () => { handle.set(initial); refresh.forEach((f) => f()); try { localStorage.removeItem(KEY); } catch { /* private mode */ } });
  panel.append(buttons);
  function save() { try { localStorage.setItem(KEY, JSON.stringify(handle.grade)); } catch { /* private mode */ } }
  document.body.append(panel);
  const toggle = () => { panel.style.display = panel.style.display === "none" ? "block" : "none"; };
  if (new URLSearchParams(location.search).has("grade")) toggle();
  return () => panel.remove();
}
