import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera, Vector3} from 'three';
import {bikePreviewCrop, bikePreviewFov, bikePreviewTarget} from '../apps/client/src/multiplayer/publiBikeCamera.ts';

test('QR projection matches portrait cropping at desktop, portrait and short-screen sizes',()=>{
 for(const [width,height] of [[1440,900],[390,844],[844,390]]){
  const crop=bikePreviewCrop(width,height);
  assert(Math.abs(crop.w/crop.h-.75)<1e-8);
  assert(crop.x>=0&&crop.y>=0&&crop.x+crop.w<=width&&crop.y+crop.h<=height);
  const camera=new PerspectiveCamera(bikePreviewFov(width/height),width/height,.05,100);
  camera.updateMatrixWorld();
  for(const point of [new Vector3(0,0,-.9),new Vector3(.115,.115,-.9),new Vector3(-.115,-.115,-.9)]){
   const projected=point.project(camera),target=bikePreviewTarget(projected.x,projected.y,camera.aspect);
   const sourceX=(projected.x+1)*width/2,sourceY=(1-projected.y)*height/2;
   assert(Math.abs(target.x-(sourceX-crop.x)/crop.w)<1e-8);
   assert(Math.abs(target.y-(sourceY-crop.y)/crop.h)<1e-8);
   assert(target.x>0&&target.x<1&&target.y>0&&target.y<1,'complete rear QR fits inside the phone');
  }
  assert.deepEqual(bikePreviewTarget(0,0,camera.aspect),{x:.5,y:.5});
 }
});
