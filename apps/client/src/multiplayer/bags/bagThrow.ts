import {AnimationClip,VectorKeyframeTrack} from 'three';
/** Keep the wind-up outside the near-camera plane and end with a short follow-through. */
export function bagThrowClip(original:AnimationClip){
 const times=[0,.19,.32,.43,.59,.91];
 const poses:Record<string,number[][]>={
  LeftArm:[[-.26,-.27,-.51],[-.19,-.28,-.55],[-.19,-.27,-.55],[-.17,-.22,-.66],[-.22,-.27,-.58],[-.27,-.70,-.60]],
  RightArm:[[.28,-.09,-.65],[.34,-.06,-.56],[.33,.02,-.58],[.13,.01,-.96],[.10,-.17,-.95],[.29,-.70,-.65]],
  BagGrip:[[.29,-.12,-.65],[.35,-.10,-.56],[.34,-.02,-.58],[.13,-.05,-.95],[.12,-.15,-.98],[.29,-.12,-.65]],
 };
 return new AnimationClip(original.name,original.duration,original.tracks.map(track=>{
  const positions=poses[track.name.replace(/\.position$/,'')];
  return positions&&track.name.endsWith('.position')?new VectorKeyframeTrack(track.name,times,positions.flat()):track.clone();
 }));
}
