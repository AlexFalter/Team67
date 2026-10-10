// Cleanup is instance-owned and idempotent. Shared assets stay with their host.
export function createFeatureLifecycle(){
 const controller=new AbortController(),cleanups=[];let disposed=false;
 return {get disposed(){return disposed;},
  listen(target,type,listener,options={}){if(disposed)throw Error('Feature is disposed');target?.addEventListener(type,listener,{...options,signal:controller.signal});return listener;},
  own(cleanup){if(disposed)cleanup();else cleanups.push(cleanup);},
  dispose(){if(disposed)return;disposed=true;controller.abort();let firstError;for(const cleanup of cleanups.reverse())try{cleanup();}catch(error){firstError??=error;}cleanups.length=0;if(firstError)throw firstError;}
 };
}
// Use only for a graph whose geometry/material/texture resources belong to you.
export function disposeOwnedObject(root){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 root.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of node.material?(Array.isArray(node.material)?node.material:[node.material]):[]){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
 root.removeFromParent();textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());
}
