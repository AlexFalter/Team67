// Drive the actual phone UI, including recoverable scan errors.
export async function unlockNearbyBike(page){
 await page.waitForFunction(()=>gameState().bikeUnlock.active);
 for(let attempt=0;attempt<2;attempt++){
  const target=await page.evaluate(()=>gameState().bikeUnlock.target),bounds=await page.locator('#unlock-view').boundingBox();
  await page.mouse.move(bounds.x+target.x/320*bounds.width,bounds.y+target.y/260*bounds.height);
  await page.keyboard.down('Space');await page.evaluate(()=>{for(let i=0;i<90&&gameState().bikeUnlock.active&&!gameState().bikeUnlock.error;i++)__test.updatePlayer(1/60);});await page.waitForFunction(()=>gameState().riding||!!gameState().bikeUnlock.error,{},{timeout:15000});await page.keyboard.up('Space');
  if(await page.evaluate(()=>gameState().riding))return;
  if(await page.locator('#unlock-retry').isVisible())await page.click('#unlock-retry');else throw new Error(await page.evaluate(()=>gameState().bikeUnlock.error));
 }
 throw new Error('Bike did not unlock');
}
