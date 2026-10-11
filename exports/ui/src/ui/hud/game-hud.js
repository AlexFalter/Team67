export function createGameHUD(scene){
 const help=document.createElement('details');help.id='game-help';help.innerHTML='<summary>Controls</summary><div class="help-card"><b>Controls & credits</b></div>';const card=help.querySelector('.help-card');card.append(document.querySelector('footer'),document.querySelector('.credits'));document.body.append(help);
 document.addEventListener('pointerdown',e=>{if(help.open&&!help.contains(e.target))help.open=false;});document.addEventListener('keydown',e=>{if(help.open&&e.code==='Escape'){help.open=false;e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
 const hiddenSprites=new Set();let interacting=false;
 return {update({playing,machine,phone,settings,map,rail,showHint,labelFree=false}){
  document.body.classList.toggle('playing',playing);document.body.classList.toggle('machine-interaction',machine);document.body.classList.toggle('phone-open',phone);document.body.classList.toggle('settings-open',settings);document.body.classList.toggle('rail-ride',rail);document.body.classList.toggle('context-hint',showHint);
  const knifeHint=document.getElementById('karambit-hint');if(knifeHint&&!knifeHint.hidden){const mission=document.querySelector('.mission').getBoundingClientRect();knifeHint.style.setProperty('--karambit-hint-top',`${mission.bottom+10}px`);document.body.style.setProperty('--karambit-hint-bottom',`${knifeHint.getBoundingClientRect().bottom}px`);}
  if(machine||phone||settings||map)help.open=false;
  if(machine||labelFree){scene.traverse(o=>{if(o.isSprite&&o.visible){hiddenSprites.add(o);o.visible=false;}});}else if(!machine&&!labelFree&&interacting){for(const sprite of hiddenSprites)sprite.visible=true;hiddenSprites.clear();}
  interacting=machine||labelFree;
 }};
}
