import {
  AgXToneMapping,
  DirectionalLight,
  PMREMGenerator,
  Scene,
  BufferAttribute,
  CanvasTexture,
  Color,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Material,
  type Object3D,
  type WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import summer from "./themes/summer.json";
import autumn from "./themes/autumn.json";

/** Every visual knob of the map lives in themes/*.json; this module only interprets it. */
export interface SurfaceStyle {
  palette: string[];
  pattern: "noise" | "tiles" | "rails" | "water" | "window" | "shopfront" | "rooftiles" | "timber" | "text" | "leaves" | "bark" | "flag_ch" | "flag_zh";
  weights?: number[];
  tile?: [number, number];
  stagger?: number;
  shutters?: boolean;
  flowers?: boolean;
  /** pattern "text": the sign text (A-Z, 3x5 pixel font) and texture size in pixels */
  text?: string;
  size?: [number, number];
}

const FONT: Record<string, string[]> = {"A": ["010", "101", "111", "101", "101"], "B": ["110", "101", "110", "101", "110"], "C": ["011", "100", "100", "100", "011"], "D": ["110", "101", "101", "101", "110"], "E": ["111", "100", "110", "100", "111"], "F": ["111", "100", "110", "100", "100"], "G": ["011", "100", "101", "101", "011"], "H": ["101", "101", "111", "101", "101"], "I": ["111", "010", "010", "010", "111"], "J": ["001", "001", "001", "101", "010"], "K": ["101", "101", "110", "101", "101"], "L": ["100", "100", "100", "100", "111"], "M": ["101", "111", "111", "101", "101"], "N": ["110", "101", "101", "101", "101"], "O": ["010", "101", "101", "101", "010"], "P": ["110", "101", "110", "100", "100"], "Q": ["010", "101", "101", "110", "011"], "R": ["110", "101", "110", "101", "101"], "S": ["011", "100", "010", "001", "110"], "T": ["111", "010", "010", "010", "010"], "U": ["101", "101", "101", "101", "111"], "V": ["101", "101", "101", "101", "010"], "W": ["101", "101", "111", "111", "101"], "X": ["101", "101", "010", "101", "101"], "Y": ["101", "101", "010", "010", "010"], "Z": ["111", "001", "010", "100", "111"], " ": ["000", "000", "000", "000", "000"], "-": ["000", "000", "111", "000", "000"], "c": ["000", "011", "100", "100", "011"], "o": ["000", "010", "101", "101", "010"], "p": ["000", "110", "101", "110", "100"]};

/** Deterministic 32-bit hash, identical in ground_materials.py. */
function phash(a: number, b: number, salt = 0) {
  return (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(salt, 83492791)) >>> 0;
}

function textMask(text: string, w: number, h: number) {
  const on = new Set<number>();
  const x0 = (w - (text.length * 4 - 1)) >> 1, y0 = (h - 5) >> 1;
  [...text].forEach((ch, i) =>
    (FONT[ch] ?? FONT[ch.toUpperCase()] ?? FONT[" "]).forEach((row, r) =>
      [...row].forEach((bit, c) => { if (bit === "1") on.add((y0 + r) * w + x0 + i * 4 + c); })));
  return on;
}
export interface MapTheme {
  texture: { pixels: number; tileMeters: number };
  sky: string;
  /** Procedural sky dome (sky.ts); without it the background is the flat `sky` colour. Angles in degrees. */
  skyDome?: {
    zenith: string; upper: string; horizon: string; glow: string; sun: string;
    cloudLit: string; cloudShade: string; pixel?: number; sunSize?: number;
  };
  surfaces: Record<string, SurfaceStyle>;
  trees: { leaves: string[]; conifer: string[]; trunk: string[] };
  lighting: {
    sun: string; sunIntensity: number; sunElevation: number; sunAzimuth: number;
    skyLight: string; groundLight: string; hemiIntensity: number;
    /** AgX tone mapping exposure (Blender's default view transform); 1 = neutral */
    exposure?: number;
    /** neutral studio ambient (image-based, like Blender's material preview); 0 = off */
    environment?: number;
  };
  buildings: {
    walls: Record<BuildingCategory, string[]>;
    roofs: { pitched: string[]; flat: string[]; spire: string[] };
  };
}

/** Order matches the `Style` UV layer written by assets-src/zurich/blender/build_buildings.py. */
export const BUILDING_CATEGORIES = ["residential", "office", "commercial", "other", "structure", "landmark"] as const;
export type BuildingCategory = (typeof BUILDING_CATEGORIES)[number];
/** Building materials whose greyscale texture is multiplied by a per-building colour. */
const TINTED: Record<string, (theme: MapTheme, category: BuildingCategory) => string[]> = {
  G_Wall: (t, c) => t.buildings.walls[c],
  G_WallShutters: (t, c) => t.buildings.walls[c],
  G_RoofSpire: (t) => t.buildings.roofs.spire,
  G_WallGround: (t, c) => t.buildings.walls[c],
  G_Plain: (t, c) => t.buildings.walls[c],
  G_Roof: (t) => t.buildings.roofs.pitched,
  G_RoofFlat: (t) => t.buildings.roofs.flat,
};

type ThemeFile = Partial<MapTheme> & { extends?: string };
const themes = { summer, autumn } as unknown as Record<string, ThemeFile>;

export function resolveTheme(name: string): MapTheme {
  const file = structuredClone(themes[name] ?? themes.summer);
  if (!file.extends) return file as MapTheme;
  const base = resolveTheme(file.extends) as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(file)) {
    const current = base[key];
    base[key] =
      value && typeof value === "object" && !Array.isArray(value) && current && typeof current === "object"
        ? { ...current, ...value }
        : value;
  }
  return base as unknown as MapTheme;
}

/** `?theme=summer` picks a theme; default is autumn. */
export const DEFAULT_THEME = "autumn";
export function activeTheme(): MapTheme {
  return resolveTheme(new URLSearchParams(window.location.search).get("theme") ?? DEFAULT_THEME);
}

// Small deterministic RNG so textures look identical on every client.
function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function patternIndex(style: SurfaceStyle, n: number, x: number, y: number, random: () => number, mask?: Set<number>) {
  const weights = style.weights ?? style.palette.map(() => 1);
  const pick = () => {
    let r = random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) <= 0) return i;
    return 0;
  };
  switch (style.pattern) {
    case "noise":
      return pick();
    case "tiles": {
      const [w, h] = style.tile ?? [8, 8];
      const xs = (x + (Math.floor(y / h) % 2) * (style.stagger ?? 0)) % n;
      return y % h === 0 || xs % w === 0 ? 0 : pick();
    }
    case "rails":
      if (x % 16 === 5 || x % 16 === 11) return 3;
      if (y % 4 === 0 && x % 16 >= 3 && x % 16 <= 13) return 2;
      return random() < 0.7 ? 0 : 1;
    case "water":
      if ((y % 8 === 3 && (x + y * 3) % 16 < 4) || (y % 8 === 7 && (x + 8 + y * 3) % 16 < 3)) return 2;
      return random() < 0.85 ? 0 : 1;
    case "window": {
      // one facade cell = one window on one floor; y = 0 is the top row
      const [x0, x1, y0, y1] = [(n * 4) >> 4, (n * 12) >> 4, (n * 3) >> 4, (n * 13) >> 4];
      if (x >= x0 && x < x1 && y >= y0 && y < y1) {
        if (x === x0 || x === x1 - 1 || y === y0 || y === y1 - 1 || x === (x0 + x1) >> 1) return 1;
        return x - x0 === y - y0 && x - x0 < 3 ? 3 : 2;
      }
      if (y === y1 && x >= x0 - 1 && x <= x1)
        return style.flowers && x >= x0 && x < x1 && x % 2 === 0 ? 7 : 4; // sill / flower box
      if (style.shutters && y >= y0 && y < y1 && ((x >= x0 - 3 && x < x0) || (x >= x1 && x < x1 + 3)))
        return y % 3 ? 6 : 1; // louvred shutters
      if (y === 0) return 4; // cornice line between floors
      return (x + y) % 2 === 0 && random() < 0.18 ? 5 : 0; // plaster dither
    }
    case "shopfront": {
      // ground floor: sign band, big glazing with mullions, dark plinth
      if (y < (n * 2) >> 4) return (x >> 1) % 2 ? 5 : 1; // striped awning
      if (y >= (n * 14) >> 4) return 6;
      const [x0, x1, y0] = [n >> 4, (n * 15) >> 4, (n * 3) >> 4];
      if (x >= x0 && x < x1 && y >= y0) {
        if (x === x0 || x === x1 - 1 || y === y0 || x === n >> 1) return 1;
        return x - x0 === y - y0 && x - x0 < 3 ? 3 : 2;
      }
      return y === y0 - 1 ? 4 : 0;
    }
    case "text":
      return mask?.has(y * (style.size?.[0] ?? n) + x) ? 1 : 0;
    case "flag_ch": { // white cross on red (palette 0 red, 1 white)
      const w = style.size?.[0] ?? n, h = style.size?.[1] ?? n;
      const cx = Math.abs(x + 0.5 - w / 2), cy = Math.abs(y + 0.5 - h / 2), arm = w * 0.31, half = w * 0.1;
      return (cx < half && cy < arm) || (cy < half && cx < arm) ? 1 : 0;
    }
    case "flag_zh": // diagonal: white upper-right, blue lower-left (palette 0 blue, 1 white)
      return x >= y ? 1 : 0;
    case "timber": {
      // half-timbering: frame + X brace per panel, plaster dither
      const m = n - 1;
      if (x === 0 || x === m || y === 0 || y === m || x === y || x + y === m) return 1;
      return random() < 0.12 ? 2 : 0;
    }
    case "leaves": {
      // chunky 2x2 leaf clusters: light, shade, deep shade, highlight
      const r = phash(x >> 1, y >> 1) % 100;
      return r < 14 ? 1 : r < 34 ? 2 : r < 42 ? 3 : r < 50 ? 4 : 0;
    }
    case "bark":
      // vertical furrows, a few knots, light streaks
      if (phash(Math.floor(x / 3), Math.floor(y / 3), 7) % 100 < 4) return 3;
      if ((x + ((y >> 2) & 1)) % 4 === 0) return 1;
      if (x % 4 === 2 && phash(x, y >> 1, 3) % 3 === 0) return 2;
      return phash(x, y, 5) % 100 < 15 ? 4 : 0;
    case "rooftiles":
      if (y % 4 === 3) return 2;
      if ((x + (y >> 2) * 2) % 4 === 0) return 1;
      return random() < 0.08 ? 3 : 0;
  }
}

export function surfaceTexture(name: string, style: SurfaceStyle, pixels: number) {
  const [w, h] = style.size ?? [pixels, pixels];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(w, h);
  const palette = style.palette.map((hex) => new Color(hex));
  const random = rng(name);
  const mask = style.pattern === "text" ? textMask(style.text ?? "", w, h) : undefined;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = palette[patternIndex(style, pixels, x, y, random, mask)] ?? palette[0];
      const i = (y * w + x) * 4;
      image.data.set([c.r * 255, c.g * 255, c.b * 255, 255], i);
    }
  context.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.flipY = false; // glTF UVs: row 0 of the canvas is v = 0 (otherwise signs/windows render upside down)
  texture.colorSpace = SRGBColorSpace;
  // Text signs use the authored glTF UV orientation, unlike repeating ground patterns.
  if (style.pattern === "text") texture.flipY = false;
  texture.magFilter = NearestFilter;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

/**
 * Restyle map materials by name: `G_<Surface>` gets the themed pixel texture.
 * The GLB carries UVs (1 unit = tileMeters) and material names only, so a theme
 * change never needs a re-export.
 */
export function applyTheme(root: Object3D, theme: MapTheme) {
  const replaced = new Map<Material, Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const name = (Array.isArray(object.material) ? object.material[0] : object.material).name;
    if (TINTED[name]) tintBuildings(object, TINTED[name], theme);
    const restyle = (material: Material) => {
      const surface = material.name.startsWith("G_") ? theme.surfaces[material.name.slice(2)] : undefined;
      if (!surface) return material;
      let next = replaced.get(material);
      if (!next) {
        next = new MeshStandardMaterial({
          name: material.name,
          map: surfaceTexture(material.name, surface, theme.texture.pixels),
          roughness: material.name === "G_Water" ? 0.6 : 1,
          metalness: 0,
          vertexColors: material.name in TINTED,
        });
        replaced.set(material, next);
        material.dispose();
      }
      return next;
    };
    object.material = Array.isArray(object.material) ? object.material.map(restyle) : restyle(object.material);
  });
}

/** Per-building colour from the `Style` UV layer (x = category index, y = seed) and the theme palettes. */
function tintBuildings(mesh: Mesh, palette: (typeof TINTED)[string], theme: MapTheme) {
  const style = mesh.geometry.getAttribute("uv1");
  if (!style) return;
  const colors = new Float32Array(style.count * 3);
  const color = new Color();
  for (let i = 0; i < style.count; i++) {
    const category = BUILDING_CATEGORIES[Math.round(style.getX(i))] ?? "other";
    const swatches = palette(theme, category);
    // glTF stores V flipped (v' = 1 - v); undo it to get Blender's seed back
    const seed = Math.round(1 - style.getY(i));
    color.set(swatches[((seed % swatches.length) + swatches.length) % swatches.length]);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  mesh.geometry.setAttribute("color", new BufferAttribute(colors, 3));
}

/**
 * Renderer look matching the Blender preview (blender/scene_light.py): AgX tone mapping (Blender's view
 * transform) and the world as an environment of one uniform colour, theme skyLight at strength
 * hemiIntensity * 0.55 - like Blender's world it lights diffuse surfaces (albedo * strength) and shows up
 * in reflections (water). Optional extra neutral studio fill: lighting.environment. Returns dispose.
 */
export function applyRendererLook(renderer: WebGLRenderer, scene: Scene, theme: MapTheme) {
  const l = theme.lighting;
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = l.exposure ?? 1;
  const pmrem = new PMREMGenerator(renderer);
  const world = new Scene();
  world.background = new Color(l.skyLight).multiplyScalar(l.hemiIntensity * 0.55);
  let target = pmrem.fromScene(world, 0);
  if (l.environment) {  // optional neutral studio light on top (0 = off, like Blender)
    const room = new RoomEnvironment();
    target.dispose(); target = pmrem.fromScene(room, 0.04);
    room.traverse((o) => { if (o instanceof Mesh) { o.geometry.dispose(); (o.material as Material).dispose(); } });
  }
  pmrem.dispose();
  scene.environment = target.texture;
  scene.environmentIntensity = 1;
  return () => { if (scene.environment === target.texture) scene.environment = null; target.dispose(); };
}

/** The sun lamp of the Blender preview (blender/scene_light.py): strength sunIntensity * 1.6 W/m². Blender's
 * diffuse is albedo * E / π while three.js folds the π into punctual lights, so the same strength is π× too bright
 * here (AgX then washes the colours out) - divide it back. Position it from theme sunElevation / sunAzimuth.
 * The world light comes from applyRendererLook. */
export function themeLights(theme: MapTheme) {
  return { sun: new DirectionalLight(theme.lighting.sun, (theme.lighting.sunIntensity * 1.6) / Math.PI) };
}
