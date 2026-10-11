import config from '../../game.config.json' with {type:'json'};
import {validateGameConfig} from './validate-game-config.js';
validateGameConfig(config);
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
// Treat configuration as read-only. Runtime state belongs to the feature itself.
export const gameConfig=freeze(config);
