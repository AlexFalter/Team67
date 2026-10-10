import { Color, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3, type BufferGeometry } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { surfaceTexture, type MapTheme } from "./theme";

/** One row per placed prop, in map coordinates: [x, y, z, yaw, scale, kind]. */
type PropRow = [number, number, number, number, number, string];

/**
 * Street props (lanterns, bins, ...) are instanced: props.glb holds one model per kind
 * (PropModel_<kind>, feet at the origin), props.json places them. Materials G_<Surface> take
 * their pixel texture from the theme, so props restyle with the rest of the map.
 */
export async function loadProps(signal: AbortSignal, theme: MapTheme) {
  const base = `${import.meta.env.BASE_URL}maps/zurich/`;
  const [rowsResponse, modelResponse] = await Promise.all([
    fetch(`${base}props.json`, { signal }),
    fetch(`${base}props.glb`, { signal }),
  ]);
  if (!rowsResponse.ok || !modelResponse.ok) throw new Error("Prop assets missing.");
  const rows = (await rowsResponse.json()) as PropRow[];
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(await modelResponse.arrayBuffer(), "");
  signal.throwIfAborted();

  const parts = new Map<string, { geometry: BufferGeometry; material: string }[]>();
  gltf.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const owner = object.parent?.name.startsWith("PropModel_") ? object.parent.name : object.name;
    const list = parts.get(owner.replace("PropModel_", "")) ?? [];
    list.push({ geometry: object.geometry, material: (object.material as { name: string }).name });
    parts.set(owner.replace("PropModel_", ""), list);
  });

  const materials = new Map<string, MeshStandardMaterial>();
  const materialFor = (name: string) => {
    let material = materials.get(name);
    if (!material) {
      const surface = theme.surfaces[name.replace(/^G_/, "")];
      material = new MeshStandardMaterial({ name, flatShading: true, roughness: name === "G_BinSteel" ? 0.55 : 1,
        metalness: name === "G_BinSteel" ? 0.3 : 0,
        map: surface ? surfaceTexture(name, surface, theme.texture.pixels) : null });
      if (name === "G_LampGlass") { material.emissive = new Color("#ffd98a"); material.emissiveIntensity = 0.35; }
      materials.set(name, material);
    }
    return material;
  };

  const group = new Group();
  group.name = "Props";
  const matrix = new Matrix4(), position = new Vector3(), scale = new Vector3(), rotation = new Quaternion();
  const up = new Vector3(0, 1, 0);
  for (const [kind, primitives] of parts) {
    const placed = rows.filter((row) => row[5] === kind);
    if (!placed.length) continue;
    for (const { geometry, material } of primitives) {
      const mesh = new InstancedMesh(geometry, materialFor(material), placed.length);
      mesh.name = `Props_${kind}_${material}`;
      placed.forEach(([x, y, z, yaw, s], i) => {
        mesh.setMatrixAt(i, matrix.compose(position.set(x, y, z), rotation.setFromAxisAngle(up, yaw), scale.setScalar(s)));
      });
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.raycast = () => {}; // decoration: keep camera/physics raycasts cheap
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  return group;
}
