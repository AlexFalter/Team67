import {readFile,writeFile,mkdir,cp,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(await readFile(path.join(root,'feature-modules.json'),'utf8'));
const args=process.argv.slice(2),names=Object.keys(catalog.features);
if(args.includes('--list')){for(const name of names)console.log(`${name.padEnd(22)} ${(catalog.features[name].category??"shared").padEnd(14)} ${catalog.features[name].entry}`);process.exit(0);}
const requested=args[0];
if(!requested||(!names.includes(requested)&&requested!=='--all'))throw new Error('Choose a feature name or --all. Use --list to see available modules.');
const outIndex=args.indexOf('--out');if(outIndex>=0&&!args[outIndex+1])throw new Error('--out needs a directory');
const base=path.resolve(outIndex>=0?args[outIndex+1]:path.join(root,'exports'));
const dry=args.includes('--dry-run');
const known=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const importPattern=/(?:\bfrom\s*|\bimport\s*\(?\s*|@import\s*(?:url\(\s*)?)["']([^"']+)["']/g;
function safe(relative){const resolved=path.resolve(root,relative);if(!resolved.startsWith(root+path.sep))throw new Error(`Dependency escapes project: ${relative}`);return resolved;}
async function plan(name){
 const files=new Set(),assets=new Set(),dependencies=new Set();
 async function visit(relative){
  relative=relative.replaceAll(path.sep,'/');if(files.has(relative))return;
  const absolute=safe(relative);await access(absolute);files.add(relative);
  if(relative.endsWith('.js')){const declaration=relative.slice(0,-3)+'.d.ts';let exists=true;try{await access(safe(declaration));}catch(error){if(error.code!=='ENOENT')throw error;exists=false;}if(exists)await visit(declaration);}
  if(!/\.(js|css|json)$/.test(relative))return;
  const source=await readFile(absolute,'utf8');
  if(!relative.endsWith('.json'))for(const match of source.matchAll(importPattern)){
   const spec=match[1];if(spec.startsWith('.'))await visit(path.normalize(path.join(path.dirname(relative),spec)));
   else if(!/^(https?:|\/)/.test(spec)){const packageName=spec.startsWith('@')?spec.split('/').slice(0,2).join('/'):spec.split('/')[0];if(!known.dependencies[packageName])throw new Error(`Undeclared dependency ${spec}`);dependencies.add(packageName);}
  }
  // Both JS templates and DOM markup refer to assets under Vite's public root.
  for(const match of source.matchAll(/(?<![\w./])\/(?:audio|models|assets|maps|gameplay)\/[\w./${}-]+/g)){
   const url=match[0];if(url.includes('${'))continue;
   const asset='public'+url;
   if(path.extname(asset)){await access(safe(asset));assets.add(asset);}
  }
  for(const asset of catalog.assetOverrides[relative]??[]){await access(safe(asset));assets.add(asset);}
 }
 await visit(catalog.features[name].entry);
 await visit(path.join(path.dirname(catalog.features[name].entry),'README.md'));
 await visit('src/README.md');
 await visit('docs/feature-modules.md');
 await visit('docs/multiplayer-integration.md');
 if(catalog.features[name].legacyStyles)await visit('style.css');
 if([...assets].some(p=>p.startsWith('public/audio/')))assets.add('public/audio/CREDITS.md');
 if([...assets].some(p=>p.includes('/ersti-bag')))assets.add('public/models/ERSTI-BAG-CREDITS.md');
 return {name,entry:catalog.features[name].entry,files:[...files].sort(),assets:[...assets].sort(),dependencies:Object.fromEntries([...dependencies].sort().map(p=>[p,known.dependencies[p]]))};
}
// Plan all selections before creating output; missing assets fail without a partial export.
const plans=await Promise.all((requested==='--all'?names:[requested]).map(plan));
for(const p of plans){
 const destination=path.join(base,p.name);
 if(dry){console.log(`${p.name}: ${p.files.length} source files, ${p.assets.length} asset paths, dependencies: ${Object.keys(p.dependencies).join(', ')||'none'}`);continue;}
 try{await access(destination);throw new Error(`Output exists: ${destination}. Choose a new --out directory.`);}catch(e){if(e.code!=='ENOENT')throw e;}
 await mkdir(destination,{recursive:true});
 for(const relative of [...p.files,...p.assets]){const target=path.join(destination,relative);await mkdir(path.dirname(target),{recursive:true});await cp(safe(relative),target,{recursive:true});}
 await writeFile(path.join(destination,'index.js'),`${catalog.features[p.name].legacyStyles?"import './style.css';\n":''}export * from './${p.entry}';\n`);
 await writeFile(path.join(destination,'package.json'),JSON.stringify({name:`eth-game-${p.name}`,version:'0.1.0',private:true,type:'module',exports:'./index.js',scripts:{build:'vite build'},dependencies:p.dependencies,devDependencies:{vite:known.dependencies.vite}},null,2)+'\n');
 await writeFile(path.join(destination,'vite.config.js'),"import {defineConfig} from 'vite';\nexport default defineConfig({build:{target:'es2022',lib:{entry:'index.js',formats:['es'],fileName:'index'},rollupOptions:{external:id=>!id.startsWith('.')&&!id.startsWith('/')&&!id.startsWith('\\0')}}});\n");
 await writeFile(path.join(destination,'feature-manifest.json'),JSON.stringify(p,null,2)+'\n');
 await writeFile(path.join(destination,'.gitignore'),'node_modules/\ndist/\n');
 await writeFile(path.join(destination,'README.md'),`# ETH game: ${p.name}\n\nExported feature library, with its transitive source dependencies and required runtime assets. This is a module for a host game, not a standalone playable game.\n\n## Build\n\nRun \`npm install\` and \`npm run build\`. Import factories/helpers from \`./index.js\` using Vite or another ESM bundler. Serve \`public/\` at the host site's root. CSS imports are bundled by Vite.\n\n## Integration\n\nStart with the [code map](src/README.md) for ownership and extension steps.\n\nFactories retain the original signatures: the host supplies the Three.js scene/camera, world/solver and callbacks as required. Call the returned update/reset/input methods from the host loop. Browser UI factories require a DOM. See the entry modules for APIs. Some UI still uses legacy \`style.css\`, included when required; it contains shared game selectors and should be scoped when integrating into another application.\n\n\`feature-manifest.json\` lists exactly which code, assets and npm dependencies were included. Shared dependencies stay in their own folders; no map, other encounters or unrelated recordings are copied unless the feature uses them.\n\n## Sharing\n\nThis folder can be its own GitHub repository. No repository, commit or upload has been created automatically. Runtime asset credits are preserved where present. This exporter does not grant new licenses to code, models, recordings or branding; choose the code license and check the included credits before making the repository public. Original source is maintained in the parent game's module folders.\n`);
 console.log(`Exported ${p.name} to ${destination} (${p.files.length} source files, ${p.assets.length} asset paths)`);
}
