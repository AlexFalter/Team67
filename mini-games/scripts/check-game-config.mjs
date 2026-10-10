import {readFileSync} from 'node:fs';
import {validateGameConfig} from '../src/config/validate-game-config.js';
const path=new URL('../game.config.json',import.meta.url);
try{validateGameConfig(JSON.parse(readFileSync(path,'utf8')));console.log('game.config.json is valid.');}catch(error){console.error(error.message);process.exitCode=1;}
