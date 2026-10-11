import {gameConfig} from '../../config/game-config.js';
import {inventorySlot,showInventory,setInventoryItem} from '../inventory/item-inventory.js';
export function createMateInventory({canUse,onUse=()=>{}}){
 const duration=gameConfig.mate.boostSeconds,multiplier=gameConfig.mate.speedMultiplier;
 let count=0,remaining=0,effects=false;
 const ui=document.createElement('aside');ui.id='item-inventory';ui.hidden=true;ui.setAttribute('aria-label','Item inventory');ui.innerHTML=`<small>INVENTORY</small><button id="use-mate" type="button"><img src="/assets/tony-mate/cans/mint.png" alt=""><span>El Tony Mate <b id="mate-count">×0</b><small id="mate-use-hint">1 · DRINK · +${Math.round((multiplier-1)*100)}% SPEED / ${duration}s</small></span></button><div id="mate-boost-status" role="status" hidden></div>`;inventorySlot('mate').append(ui);
 const button=ui.querySelector('button'),quantity=ui.querySelector('#mate-count'),hint=ui.querySelector('#mate-use-hint'),status=ui.querySelector('#mate-boost-status');
 const fx=document.createElement('div');fx.id='mate-speed-effects';fx.hidden=true;fx.setAttribute('aria-hidden','true');fx.innerHTML=Array.from({length:28},(_,i)=>`<i style="--angle:${i*360/28}deg;--delay:${-(i%7)*.11}s;--color:${i%2?'#c8fa69':'#76efff'}"></i>`).join('');document.body.append(fx);
 function render(visible=true){setInventoryItem('mate',!!count||remaining>0);ui.hidden=!visible||(!count&&!remaining);quantity.textContent=`×${count}`;button.disabled=!count||remaining>0||!canUse();hint.textContent=remaining>0?'ENERGIZED':!canUse()?'USE WHEN WALKING':`1 · DRINK · +${Math.round((multiplier-1)*100)}% SPEED / ${duration}s`;status.hidden=remaining<=0;status.textContent=`MATE RUSH · +${Math.round((multiplier-1)*100)}% · ${Math.ceil(remaining)}s`;fx.hidden=!effects;showInventory(visible);}
 function use(){if(!count||remaining>0||!canUse())return false;count--;remaining=duration;onUse();render();return true;}
 button.onclick=use;
 return {
  add(){count++;render();},use,
  keydown(e){if(e.code!=='Digit1'||e.repeat||!canUse())return false;e.preventDefault();use();return true;},
  multiplier:()=>remaining>0?multiplier:1,
  update(dt,{walking=false,moving=false,visible=true}={}){if(walking)remaining=Math.max(0,remaining-Math.max(0,dt));effects=remaining>0&&walking&&moving;render(visible);},
  reset(){count=0;remaining=0;effects=false;render();},
  state:()=>({count,remaining,duration,multiplier:remaining>0?multiplier:1,effects})
 };
}
