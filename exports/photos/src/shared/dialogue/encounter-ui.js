// Shared dialogue typography; existing encounter panels keep their own controls.
export function styleEncounterLine(element){
 element.classList.add('encounter-line');element.setAttribute('aria-live','polite');return element;
}
export function createEncounterSubtitle(id){
 const element=styleEncounterLine(document.createElement('aside'));
 element.id=id;element.classList.add('encounter-subtitle');element.hidden=true;
 document.body.append(element);return element;
}
// Recorded voice playback and subtitle lifetime have one owner: newer speech
// replaces older speech, and reset invalidates pending playback promises.
export function createVoiceDialogue(subtitle,{volume=.85,random=Math.random,speaker='',formatLine=line=>[line.zh??line.text,line.en].filter(Boolean).join(' — ')}={}){
 let audio=null,generation=0,lastId=null,played=false,failed=false,line=null;
 function stop(){generation++;if(audio){audio.pause();audio.currentTime=0;}audio=null;subtitle.hidden=true;}
 function speak(pool){
  stop();const choices=pool.filter(item=>item.id!==lastId),available=choices.length?choices:pool;
  line=available[Math.floor(random()*available.length)];lastId=line.id;played=failed=false;
  const token=generation,current=new Audio(line.src);audio=current;current.volume=volume;
  subtitle.textContent=`${speaker?`${speaker}: `:''}${formatLine(line)}`;subtitle.hidden=false;
  current.onended=()=>{if(token===generation)subtitle.hidden=true;};
  current.play().then(()=>{if(token!==generation){current.pause();return;}played=true;}).catch(()=>{if(token!==generation)return;failed=true;/* Keep the readable subtitle if audio cannot play. */});
  return current;
 }
 return {speak,stop,state:()=>({line:line?.id??null,played,failed,playing:!!audio&&!audio.paused}),reset(){stop();lastId=null;line=null;played=failed=false;}};
}
