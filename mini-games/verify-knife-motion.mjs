import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
import {createKnifeMotion} from './knife-motion.js';
const motion=createKnifeMotion();let idle;for(let i=0;i<120;i++)idle=motion.update(1/60,{speed:0});
let sprint;for(let i=0;i<90;i++)sprint=motion.update(1/60,{speed:12});assert(sprint.sprint>.99);assert(sprint.y<idle.y-.02);assert(Math.abs(sprint.roll)>.2);
const turn=motion.update(1/60,{speed:12,yaw:.1});assert(turn.x!==sprint.x);
let air;for(let i=0;i<20;i++)air=motion.update(1/60,{speed:12,grounded:false,verticalSpeed:-7});assert(air.air>.9);
const land=motion.update(1/60,{speed:12,grounded:true});assert(land.landing>.02);
let slide;for(let i=0;i<40;i++)slide=motion.update(1/60,{speed:11,sliding:true});assert(slide.slide>.99);assert(slide.pitch<-.2);
motion.reset();assert.equal(motion.update(0).sprint,0);
const b=await chromium.launch();try{
 const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>{errors.push(e.message);console.log(e.message)});await p.routeWebSocket('**',ws=>ws.onMessage(()=>{}));await p.goto('http://127.0.0.1:5173/?debug=1');await p.waitForFunction(()=>!!window.__test,{},{timeout:60000});await p.click('#start');await p.keyboard.press('Space');await p.keyboard.press('KeyV');
 await p.evaluate(()=>{window.requestAnimationFrame=()=>0;__test.setPosition(-121,65.2);__test.setYaw(Math.atan2(-25,-2.4));__test.updatePlayer(0);__test.karambit.give();__test.karambit.update(2.2,true);});await p.waitForTimeout(100);
 const variants=[['idle',{speed:0,grounded:true}],['sprint',{speed:12,grounded:true}],['jump',{speed:12,grounded:false,verticalSpeed:5}],['slide',{speed:11,grounded:true,sliding:true}]];
 for(const [name,m]of variants){await p.evaluate(m=>{for(let i=0;i<90;i++)__test.karambit.update(1/60,true,m.speed>0,!!m.sliding,m);__test.renderGameScene();},m);await p.screenshot({path:`artifacts/knife-motion-${name}.png`});}
 assert.equal(await p.evaluate(()=>{let n=0;__test.karambit.root.traverse(o=>{if(o.name==='Knife_hand'||o.name==='Walking_hand')if(o.visible)n++;});return n;}),1,'only the equipped pose is visible');assert.deepEqual(errors,[]);
 console.log('PASS: sprint, turn sway, airborne pose, landing response, slide blend, reset, single visible hand and in-game motion screenshots');
}finally{await b.close();}
