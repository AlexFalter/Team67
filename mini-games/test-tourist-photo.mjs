// Complete the mandatory portrait + landscape interaction before another action.
export async function completeTouristPhoto(page){
 if(!await page.evaluate(()=>gameState().touristPhoto.active))return;
 for(let i=0;i<2&&await page.evaluate(()=>gameState().touristPhoto.active);i++){
  if(await page.evaluate(()=>gameState().touristPhoto.phase==='framing')){
   await page.waitForTimeout(600);
   const view=await page.locator('#tourist-photo .tourist-viewfinder').boundingBox();
   await page.mouse.move(view.x+view.width/2,view.y+view.height/2);
   await page.waitForTimeout(450);await page.click('#tourist-shutter');
  }
  await page.click('#tourist-hand-back');
 }
}
