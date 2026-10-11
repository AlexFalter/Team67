/** Stop repeated frame failures; report the original error exactly once. */
export function guardAnimationFrame(frame:()=>void,onError:(error:unknown)=>void){
 let failed=false;
 return ()=>{if(failed)return;try{frame();}catch(error){failed=true;onError(error);}};
}
