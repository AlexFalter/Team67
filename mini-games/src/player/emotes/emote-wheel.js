import {emoteIcon} from './emote-icons.js';
import {emoteDefinitions,createEmoteAnimator} from './emotes.js';
const movement=new Set(['KeyW','KeyA','KeyS','KeyD','Space','KeyE','KeyM','KeyV','KeyR']);
export function createEmoteWheel(student,{canUse=()=>true,onStart=()=>{},onStop=()=>{},root=document.body}={}){
 const animator=createEmoteAnimator(student);let open=false,selected=0;
 const ui=document.createElement('section');ui.className='emote-overlay';ui.hidden=true;ui.setAttribute('role','dialog');ui.setAttribute('aria-label','Emote wheel');
 ui.innerHTML='<div class="emote-heading">EMOTES<small>B / ESC TO CLOSE · 1–6 OR CLICK TO DANCE</small></div><div class="emote-wheel"><div class="emote-center"><strong>CHOOSE A MOVE</strong><small>Move to stop dancing</small></div></div>';
 const wheel=ui.querySelector('.emote-wheel'),center=ui.querySelector('.emote-center strong');

 function highlight(i){selected=i;wheel.style.setProperty('--selection-angle',`${i*60-30}deg`);buttons.forEach((b,j)=>b.classList.toggle('selected',i===j));center.textContent=emoteDefinitions[i].name;}
 const buttons=emoteDefinitions.map((e,i)=>{
  const b=document.createElement('button');b.type='button';b.className='emote-slot';b.dataset.emote=e.id;b.setAttribute('aria-label',`${i+1}: ${e.name}`);b.style.setProperty('--rarity',e.color);
  const angle=i*Math.PI/3-Math.PI/2;b.style.left=`${50+Math.cos(angle)*34}%`;b.style.top=`${50+Math.sin(angle)*34}%`;
  b.innerHTML=`<span class="emote-number">${i+1}</span>${emoteIcon(e.id)}<span>${e.name}</span>`;
  b.addEventListener('pointerenter',()=>highlight(i));b.addEventListener('focus',()=>highlight(i));b.addEventListener('click',()=>choose(i));wheel.append(b);return b;
 });
 root.append(ui);highlight(0);
 function close(){open=false;ui.hidden=true;}
 function stop(){const was=animator.state().active;animator.stop();if(was)onStop();}
 function choose(i){if(!canUse()){close();return false;}stop();close();animator.start(emoteDefinitions[i].id);onStart(emoteDefinitions[i]);return true;}
 function keydown(e){
  if(e.code==='KeyB'&&!e.repeat){if(!canUse()&&!open)return false;e.preventDefault();if(open)close();else{stop();open=true;ui.hidden=false;buttons[selected].focus();}return true;}
  if(open){if(e.code==='Escape'){e.preventDefault();close();return true;}if(/^Digit[1-6]$/.test(e.code)){e.preventDefault();choose(Number(e.code.slice(-1))-1);return true;}if(e.code==='Enter'||e.code==='Space'){e.preventDefault();choose(selected);return true;}if(e.code.startsWith('Arrow')){e.preventDefault();highlight((selected+(e.code==='ArrowLeft'||e.code==='ArrowUp'?5:1))%6);buttons[selected].focus();return true;}if(movement.has(e.code)){close();return false;}if(e.code==='Tab')return false;e.preventDefault();return true;}
  if(animator.state().active&&(movement.has(e.code)||e.code==='Escape')){stop();if(e.code==='Escape'){e.preventDefault();return true;}}
  return false;
 }
 return {keydown,choose,stop,active:()=>open||animator.state().active,opened:()=>open,
  update(dt){if(!canUse()){close();stop();return;}animator.update(dt);},
  reset(){close();stop();},dispose(){close();stop();ui.remove();},state:()=>({open,selected,...animator.state()})};
}
