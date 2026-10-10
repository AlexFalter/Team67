import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateGameConfig} from './src/config/validate-game-config.js';
const config=JSON.parse(readFileSync('game.config.json','utf8'));validateGameConfig(config);
for(const modify of [c=>c.moodle.deadlineSeconds=0,c=>c.moodle.intervalSeconds=[55,25],c=>c.moodle.questions[0].correct=10,c=>c.npcs.scooter.volume=2,c=>c.camera.portraitFovDegrees=180,c=>c.settingsDefaults.moodleEvents='yes',c=>c.visuals.skyColor='bad',c=>c.mate.retrySeconds=[2,1],c=>c.vehicles.bikeFailurePercent=101]){const copy=structuredClone(config);modify(copy);assert.throws(()=>validateGameConfig(copy),/game.config.json:/);}
console.log('PASS: configuration defaults and actionable errors for invalid timings, questions, volumes, camera, settings and colors.');
