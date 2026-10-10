export async function swipePolybahnCard(page){
 const box=await page.locator('#ticket-bank-card').boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await page.mouse.move(box.x+box.width/2+box.width*.60/.23,box.y+box.height/2,{steps:16});await page.mouse.up();
}
// Purchase and physically collect a fare through the player interaction.
export async function collectPolybahnTicket(page,index=0){
 const pickup=await page.evaluate(i=>gameState().polybahn.ticketPickups[i],index);
 await page.evaluate(p=>__test.setPosition(p[0],p[2]-1.1),pickup);await page.keyboard.press('KeyE');
 await swipePolybahnCard(page);await page.waitForSelector('#ticket-scan-qr');await page.click('#ticket-scan-qr');await page.waitForSelector('#ticket-qr-camera:not([hidden])');await page.waitForTimeout(400);const finder=await page.locator('#ticket-qr-camera .tourist-viewfinder').boundingBox();const aim=await page.evaluate(()=>gameState().ticketMachine.scanner);await page.mouse.move(finder.x+finder.width/2,finder.y+finder.height/2);await page.mouse.move(finder.x+finder.width/2+aim.yaw/1.6*finder.width,finder.y+finder.height/2+aim.pitch/1.2*finder.height,{steps:10});await page.waitForFunction(()=>gameState().ticketMachine.scanner.valid);await page.waitForSelector('#ticket-verify');
 for(const i of [0,4,8])await page.click(`[data-tile="${i}"]`);await page.click('#ticket-verify');await page.waitForFunction(()=>gameState().ticketMachine.phase==='collect');
 const click=await page.evaluate(i=>{const t=__test,v=t.polybahn.ticketProps[i].ticket.position.clone();t.polybahn.ticketProps[i].group.localToWorld(v);v.project(t.camera);return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};},index);await page.mouse.click(click.x,click.y);
 if(!await page.evaluate(()=>gameState().polybahn.ticketCount))throw new Error('Polybahn ticket was not collected');
 const entrance=await page.evaluate(i=>gameState().polybahn[i?'end':'start'],index);await page.evaluate(p=>__test.setPosition(p[0],p[2]),entrance);
}
