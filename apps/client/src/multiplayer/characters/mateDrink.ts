export const MATE_DRINK_SECONDS=2.6,MATE_BURP_SECONDS=2.25;
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function mateDrinkPose(age:number){
 const active=age>=0&&age<MATE_DRINK_SECONDS;
 return {active,open:active?smooth(0,.18,age)*(1-smooth(.45,.8,age)):0,
  sip:active?smooth(.55,.9,age)*(1-smooth(1.55,2.05,age)):0,
  burp:active?smooth(2.2,2.3,age)*(1-smooth(2.4,2.6,age)):0};
}
