import {gameConfig} from '../../config/game-config.js';
const defaults=gameConfig.settingsDefaults;
const storageKey='eth-game-test-settings';
export function createGameSettings(onChange){
 let values={...defaults};try{const saved=JSON.parse(localStorage.getItem(storageKey));for(const key of Object.keys(defaults))if(typeof saved?.[key]==='boolean')values[key]=saved[key];}catch{}
 const panel=document.createElement('section');panel.id='game-settings';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Game settings');
 panel.innerHTML=`<div class="settings-card"><h2>Game settings</h2><p>Make testing easier. Your choices are saved on this browser.</p>${[['moodleEvents','Random Moodle quizzes',`${gameConfig.moodle.deadlineSeconds} seconds to answer. Failure means a ${gameConfig.moodle.sitOutSeconds}-second sit-down.`],['vehicleSounds','Movement and vehicle sounds','Footsteps, landings, collisions, engines, rail movement and doors.'],['railCrashProtection','Prevent rail crashes','Keep rail rides safe; disable to restore the tram derailment gag.'],['highlightWorkingBikes','Highlight working PubliBikes',`Show usable bikes in gold. Each battery lasts ${gameConfig.vehicles.bikeBatterySeconds} seconds.`],['teleportMode','Teleport mode','Press M, then click the map or choose a location.'],['freezeTimer','Pause lecture timer',`Explore without the ${gameConfig.mission.deadlineSeconds}-second deadline.`],['skipIntro','Skip bus intro','Start directly on the street.']].map(([key,label,hint])=>`<label><input type="checkbox" data-setting="${key}"><span><b>${label}</b><small>${hint}</small></span></label>`).join('')}<a href="/audio/CREDITS.md" target="_blank" rel="noopener" style="color:#ffd174;font-size:12px">Audio credits</a><button id="settings-done">Done</button></div>`;
 document.body.appendChild(panel);
 const open=()=>{panel.hidden=false;panel.querySelector('input').focus();};
 const button=document.createElement('button');button.id='open-settings';button.textContent='⚙ SETTINGS';button.onclick=open;document.body.appendChild(button);
 panel.querySelectorAll('input').forEach(input=>{input.checked=values[input.dataset.setting];input.onchange=()=>{values[input.dataset.setting]=input.checked;try{localStorage.setItem(storageKey,JSON.stringify(values));}catch{}onChange({...values});};});
 const close=()=>{panel.hidden=true;button.focus();};panel.querySelector('#settings-done').onclick=close;
 return {values:()=>({...values}),active:()=>!panel.hidden,keydown(e){if(panel.hidden)return false;if(e.code==='Escape'){e.preventDefault();close();}return true;}};
}
