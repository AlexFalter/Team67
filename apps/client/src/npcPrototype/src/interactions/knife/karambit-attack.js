// Original animation inspired by the reverse-grip Karambit slash in CS:GO.
// Position offsets are camera-local; the hand and blade travel together.
export const KARAMBIT_ATTACK_DURATION=.44;
export const KARAMBIT_CONTACT_TIME=.14;
const poses=[
 [0,0,0,0,0,0,0,0,0,0],
 [.075,.045,-.015,.015,-.04,-.12,.13,.03,-.04,.06],
 [.14,-.25,.065,-.055,.12,.38,-.65,-.07,.08,-.15],
 [.20,-.34,.035,-.025,.16,.48,-.82,-.09,.10,-.18],
 [.28,-.20,-.01,.01,.08,.25,-.42,-.04,.04,-.08],
 [.44,0,0,0,0,0,0,0,0,0],
];
export function sampleKarambitAttack(age,variant=0){
 const t=Math.max(0,Math.min(KARAMBIT_ATTACK_DURATION,age));
 let a=poses[0],b=poses[1];
 for(let i=1;i<poses.length;i++){b=poses[i];if(t<=b[0])break;a=b;}
 const u=Math.max(0,Math.min(1,(t-a[0])/(b[0]-a[0]))),blend=u*u*(3-2*u);
 const values=a.slice(1).map((value,i)=>value+(b[i+1]-value)*blend);
 // Alternate a high inward cut with a lower return cut; both recover to idle.
 if(variant%2){values[0]*=-.65;values[1]*=-.65;values[4]*=.55;values[5]*=.55;values[7]*=-1;values[8]*=-1;}
 const [x,y,z,pitch,yaw,roll,wristPitch,wristYaw,wristRoll]=values;
 return {x,y,z,pitch,yaw,roll,wristPitch,wristYaw,wristRoll};
}
