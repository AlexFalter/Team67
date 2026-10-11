import type {Object3D,Camera,Vector3,Quaternion} from 'three';
export const CAT_PET_SECONDS:number;
export const CAT_STAND_SECONDS:number;
export const CAT_ARRIVAL_SECONDS:number;
export function catArrivalPose(age:number):{handT:number;handLift:number;eyeLift:number;standProgress:number;handoffProgress:number;finished:boolean};
export function catBenchView(group:Object3D,camera:Camera,options?:{eyeLift?:number}):{position:Vector3;rotation:Quaternion};

export function catArrivalView(group:Object3D,camera:Camera):{position:Vector3;rotation:Quaternion};
export function applyCatArrivalActor(actor:Object3D,pose:ReturnType<typeof catArrivalPose>,target:Vector3,standPosition:Vector3):void;
