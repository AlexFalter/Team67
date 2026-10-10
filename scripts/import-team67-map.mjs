/** Install the complete upstream map verbatim. Never rebuild or restyle its geometry. */
import {readFile,writeFile,mkdir,copyFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const checkout=resolve(process.argv[2]??'artifacts/team67-upstream');
const client=join(checkout,'apps/client'),source=join(client,'public/maps/zurich'),out=resolve('public/maps/zurich');
const area=JSON.parse(await readFile(join(client,'src/maps/zurich/area.json'),'utf8'));
await mkdir(out,{recursive:true});
for(const name of ['hb-eth.glb','provenance.json'])await copyFile(join(source,name),join(out,name));
await copyFile(join(checkout,'packages/shared/src/zurich-world.json'),join(out,'collision.json'));
await writeFile(join(out,'area.json'),JSON.stringify(area,null,2)+'\n');
const bytes=await readFile(join(out,'hb-eth.glb'));
await writeFile(join(out,'integration.json'),JSON.stringify({repository:'https://github.com/AlexFalter/Team67',commit:execFileSync('git',['rev-parse','HEAD'],{cwd:checkout,encoding:'utf8'}).trim(),sha256:createHash('sha256').update(bytes).digest('hex'),asset:area.asset,origin:area.originLV95,bounds:area.boundsLV95,mode:'complete original GLB; original geometry, terrain, materials and coordinate origin',legacyMapAssets:false},null,2)+'\n');
await rm(join(out,'runtime'),{recursive:true,force:true});
console.log('Installed complete upstream GLB without coordinate, mesh or material conversion.');
