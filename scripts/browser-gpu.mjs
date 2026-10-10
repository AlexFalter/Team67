// macOS headless Chromium defaults to CPU rendering. Use the same native Metal
// backend as the interactive browser so long ride tests don't stall on software GPU work.
import {chromium} from '@playwright/test';
if(process.platform==='darwin'){
 const launch=chromium.launch.bind(chromium);
 chromium.launch=options=>launch({...options,args:[...(options?.args??[]),'--use-angle=metal']});
}
