import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.routeWebSocket('**',ws=>ws.onMessage(()=>{}));
 await page.addInitScript(()=>{window.__speech={lines:[],current:null};Object.defineProperty(window,'speechSynthesis',{value:{speaking:false,pending:false,cancel(){this.speaking=false;},speak(line){__speech.lines.push(line.text);__speech.current=line;this.speaking=true;}}});});
 await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:4173'}/?debug=1`);await page.waitForFunction(()=>window.__test,{},{timeout:60000});await page.click('#start');
 await page.evaluate(()=>{__test.finishIntro();const p=__test.polybahn,q=p.state().start;__test.setPosition(q[0],q[2]);__test.interactVehicle();for(let i=0;i<12000&&!gameState().ticketInspection.active;i++)__test.advancePolybahn(1/60);});
 assert(await page.evaluate(()=>gameState().ticketInspection.active));
 assert(await page.locator('#inspection-dialogue').evaluate(node=>node.classList.contains('encounter-line')));
 const first=await page.textContent('#inspection-dialogue');assert.match(first,/Tickets/);
 await page.keyboard.press('Escape');assert(await page.evaluate(()=>gameState().ticketInspection.active));
 await page.evaluate(()=>{for(let i=0;i<400&&gameState().ticketInspection.active;i++){speechSynthesis.speaking=false;__speech.current?.onend();__test.updatePlayer(.25);}});
 assert.equal(await page.evaluate(()=>__speech.lines.length),6);assert.equal(await page.evaluate(()=>gameState().ticketInspection.fineTotal),100);assert(!await page.evaluate(()=>gameState().ticketInspection.active));
 assert.deepEqual(errors,[]);console.log('PASS: shared inspector dialogue style, all six spoken lines, compulsory interaction, fine and completion.');
}finally{await browser.close();}
