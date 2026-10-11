// Three shared item slots, filled in acquisition order.
let acquisition=0;
export function inventorySlot(kind){
 let tray=document.querySelector('#inventory-tray');
 if(!tray){tray=document.createElement('aside');tray.id='inventory-tray';tray.hidden=true;tray.setAttribute('aria-label','Inventory · 3 slots');tray.innerHTML='<small>INVENTORY · 3 SLOTS</small><div class="inventory-slots"><div class="inventory-slot" data-slot="mate"><span class="empty-slot">1 · EMPTY</span></div><div class="inventory-slot" data-slot="ticket"><span class="empty-slot">2 · EMPTY</span></div><div class="inventory-slot" data-slot="spare"><span class="empty-slot">3 · EMPTY</span></div></div>';document.body.append(tray);}
 return tray.querySelector(`[data-slot="${kind}"]`);
}
export function showInventory(visible){const tray=document.querySelector('#inventory-tray');if(tray)tray.hidden=!visible||!tray.querySelector('.inventory-slot > aside:not([hidden])');}

export function setInventoryItem(kind,present){
 const slot=inventorySlot(kind),wasPresent=slot.dataset.occupied==='true';
 if(slot.dataset.occupied!==undefined&&wasPresent===!!present)return;
 if(present&&!wasPresent)slot.dataset.acquired=String(++acquisition);
 slot.dataset.occupied=String(!!present);
 const row=slot.parentElement,slots=[...row.children];
 slots.sort((a,b)=>Number(b.dataset.occupied==='true')-Number(a.dataset.occupied==='true')||(a.dataset.occupied==='true'?Number(a.dataset.acquired)-Number(b.dataset.acquired):0));
 slots.forEach((item,index)=>{if(row.children[index]!==item)row.insertBefore(item,row.children[index]??null);item.querySelector('.empty-slot').textContent=`${index+1} · EMPTY`;});
}
