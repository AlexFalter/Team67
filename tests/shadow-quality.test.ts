import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DirectionalLight, WebGLRenderTarget} from 'three';
import {applyShadowQuality} from '../apps/client/src/scene/shadowQuality.ts';

test('switching shadow quality expands coverage and replaces the GPU target only when required',()=>{
 const sun=new DirectionalLight();
 assert.equal(applyShadowQuality(sun,'medium'),50);
 assert.equal(sun.shadow.camera.right,30);assert.equal(sun.shadow.camera.far,120);
 const low=new WebGLRenderTarget(1024,1024);sun.shadow.map=low;
 let disposed=0;low.addEventListener('dispose',()=>disposed++);
 assert.equal(applyShadowQuality(sun,'performance'),50);
 assert.equal(sun.shadow.camera.right,30);assert.equal(sun.shadow.camera.far,120);
 assert.equal(sun.shadow.mapSize.x,1024);assert.equal(sun.shadow.map,low);assert.equal(disposed,0);
 applyShadowQuality(sun,'medium');assert.equal(sun.shadow.map,low);assert.equal(disposed,0);
 const projection=sun.shadow.camera.projectionMatrix.clone();
 assert.equal(applyShadowQuality(sun,'high'),180);
 assert.equal(disposed,1);assert.equal(sun.shadow.map,null);
 assert.equal(sun.shadow.mapSize.x,2048);assert.equal(sun.shadow.camera.right,90);
 assert.equal(sun.shadow.camera.far,360);assert.equal(sun.shadow.camera.projectionMatrix.equals(projection),false);
 const high=new WebGLRenderTarget(2048,2048);sun.shadow.map=high;
 high.addEventListener('dispose',()=>disposed++);
 applyShadowQuality(sun,'high');assert.equal(disposed,1);assert.equal(sun.shadow.map,high);
 applyShadowQuality(sun,'medium');assert.equal(disposed,2);assert.equal(sun.shadow.map,null);
 assert.equal(sun.shadow.mapSize.x,1024);assert.equal(sun.shadow.camera.right,30);
});
