/** Original procedural transit sounds; no external recordings or extra audio context. */
export function transitAudioBuffers(context:Pick<AudioContext,'createBuffer'|'sampleRate'>){
 const buffer=(seconds:number,sample:(t:number)=>number)=>{
  const b=context.createBuffer(1,Math.round(seconds*context.sampleRate),context.sampleRate),data=b.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=sample(i/context.sampleRate);
  return b;
 };
 const motor=buffer(2,t=>{
  // Quiet cable drive: low motor hum, gear harmonics and a little rolling friction.
  const phase=Math.PI*2*72*t+.8*Math.sin(Math.PI*4*t);
  const seam=Math.min(1,t/.02,(2-t)/.02);
  return seam*(.32*Math.sin(phase)+.12*Math.sin(phase*2)+.055*Math.sin(phase*4)+.04*(Math.random()*2-1));
 });
 const chime=(notes:number[],spacing:number)=>buffer(notes.length*spacing+.65,t=>{
  let value=0;
  notes.forEach((frequency,index)=>{
   const age=t-index*spacing;if(age<0||age>.8)return;
   const envelope=Math.min(1,age/.012)*Math.exp(-age*6)*Math.min(1,(.8-age)/.04);
   value+=envelope*(.45*Math.sin(Math.PI*2*frequency*age)+.08*Math.sin(Math.PI*4*frequency*age));
  });return value;
 });
 return new Map([
  ['polybahn-running',motor],
  ['tram-chime',chime([659.25,523.25,392],.28)],
  ['polybahn-chime',chime([523.25,659.25],.24)],
 ] as const);
}
