// One UI instance per local player. Acquisition order never lives in a module global.
export function createItemInventory({uiRoot=document.body,id='inventory-tray'}={}){
 let acquisition=0,disposed=false;
 const tray=document.createElement('aside');tray.id=id;tray.hidden=true;tray.setAttribute('aria-label','Inventory · 3 slots');tray.innerHTML='<small>INVENTORY · 3 SLOTS</small><div class="inventory-slots"><div class="inventory-slot" data-slot="mate"><span class="empty-slot">1 · EMPTY</span></div><div class="inventory-slot" data-slot="ticket"><span class="empty-slot">2 · EMPTY</span></div><div class="inventory-slot" data-slot="spare"><span class="empty-slot">3 · EMPTY</span></div></div>';uiRoot.append(tray);
 function slot(kind){if(disposed)throw Error('Inventory UI is disposed');const node=tray.querySelector(`[data-slot="${kind}"]`);if(!node)throw Error(`Unknown inventory slot: ${kind}`);return node;}
 return {slot,get disposed(){return disposed;},
  show(visible){tray.hidden=!visible||!tray.querySelector('.inventory-slot > aside:not([hidden])');},
  setItem(kind,present){
   const node=slot(kind),wasPresent=node.dataset.occupied==='true';
   if(node.dataset.occupied!==undefined&&wasPresent===!!present)return;
   if(present&&!wasPresent)node.dataset.acquired=String(++acquisition);
   node.dataset.occupied=String(!!present);
   const row=node.parentElement,slots=[...row.children];
   slots.sort((a,b)=>Number(b.dataset.occupied==='true')-Number(a.dataset.occupied==='true')||(a.dataset.occupied==='true'?Number(a.dataset.acquired)-Number(b.dataset.acquired):0));
   slots.forEach((item,index)=>{if(row.children[index]!==item)row.insertBefore(item,row.children[index]??null);item.querySelector('.empty-slot').textContent=`${index+1} · EMPTY`;});
  },
  dispose(){if(disposed)return;disposed=true;tray.remove();}
 };
}
// Legacy single-player callers share a UI for this document. Hosts can inject
// independent instances instead; no player state is stored in this cache.
const defaults=new WeakMap();
export function defaultItemInventory(){const root=document.body;let inventory=defaults.get(root);if(!inventory||inventory.disposed){inventory=createItemInventory({uiRoot:root});defaults.set(root,inventory);}return inventory;}
export const inventorySlot=kind=>defaultItemInventory().slot(kind);
export const showInventory=visible=>defaultItemInventory().show(visible);
export const setInventoryItem=(kind,present)=>defaultItemInventory().setItem(kind,present);
