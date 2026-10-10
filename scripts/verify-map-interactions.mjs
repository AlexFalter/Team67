import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),gpu=fileURLToPath(new URL('./browser-gpu.mjs',import.meta.url));
const checks=['verify-physics-node.mjs','verify-riding-paths.mjs','verify-world-continuity.mjs','verify-world-access.mjs','verify-team67-map.mjs','verify-native-detours.mjs','verify-interaction-boundaries.mjs','verify-publibike-station.mjs','verify-polybahn-ticket.mjs','verify-cabin-rides.mjs','verify-tourist-photo.mjs','verify-game-settings.mjs','verify-first-person.mjs','verify-encounter-map.mjs','verify-scooter-photo.mjs','verify-shuttle-intro.mjs','verify-interview-limo.mjs','verify-finance-guy.mjs','verify-mate-machine.mjs','verify-private-property.mjs','verify-transport-water.mjs','verify-station-access.mjs','verify-vehicle-chaos.mjs'];
for(const check of checks){
 console.log(`Checking ${check}`);
 const result=spawnSync(process.execPath,['--import',gpu,check],{cwd:root,stdio:'inherit',env:{...process.env,GAME_URL:process.env.GAME_URL??'http://127.0.0.1:4173'}});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status??1);
}
