export async function loadNpcGltf(loader,url,signal){
 const response=await fetch(url,{signal});if(!response.ok)throw Error(`NPC model ${response.status}: ${url}`);
 const data=await response.arrayBuffer();signal?.throwIfAborted();
 return loader.parseAsync(data,url.slice(0,url.lastIndexOf('/')+1));
}
