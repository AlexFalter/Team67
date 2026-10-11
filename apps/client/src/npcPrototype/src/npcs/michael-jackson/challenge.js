import {MICHAEL_CHALLENGE} from '@race/shared';
import {styleRPGDialogue} from '../shared/rpg-dialogue.js';

export function createMichaelChallenge(actor,{net,uiRoot,onChange,onClose}){
 let step=0,pending=false,sentAt=0;
 const ui=document.createElement('section');ui.className='rpg-dialogue-compact michael-challenge';ui.hidden=true;ui.setAttribute('role','dialog');ui.setAttribute('aria-label','Michael Jackson dance challenge');
 ui.innerHTML='<div class="rpg-dialogue-name">Michael Jackson</div><p></p><form><label>Say it back<input autocomplete="off" maxlength="80" aria-label="Your reply"></label><div role="status"></div><div class="rpg-dialogue-options"><button type="submit">Say it</button><button type="button" data-close>Maybe later</button></div></form>';
 styleRPGDialogue(ui);uiRoot.append(ui);
 const input=ui.querySelector('input'),status=ui.querySelector('[role=status]'),submit=ui.querySelector('[type=submit]');
 function close(){actor.setTalking(false);ui.hidden=true;pending=false;onChange();onClose();}
 function draw(){const unlocked=step>=MICHAEL_CHALLENGE.length;ui.querySelector('p').textContent=unlocked?'Hee-hee! You’ve got the moves. Your emote wheel is unlocked — press B to dance.':MICHAEL_CHALLENGE[step].prompt;input.closest('label').hidden=unlocked;submit.hidden=unlocked;ui.querySelector('[data-close]').textContent=unlocked?'Let’s dance':'Maybe later';input.value='';submit.disabled=pending;if(!unlocked)input.focus();}
 function send(extra){pending=true;sentAt=net.now();submit.disabled=true;net.room.send('move',[actor.local.body.x,actor.local.body.y,actor.local.body.z,actor.local.body.rotY,0,0,0,0]);net.room.send('emoteChallenge',{...extra,roundStartedAt:net.room.state.startedAt});}
 ui.querySelector('form').onsubmit=e=>{e.preventDefault();if(!pending&&step<MICHAEL_CHALLENGE.length){status.textContent='';send({answer:input.value});}};
 ui.querySelector('[data-close]').onclick=close;
 const resolve=result=>{if(ui.hidden||result.roundStartedAt!==net.room?.state.startedAt)return;pending=false;step=result.step;status.textContent=result.ok?'':(result.reason??"Say the line shown above.");draw();};
 net.onEmoteChallengeResult=resolve;
 return {near:p=>actor.group.position.distanceTo(p)<3.5,
  interact(p){if(actor.group.position.distanceTo(p)>=3.5)return false;step=0;pending=false;actor.setTalking(true);ui.hidden=false;status.textContent='';draw();onChange();send({begin:true});return true;},
  active:()=>!ui.hidden,keydown(e){if(ui.hidden)return false;if(e.code==='Escape'){e.preventDefault();close();return true;}return false;},
  update(){if(pending&&net.now()-sentAt>5000){pending=false;submit.disabled=false;status.textContent='No response — try again.';}},
  reset(){actor.setTalking(false);ui.hidden=true;pending=false;step=0;},dispose(){actor.setTalking(false);if(net.onEmoteChallengeResult===resolve)net.onEmoteChallengeResult=undefined;ui.remove();}};
}
