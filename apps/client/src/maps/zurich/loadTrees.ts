import {
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { surfaceTexture, type MapTheme } from "./theme";

/** One row per tree, in map coordinates: [x, y, z, height, crownRadius, model, colorIndex, yaw, brightness]. */
type TreeRow = [number, number, number, number, number, string, number, number, number?];

/**
 * Trees are instanced: trees.glb holds a few normalised models (height 1, crown radius 1)
 * whose primitives use the materials Tree_Leaves / Tree_Trunk; trees.json places them.
 * Colours come from theme.trees, so palettes change without touching the assets.
 */
export async function loadTrees(signal: AbortSignal, theme: MapTheme) {
  const base = `${import.meta.env.BASE_URL}maps/zurich/`;
  const [rowsResponse, modelResponse] = await Promise.all([
    fetch(`${base}trees.json`, { signal }),
    fetch(`${base}trees.glb`, { signal }),
  ]);
  if (!rowsResponse.ok || !modelResponse.ok) throw new Error("Tree assets missing.");
  const rows = (await rowsResponse.json()) as TreeRow[];
  const gltf = await new GLTFLoader().parseAsync(await modelResponse.arrayBuffer(), "");
  signal.throwIfAborted();

  const parts = new Map<string, { geometry: BufferGeometry; material: string }[]>();
  gltf.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const model = (object.parent?.name.startsWith("TreeModel_") ? object.parent.name : object.name).replace("TreeModel_", "");
    const list = parts.get(model) ?? [];
    list.push({ geometry: object.geometry, material: (object.material as { name: string }).name });
    parts.set(model, list);
  });

  const group = new Group();
  group.name = "Trees";
  // greyscale pixel leaves x per-tree instance colour; trunks use the bark texture as is
  const px = theme.texture.pixels;
  const leaves = new MeshStandardMaterial({ name: "Tree_Leaves", flatShading: true, roughness: 1,
    map: surfaceTexture("Leaves", theme.surfaces.Leaves, px) });
  const trunk = new MeshStandardMaterial({ name: "Tree_Trunk", flatShading: true, roughness: 1,
    map: surfaceTexture("Bark", theme.surfaces.Bark, px) });
  const matrix = new Matrix4(), position = new Vector3(), scale = new Vector3(), rotation = new Quaternion();
  const up = new Vector3(0, 1, 0), color = new Color();
  for (const [model, primitives] of parts) {
    const placed = rows.filter((row) => row[5] === model);
    const palette = model === "Cone" ? theme.trees.conifer : theme.trees.leaves;
    for (const { geometry, material } of primitives) {
      const isTrunk = material === "Tree_Trunk";
      const mesh = new InstancedMesh(geometry, isTrunk ? trunk : leaves, placed.length);
      mesh.name = `Trees_${model}_${isTrunk ? "Trunk" : "Leaves"}`;
      placed.forEach(([x, y, z, height, radius, , colorIndex, yaw, brightness = 1], i) => {
        position.set(x, y, z);
        scale.set(radius, height, radius);
        rotation.setFromAxisAngle(up, yaw);
        mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
        if (!isTrunk) mesh.setColorAt(i, color.set(palette[colorIndex % palette.length]).multiplyScalar(brightness));
      });
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  return group;
}
