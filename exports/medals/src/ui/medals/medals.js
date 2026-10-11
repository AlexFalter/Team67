import {createMedalState} from './medal-state.js';
import {createMedalSound} from './medal-sound.js';
import {medalArt,preloadMedalArt} from './medal-art.js';

export function createMedals({root=document.body,definitions,duration,audioUrl,sound=createMedalSound({audioUrl})}={}){
 preloadMedalArt();
 const model=createMedalState({definitions,duration});
 const ui=document.createElement('aside');
 ui.id='game-medals';ui.hidden=true;
 ui.setAttribute('role','status');ui.setAttribute('aria-live','polite');ui.setAttribute('aria-atomic','true');
 const badge=document.createElement('div'),title=document.createElement('strong'),multiplier=document.createElement('b'),history=document.createElement('div');
 badge.className='medal-badge';title.className='medal-title';multiplier.className='medal-multiplier';multiplier.hidden=true;history.className='medal-history';
 ui.append(badge,title,multiplier,history);root.append(ui);
 let displayed=null,displayedCount=0,muted=false,destroyed=false;
 const historyNodes=new Map();
 function animate(element,className){element.classList.remove(className);void element.offsetWidth;element.classList.add(className);}
 return {
  award:(...args)=>!destroyed&&model.award(...args),
  awardMany:(...args)=>!destroyed&&model.awardMany(...args),
  update(dt,{paused=false,visible=true}={}){
   if(destroyed)return;
   model.update(dt,paused||!visible);
   const snapshot=model.state(),current=snapshot.current;
   if(current){
    if(displayed!==current.instance){
     displayed=current.instance;displayedCount=0;
     badge.innerHTML=medalArt(current.icon,current.id);title.textContent=current.title;
     ui.classList.remove('medal-exit');animate(ui,'medal-enter');if(!muted)sound.play();
    }
    if(displayedCount!==current.count){
     displayedCount=current.count;multiplier.hidden=current.count<2;multiplier.textContent=`${current.count}x`;
     if(current.count>1)animate(multiplier,'medal-count-update');
    }
    // Distinct older medals only: never draw the main medal a second time.
    const previous=snapshot.earned.filter(m=>m.batch===current.batch&&m.instance<current.instance&&m.id!==current.id&&Number.isFinite(m.startedAt)&&snapshot.clock-m.startedAt<snapshot.duration).reverse().slice(0,2);
    const activeHistory=new Set(previous.map(m=>m.instance));
    for(const [instance,node] of historyNodes)if(!activeHistory.has(instance)){node.remove();historyNodes.delete(instance);}
    for(const [order,medal] of previous.entries()){
     let node=historyNodes.get(medal.instance);
     if(!node){node=document.createElement('div');const art=document.createElement('div'),label=document.createElement('small');node.className='medal-history-item';art.innerHTML=medalArt(medal.icon,medal.id);node.append(art,label);historyNodes.set(medal.instance,node);history.append(node);}
     node.style.order=String(order);
     node.children[1].textContent=medal.title+(medal.count>1?` ${medal.count}x`:'');
    }
    ui.classList.toggle('medal-exit',snapshot.queued.length===0&&snapshot.remaining<.18);
   }else {displayed=null;displayedCount=0;historyNodes.clear();history.replaceChildren();}
   ui.hidden=!visible||!current;
  },
  setSoundEnabled(enabled){muted=!enabled;if(muted)sound.stop();},
  reset(){model.reset();displayed=null;displayedCount=0;historyNodes.clear();history.replaceChildren();ui.hidden=true;sound.stop();},
  state:()=>({...model.state(),sound:sound.state?.()}),
  destroy(){destroyed=true;model.reset();sound.destroy();ui.remove();},
 };
}
