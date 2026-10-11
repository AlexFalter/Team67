import './photo-ui.css';
// Keyboard contract shared by mandatory photo apps. Workflow state remains
// with the encounter: this helper only traps focus and routes the shutter.
export function handlePhotoDialogKey(event,ui,{framing,onShutter}){
 if(event.code==='Tab'){
  const buttons=[...ui.querySelectorAll('button')].filter(button=>!button.disabled&&button.getClientRects().length);
  event.preventDefault();
  if(buttons.length){
   const index=buttons.indexOf(document.activeElement);
   buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus();
  }
  return true;
 }
 // Let the focused button receive its native Enter activation.
 if(event.code==='Enter'&&document.activeElement?.tagName==='BUTTON')return true;
 event.preventDefault();
 if(framing&&event.code==='Space'&&!event.repeat)onShutter();
 return true;
}
