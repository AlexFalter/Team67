import { InstancedMesh, Mesh, type BufferGeometry, type Object3D } from "three";
import { acceleratedRaycast, MeshBVH } from "three-mesh-bvh";

/** Index the static map without changing mesh transforms or triangle order. */
export function accelerateMapRaycasts(map: Object3D) {
  const meshes = new Map<Mesh, Mesh["raycast"]>();
  const trees = new Map<BufferGeometry, MeshBVH>();
  const dispose = () => {
    for (const [mesh, raycast] of meshes) mesh.raycast = raycast;
    for (const [geometry, tree] of trees)
      if (geometry.boundsTree === tree) delete geometry.boundsTree;
    meshes.clear(); trees.clear();
  };
  try {
    map.traverse(object => {
      if (!(object instanceof Mesh) || object instanceof InstancedMesh) return; // instanced decoration (trees) is not collidable
      if (!object.geometry.boundsTree) {
        const tree = new MeshBVH(object.geometry, { indirect: true });
        object.geometry.boundsTree = tree;
        trees.set(object.geometry, tree);
      }
      meshes.set(object, object.raycast);
      object.raycast = acceleratedRaycast;
    });
  } catch (error) {
    dispose();
    throw error;
  }
  return dispose;
}
