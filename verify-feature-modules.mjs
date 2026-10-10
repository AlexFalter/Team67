import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,access,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const out=await mkdtemp(path.join(os.tmpdir(),'eth-feature-check-'));
try{
 const run=(...args)=>execFileSync(process.execPath,['scripts/export-feature.mjs',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 run('--all','--dry-run');
 for(const name of ['integration-core','phone','publibike','vehicle-passengers','vehicle-audio','rail','vehicles','interactions','games','npcs']){
  run(name,'--out',out);
  const folder=path.join(out,name),manifest=JSON.parse(await readFile(path.join(folder,'feature-manifest.json'),'utf8'));
  for(const file of [...manifest.files,...manifest.assets])await access(path.join(folder,file));
  assert(!manifest.files.includes('main.js')&&!manifest.files.includes('boot.js'));
  assert(manifest.files.every(file=>!file.startsWith('node_modules/')&&!file.startsWith('artifacts/')));
  const pkg=JSON.parse(await readFile(path.join(folder,'package.json'),'utf8'));assert.equal(pkg.type,'module');assert.equal(pkg.exports,'./index.js');assert(!pkg.license,'export does not invent a license');
  if(name==='integration-core'){assert(manifest.files.includes('src/world/core/world-adapter.d.ts'));assert.equal(manifest.assets.length,0);assert.deepEqual(manifest.dependencies,{});assert(!manifest.files.some(p=>p.endsWith('.css')));const exports=await import(path.join(folder,'index.js'));assert(exports.createBikeFleetState({failurePercent:0}).claim(1,'alice'));}
  if(name==='games'){assert(!manifest.assets.some(p=>p.startsWith('public/maps/')));assert(manifest.files.some(p=>p.endsWith('/bike-unlock.js')));assert(manifest.files.some(p=>p.endsWith('/phone-quizzes.js')));}
  if(name==='vehicles'){assert(manifest.files.some(p=>p.endsWith('/transport.js')));assert(manifest.files.some(p=>p.endsWith('/vehicle-seats.js')));}
  if(name==='interactions'){assert(manifest.files.some(p=>p.endsWith('/mate-machine.js')));assert(manifest.files.some(p=>p.endsWith('/polybahn-ticket-machine.js')));}
  if(name==='npcs')assert(manifest.files.some(p=>p.endsWith('/conversation-camera.js')));
  if(name==='phone'){assert.equal(manifest.assets.length,0);assert(!manifest.files.some(p=>p.includes('geo-world')||p.includes('finance-guy')));}
  if(name==='publibike'){assert(manifest.assets.includes('public/models/publibike.glb'));assert(!manifest.assets.some(p=>p.startsWith('public/maps/')||p.startsWith('public/audio/')));assert(manifest.files.some(p=>p.endsWith('/vehicle-seats.js')));}
  if(name==='rail')for(const model of ['tram','polybahn','eth-link'])assert(manifest.assets.includes(`public/models/${model}.glb`));
  if(name==='vehicle-audio'){assert(manifest.assets.includes('public/audio/rail-running.mp3'));assert(manifest.assets.includes('public/audio/CREDITS.md'));assert(!manifest.assets.some(p=>p.includes('frankfurt')||p.includes('tourist')));}
  const before=await readFile(path.join(folder,'feature-manifest.json'),'utf8');assert.throws(()=>run(name,'--out',out),/Output exists/);assert.equal(await readFile(path.join(folder,'feature-manifest.json'),'utf8'),before);
 }
 assert.throws(()=>run('missing-feature','--out',out),/Choose a feature/);
 console.log('PASS: all module dependencies resolve; independent exports include required code/assets, exclude unrelated game/recordings, preserve credits and reject overwrites.');
}finally{await rm(out,{recursive:true,force:true});}
