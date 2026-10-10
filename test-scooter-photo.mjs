export async function completeScooterPhoto(page){
 if(!await page.evaluate(()=>gameState().scooterPhotoPending||gameState().scooterPhoto.active))return;
 await page.waitForFunction(()=>gameState().scooterPhoto.active);
 await page.click('#scooter-center');await page.click('#scooter-shutter');await page.click('#scooter-submit');
}
