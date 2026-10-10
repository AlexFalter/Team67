import {createMateInventoryState} from './mate-inventory-state.js';
import {gameConfig} from '../../config/game-config.js';
import {defaultItemInventory} from '../inventory/item-inventory.js';
export function createMateInventory({canUse,onUse=()=>{},inventory=defaultItemInventory(),uiRoot=document.body,stateModel}){
 const rules=stateModel??createMateInventoryState({duration:gameConfig.mate.boostSeconds,multiplier:gameConfig.mate.speedMultiplier});
 const duration=rules.duration,multiplier=rules.multiplierValue;
 let count=0,remaining=0,effects=false;
 const ui=document.createElement('aside');ui.id='item-inventory';ui.hidden=true;ui.setAttribute('aria-label','Item inventory');ui.innerHTML=`<small>INVENTORY</small><button id="use-mate" type="button"><img src="/assets/tony-mate/cans/mint.png" alt=""><span>El Tony Mate <b id="mate-count">×0</b><small id="mate-use-hint">1 · DRINK · +${Math.round((multiplier-1)*100)}% SPEED / ${duration}s</small></span></button><div id="mate-boost-status" role="status" hidden></div>`;inventory.slot('mate').append(ui);
 ({count,remaining}=rules.snapshot());
 const button=ui.querySelector('button'),quantity=ui.querySelector('#mate-count'),hint=ui.querySelector('#mate-use-hint'),status=ui.querySelector('#mate-boost-status');
 const fx=document.createElement('div');fx.id='mate-speed-effects';fx.hidden=true;fx.setAttribute('aria-hidden','true');fx.innerHTML=Array.from({length:28},(_,i)=>`<i style="--angle:${i*360/28}deg;--delay:${-(i%7)*.11}s;--color:${i%2?'#c8fa69':'#76efff'}"></i>`).join('');uiRoot.append(fx);
 function render(visible=true){({count,remaining}=rules.snapshot());inventory.setItem('mate',!!count||remaining>0);ui.hidden=!visible||(!count&&!remaining);quantity.textContent=`×${count}`;button.disabled=!count||remaining>0||!canUse();hint.textContent=remaining>0?'ENERGIZED':!canUse()?'USE WHEN WALKING':`1 · DRINK · +${Math.round((multiplier-1)*100)}% SPEED / ${duration}s`;status.hidden=remaining<=0;status.textContent=`MATE RUSH · +${Math.round((multiplier-1)*100)}% · ${Math.ceil(remaining)}s`;fx.hidden=!effects;inventory.show(visible);}
 function use(){({count,remaining}=rules.snapshot());if(!count||remaining>0||!canUse())return false;if(!rules.use())return false;onUse();render();return true;}
 button.onclick=use;
 return {
  dispose(){ui.remove();fx.remove();inventory.setItem('mate',false);},
  add(grantId){const added=rules.add(grantId);render();return added;},use,
  keydown(e){if(e.code!=='Digit1'||e.repeat||!canUse())return false;e.preventDefault();use();return true;},
  multiplier:rules.multiplier,
  update(dt,{walking=false,moving=false,visible=true}={}){rules.tick(dt,{walking});({count,remaining}=rules.snapshot());effects=remaining>0&&walking&&moving;render(visible);},
  snapshot:rules.snapshot,restore(snapshot){rules.restore(snapshot);effects=false;render();},
  reset(){rules.reset();effects=false;render();},
  state:()=>({...rules.snapshot(),duration,multiplier:rules.multiplier(),effects})
 };
}
