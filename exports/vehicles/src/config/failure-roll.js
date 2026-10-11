// Sample once when a run starts; interactions reuse that result until reset.
export function rollFailure(percent,random=Math.random){
 return percent>=100||(percent>0&&random()<percent/100);
}
