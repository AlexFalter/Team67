export function validateGameConfig(config){
 const fail=(path,detail)=>{throw new Error(`game.config.json: ${path} ${detail}`);};
 for(const section of ['mission','player','moodle','mate','vehicles','npcs','camera','visuals','settingsDefaults','scanning'])if(!config||typeof config[section]!=='object'||config[section]===null||Array.isArray(config[section]))fail(section,'must be a configuration object');
 const number=(path,min=0,max=Infinity)=>{const value=path.split('.').reduce((o,k)=>o?.[k],config);if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(path,`must be a number between ${min} and ${max}`);};
 for(const path of ['mission.deadlineSeconds','mission.scorePerSecond','player.walkSpeed','player.sprintSpeed','player.jumpSpeed','player.mouseSensitivity','player.arrowLookSpeed','player.slide.durationSeconds','player.slide.maximumSpeed','moodle.deadlineSeconds','moodle.sitOutSeconds','mate.boostSeconds','mate.speedMultiplier','camera.aimSmoothing','camera.previewWidth','visuals.maximumPixelRatio','visuals.shadowMapSize'])number(path,Number.EPSILON);
 for(const path of ['mission.derailPenaltySeconds','player.slide.minimumSpeed','player.slide.speedBonus','player.slide.friction','player.slide.cooldownSeconds','player.slide.cameraDrop','moodle.rewardSeconds','moodle.urgentAtSeconds','mate.loadingSeconds','visuals.hemisphereIntensity','visuals.sunIntensity'])number(path);
 for(const key of ['bikeSpeed','bikeSprintSpeed','scooterSpeed','scooterSprintSpeed','bikeBatterySeconds'])number(`vehicles.${key}`,Number.EPSILON);
 for(const key of ['worldFovDegrees','portraitFovDegrees','landscapeFovDegrees'])number(`camera.${key}`,1,179);
 for(const key of ['frameCoverage','cursorWarpFraction'])number(`camera.${key}`,Number.EPSILON,1);
 for(const key of ['yawSensitivityCap','pitchSensitivityCap'])number(`camera.${key}`,Number.EPSILON);
 for(const path of ['mate.retrySeconds','moodle.intervalSeconds','camera.qrYawOffsetRadians','camera.qrPitchOffsetRadians']){const pair=path.split('.').reduce((o,k)=>o?.[k],config);if(!Array.isArray(pair)||pair.length!==2||pair.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0)||pair[1]<pair[0])fail(path,'must be [minimum, maximum] with 0 ≤ minimum ≤ maximum');}
 if(config.moodle.intervalSeconds[0]<=0)fail('moodle.intervalSeconds','must start above zero');
 if(!Array.isArray(config.moodle.questions)||!config.moodle.questions.length)fail('moodle.questions','must contain at least one question');
 for(const [i,q] of config.moodle.questions.entries()){if(!q||['course','question','explanation'].some(k=>typeof q[k]!=='string'||!q[k].trim())||!Array.isArray(q.options)||q.options.length<2||q.options.some(v=>typeof v!=='string'||!v.trim())||!Number.isInteger(q.correct)||q.correct<0||q.correct>=q.options.length)fail(`moodle.questions[${i}]`,'needs text, at least two options and a valid zero-based correct index');}
 for(const key of ['scooter','finance','kid','eater']){number(`npcs.${key}.interactionDistance`,Number.EPSILON);for(const [field,value] of Object.entries(config.npcs[key]))if(field.toLowerCase().includes('volume'))number(`npcs.${key}.${field}`,0,1);}
 for(const key of ['scooter','kid','eater']){number(`npcs.${key}.audioNearDistance`);number(`npcs.${key}.audioFarDistance`,config.npcs[key].audioNearDistance+Number.EPSILON);}
 for(const path of ['npcs.inspector.fineCHF','npcs.inspector.timePenaltySeconds','npcs.privateProperty.audioStartSeconds'])number(path);
 for(const path of ['npcs.inspector.speechRate','npcs.inspector.speechPitch','npcs.privateProperty.durationSeconds','npcs.einstein.interactionDistance','npcs.einstein.portalDistance','npcs.interview.interactionDistance','npcs.interview.boardingDistance'])number(path,Number.EPSILON);
 number('npcs.privateProperty.volume',0,1);
 if(config.npcs.privateProperty.audioStartSeconds>=config.npcs.privateProperty.durationSeconds)fail('npcs.privateProperty.audioStartSeconds','must be shorter than durationSeconds');
 number('npcs.scooter.handoverSeconds',Number.EPSILON);
 for(const key of ['greeting','giftLine'])if(typeof config.npcs.scooter[key]!=='string')fail(`npcs.scooter.${key}`,'must be text');
 if(typeof config.npcs.scooter.horns!=='boolean')fail('npcs.scooter.horns','must be true or false');
 for(const key of ['moodleEvents','medalSounds','vehicleSounds','railCrashProtection','highlightWorkingBikes','teleportMode','freezeTimer','skipIntro'])if(typeof config.settingsDefaults?.[key]!=='boolean')fail(`settingsDefaults.${key}`,'must be true or false');
 number('vehicles.bikeFailurePercent',0,100);
 for(const key of ['skyColor','hemisphereSkyColor','hemisphereGroundColor','sunColor'])if(!/^#[0-9a-f]{6}$/i.test(config.visuals[key]))fail(`visuals.${key}`,'must be a six-digit hex color');
 if(typeof config.visuals.shadows!=='boolean')fail('visuals.shadows','must be true or false');
 if(!Number.isInteger(config.visuals.shadowMapSize)||Math.log2(config.visuals.shadowMapSize)%1!==0)fail('visuals.shadowMapSize','must be a power of two');
 for(const key of ['ticketHoldSeconds','bikeHoldSeconds','bikeAimTolerancePixels'])number(`scanning.${key}`,Number.EPSILON);
 for(const key of ['ticketSettleSeconds','bikeSettleSeconds','bikeStutterSeconds'])number(`scanning.${key}`);
 number('scanning.bikeStutterAtProgress',0,1);
 const textList=(path,list,count)=>{if(!Array.isArray(list)||!list.length||(count&&list.length!==count)||list.some(v=>typeof v!=='string'))fail(path,'must be a list of dialogue strings with the expected number of choices');};
 textList('npcs.inspector.lines',config.npcs.inspector.lines);
 textList('npcs.kid.choices',config.npcs.kid.choices,3);textList('npcs.kid.replies',config.npcs.kid.replies,3);number('npcs.kid.triggerChoice',0,2);if(!Number.isInteger(config.npcs.kid.triggerChoice))fail('npcs.kid.triggerChoice','must be a zero-based integer');
 if(typeof config.npcs.kid.question!=='string')fail('npcs.kid.question','must be text');
 textList('npcs.eater.choices',config.npcs.eater.choices,4);for(const key of ['question','lunch','closer','delicious'])textList(`npcs.eater.lines.${key}`,config.npcs.eater.lines?.[key],2);
 number('npcs.football.voiceVolume',0,1);number('npcs.football.audioNearDistance');number('npcs.football.audioFarDistance',Number.EPSILON);
 if(config.npcs.football.audioFarDistance<=config.npcs.football.audioNearDistance)fail('npcs.football.audioFarDistance','must exceed near distance');
 const gap=config.npcs.football.celebrationGapSeconds;if(!Array.isArray(gap)||gap.length!==2||gap.some(v=>!Number.isFinite(v)||v<1)||gap[1]<gap[0])fail('npcs.football.celebrationGapSeconds','must be increasing positive [minimum,maximum] seconds');
 for(const field of ['interactionDistance','strokesRequired','strokeDistance','maximumStrokeSpeed','maximumVerticalDrift','hurtSeconds'])number(`npcs.cat.${field}`,Number.EPSILON);
 number('npcs.cat.hurtSpeedMultiplier',Number.EPSILON,1);if(!Number.isInteger(config.npcs.cat.strokesRequired))fail('npcs.cat.strokesRequired','must be an integer');
 return config;
}
