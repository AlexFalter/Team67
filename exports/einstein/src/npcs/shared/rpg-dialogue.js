import './rpg-dialogue.css';
import {styleEncounterLine} from '../../shared/dialogue/encounter-ui.js';
// Existing encounters can adopt the shared skin without changing their dialogue logic.
export function styleRPGDialogue(panel){
 panel.classList.add('rpg-dialogue');
 panel.querySelector('.kid-dialogue-name')?.classList.add('rpg-dialogue-name');
 panel.querySelector('.kid-options')?.classList.add('rpg-dialogue-options');
 for(const line of panel.querySelectorAll('p,.eater-translation'))styleEncounterLine(line);
 return panel;
}
export function createRPGDialogue({id,speaker,lines,choices,compact=false}){
 const panel=document.createElement('section');panel.id=id;panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',speaker);
 if(compact)panel.classList.add('rpg-dialogue-compact');
 const name=document.createElement('div');name.className='rpg-dialogue-name';name.textContent=speaker;panel.append(name);
 for(const text of lines){const line=document.createElement('p');line.textContent=text;panel.append(styleEncounterLine(line));}
 const status=document.createElement('p');status.dataset.dialogueStatus='';status.setAttribute('role','status');panel.append(styleEncounterLine(status));
 const options=document.createElement('div');options.className='rpg-dialogue-options';panel.append(options);
 for(const choice of choices){const button=document.createElement('button');button.type='button';button.textContent=choice.text;for(const [key,value] of Object.entries(choice.data??{}))button.dataset[key]=value;options.append(button);}
 const help=document.createElement('small');help.className='rpg-dialogue-help';help.textContent='↑ ↓ CHOOSE · ENTER ANSWER · ESC LEAVE';panel.append(help);styleRPGDialogue(panel);document.body.append(panel);
 function select(button){for(const b of options.children)b.classList.toggle('chosen',b===button);}
 options.addEventListener('focusin',e=>{if(e.target.tagName==='BUTTON')select(e.target);});
 return {panel,status,setLine(text){const line=panel.querySelector('p:not([data-dialogue-status])');if(line)line.textContent=text;},focus(){const first=[...options.children].find(b=>!b.disabled);if(first){select(first);first.focus();}},keydown(e,onClose){
  if(panel.hidden)return false;
  if(e.code==='Escape'){e.preventDefault();onClose();return true;}
  const buttons=[...options.children].filter(b=>!b.disabled),index=buttons.indexOf(document.activeElement);
  if(['ArrowUp','ArrowDown','Tab'].includes(e.code)){e.preventDefault();const step=e.code==='ArrowUp'||(e.code==='Tab'&&e.shiftKey)?-1:1;buttons[(Math.max(0,index)+step+buttons.length)%buttons.length]?.focus();}
  else if(e.code==='Enter'||e.code==='Space'){e.preventDefault();if(!e.repeat)buttons.find(b=>b===document.activeElement)?.click();}
  else e.preventDefault();return true;
 }};
}
