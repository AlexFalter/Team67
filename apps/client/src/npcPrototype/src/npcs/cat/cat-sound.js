// Real recordings, bundled locally. Attribution: public/audio/CREDITS.md.
export function createCatSound({meowVolume=.65,purrVolume=.55,angryVolume=.8}={}){
 const meow=new Audio('/audio/cat-meow.mp3'),purr=new Audio('/audio/cat-purr.mp3'),angry=new Audio('/audio/cat-angry-yowl.mp3');
 meow.preload=purr.preload=angry.preload='auto';angry.volume=angryVolume;meow.volume=meowVolume;purr.volume=0;purr.loop=true;
 let remaining=0,destroyed=false,pending=false,generation=0,meows=0,purrs=0,angryPlays=0,error=null;
 for(const audio of [meow,purr,angry])audio.addEventListener('error',()=>{error=`Failed to load ${audio.src}`;});
 function play(audio){const token=generation;if(audio===purr)pending=true;audio.play().then(()=>{
  if(destroyed||token!==generation)return;
  if(audio===purr){pending=false;purrs++;}else if(audio===angry)angryPlays++;else meows++;error=null;
 }).catch(cause=>{if(token===generation){pending=false;error=cause.message;}});}
 function stop(){generation++;pending=false;remaining=0;for(const audio of [meow,purr,angry]){audio.pause();audio.currentTime=0;}purr.volume=0;}
 return {
  meow(){if(destroyed)return;meow.currentTime=0;play(meow);},
  angry(){if(destroyed)return;stop();play(angry);},
  pet(seconds=.4){if(destroyed)return;remaining=Math.max(remaining,seconds);purr.volume=purrVolume;if(purr.paused&&!pending)play(purr);},
  update(dt,{paused=false}={}){if(paused){stop();return;}remaining=Math.max(0,remaining-dt);if(!remaining&&!purr.paused){purr.volume*=Math.exp(-12*dt);if(purr.volume<.005){purr.pause();purr.currentTime=0;purr.volume=0;}}},
  stop,
  dispose(){destroyed=true;stop();for(const audio of [meow,purr,angry]){audio.removeAttribute('src');audio.load();}},
  state:()=>({meows,purrs,angryPlays,purring:!purr.paused,remaining,error})
 };
}
