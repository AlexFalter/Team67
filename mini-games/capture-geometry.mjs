import {chromium} from '@playwright/test';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5173/?debug=1');await page.waitForFunction(()=>window.__test);await page.click('#start');
for(const [name,i,offset] of [['shelters',0,Math.PI/2],['bridge',8,0],['hillside',55,0]]){await page.evaluate(({i,offset})=>{const t=__test,p=t.world.data.route[i],q=t.world.data.route[Math.min(i+2,77)];t.setPosition(...p);t.setCheckpoint(i+1);t.setYaw(Math.atan2(-(q[0]-p[0]),-(q[1]-p[1]))+offset);},{i,offset});await page.waitForTimeout(500);await page.screenshot({path:`artifacts/fixed-geometry-${name}.png`});}
console.log({errors});await browser.close();
