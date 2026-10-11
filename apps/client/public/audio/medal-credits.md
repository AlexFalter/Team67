Private-property encounter uses a 4.45-second excerpt of the real "Hit the road, dude" / "This is private property" recording, not synthesized speech.

Original viral upload: @bird28thegr8, as documented at https://knowyourmeme.com/memes/lock-em-up
Audio excerpt source: https://www.snapchat.com/@yano8544/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYc2lwdW91Zmt0AZ8UWC5HAZ8UV5hQAAAAAw (repost by @yano8544; source offsets 17.15–21.60 seconds).

Rights remain with the original recording's owner; this is a short meme quotation for the hackathon prototype. No voice cloning or generated imitation was used.

Finance Guy encounter uses a 9.5-second, single-speaker edit of the original SRF Dokus & Reportagen recording, “Roman der Finance Guy 😎✨ | #Shorts”, published at https://www.youtube.com/watch?v=Md6pO_m2HKs (the exact video linked by the user). Only his answers are kept; interviewer questions, acknowledgements and prompts are omitted.

Source offsets, in order: 37.800–39.000 (Sales), 40.980–43.120 (ETFs), 44.840–46.660 (Asset Manager), 54.480–58.280 (Market). Each join has a 180 ms pause; each clip has 15 ms/25 ms edge fades. Audio is transcoded to 128 kbps MP3 without synthetic speech, voice cloning or changed playback speed. The cut list is assets/audio/finance-guy-edit.json; rebuild with python3 scripts/edit-finance-audio.py. Original audio/video and captions are cached under artifacts/finance-guy-reference*. Rights remain with the original recording owner.

Polybahn 6–7 kid uses the original kid’s voice from Cam Wilder’s “MY OVERPOWERED AAU TEAM HAS FINALLY RETURNED!”, https://www.youtube.com/watch?v=yd4Zdpl5qBA . Origin reference: https://knowyourmeme.com/memes/67-kid . Corrected source offsets 808.650–810.008 seconds (the actual “six seven” shout, verified against the cached source; the earlier cut contained only “yeah”) are transcoded to MP3 with tiny edge fades and a 500 ms trailing pause; the game plays the clip once per game. The cached exact source excerpt begins at 806 seconds: artifacts/six-seven-kid-reference.webm. The song is not used; no synthetic voice or voice cloning is used. Rights remain with the recording owner.

Tourist photo encounter uses two short actual dialogue recordings: “Hey, will you, um, take a picture of us?” from Blue Bloods S06E07 (https://clip.cafe/blue-bloods-2010/wow-s100/), source clip offsets 3.600–6.980 seconds; and “Thank you so much” from Flesh and Blood S01E03 (https://clip.cafe/flesh-blood-2020/thank-you-much-thank-you-thank-you-s1/), offsets 0.000–1.150 seconds. Public source clips are cached as artifacts/tourist-request-reference.mp4 and artifacts/tourist-thanks-reference.mp4. Excerpts have tiny edge fades and are transcoded to 128 kbps MP3; no generated speech, voice cloning, or accent imitation. Rights remain with the recording owners.

Polybahn food enthusiast: brief original voice and eating-sound excerpts from the user-provided reel https://www.instagram.com/reel/DcIu3C2O4Hw/ . Source offsets: 0–2.38 (lunch), 21.10–23.35 (question), 24.22–25.72 (closer), 51.85–57.95 (three eating reactions), 65.05–65.87 (delicious). Cached source artifacts/polybahn-eater-reference.mp4; timing reference artifacts/polybahn-eater-transcript.json. Original German speech, normal playback speed, edge fades, no voice cloning. Game dialogue choices are newly written. Rights remain with the recording owner.

Bridge Lime trio: original recorded meme dialogue. The complete “Komm nach Frankfurt, wir kämpfen” quote comes from https://tuna.voicemod.net/sound/0f6899ee-a136-4de9-bdf6-5bb42a57c733 (public audio credited to luiviton; cached artifacts/frankfurt-quote-reference.mp3). The supplied TikTok https://vm.tiktok.com/ZGdCkyQJ4/ resolves to https://www.tiktok.com/@twitch.clips084/video/7591988677685808416 and begins midway through that quote. Current replies use the opening exchange from the supplied TikTok: 1.020–3.390 (the Frankfurt lead-in and “Du bist mir nicht mal den Tank wert”), 4.190–5.320 (“Ich bezahl dir den Tank”), and 6.040–9.370 (“Ach, ich nehme kein Geld von Frauen. Ich zahle dich, ich zahle dich”). Cut list: assets/audio/frankfurt-scooter-edit.json; rebuild with python3 scripts/edit-scooter-audio.py. Cached source artifacts/frankfurt-scooter-reference.mp4 with source metadata/transcript alongside it. Audio has tiny edge fades, normal playback speed and no generated voice or cloning. Rights remain with the recording owners.

Scooter dialogue playback joins the selected original voice recordings into frankfurt-dialogue.mp3, with 250 ms gaps and balanced levels. Rebuild with python3 scripts/edit-scooter-audio.py followed by python3 scripts/build-scooter-dialogue.py. Source seeking precedes decoding so fades apply to each trimmed clip; the join script rejects silent audio. Captions follow recorded cue timestamps.

## Tourist Mandarin greeting (current)

“WIKITONGUES: Ying speaking Henan Chinese”, Wikitongues and Ying Li (2017), https://commons.wikimedia.org/wiki/File:WIKITONGUES-_Ying_speaking_Henan_Chinese.webm . CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/ . Edited excerpt `tourist-mandarin-greeting.mp3`, 0.000–1.120 seconds of the 240p Commons transcode, retains the natural voice and speed; high/low-pass filtering, loudness normalization and short edge fades. This edited audio is distributed under CC BY-SA 4.0. No endorsement by the speaker or Wikitongues is implied. Original greeting: “Hello, everyone!” The photo request is separately written game dialogue, not a translation of this recording. The previous English request and thanks recordings are no longer played. `tourist-mandarin-goodbye.mp3` is the farewell at 214.800–217.900 seconds of the same 240p transcode, “That’s all for today. Bye!”, edited with the same filters and normalization and distributed under CC BY-SA 4.0. The published subtitles have a timing offset relative to this transcode; cuts were checked against its audio.

## Recorded vehicle sounds

- `bus-engine.mp3`: 20–30s of “WWS CityBusMANSG220engine.ogg”, Work With Sounds / Technical Museum of Slovenia, recordist Dušan Oblak. https://commons.wikimedia.org/wiki/File:WWS_CityBusMANSG220engine.ogg . CC BY 4.0 https://creativecommons.org/licenses/by/4.0/ .
- `car-engine.mp3`: 3–11s of “5 cylinder engine sound.ogg”, Jonas Tittmann. https://commons.wikimedia.org/wiki/File:5_cylinder_engine_sound.ogg . CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0/ . Edited sample distributed under the same license.
- `rail-running.mp3`: 25–37s of “Tatra RT6N1 Engine Sound.ogg”, Dawidpl4553. https://commons.wikimedia.org/wiki/File:Tatra_RT6N1_Engine_Sound.ogg . CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0/ . Edited sample distributed under the same license. Used as a general rail bed for tram and Polybahn; not an exact Zurich vehicle recording.
- `vehicle-door.mp3`: 0–2s of “Tram doors open and close hiss and beeping.ogg”, stephan / PDSounds, public domain. https://commons.wikimedia.org/wiki/File:Tram_doors_open_and_close_hiss_and_beeping.ogg .

Edits: mono conversion, filtering, loudness normalization, circular 300ms loop crossfade (engine/rail beds), short edge fades (door). Rebuild with `python3 scripts/edit-vehicle-audio.py` using cached originals in `artifacts/vehicle-audio`. No endorsement is implied. Generic footsteps, splash, crash, shutter and jump effects remain synthesized; vehicle oscillators and pitch sweeps have been removed.

Opening ETH Link bus: original Fortnite Battle Bus recording from https://memesoundeffects.com/fortnite-battle-bus-sound-effect/ (direct media: https://media.memesoundeffects.com/2023/08/Fortnite-Battle-Bus-Sound-Effect.mp3). Cached original: artifacts/fortnite-bus-original.mp3. Runtime excerpt: first 7 seconds, 400 ms end fade, normal playback speed, 128 kbps MP3. Plays once at intro start, stops on skip/exit, restarts without overlapping on replay. Original game audio belongs to Epic Games; no synthesized imitation.

## Movement and collision recordings

`footstep-left.mp3` (0–0.32s) and `footstep-right.mp3` (0.59–0.80s): “Concrete Steps 2.ogg”, Pwaivers (2013), https://commons.wikimedia.org/wiki/File:Concrete_Steps_2.ogg , CC BY-SA 3.0 https://creativecommons.org/licenses/by-sa/3.0/ . Edited samples distributed under that same license. `collision-thud.mp3` (2.36–2.59s): “Knocking on wood or door.ogg”, stephan / PDSounds, public domain, https://commons.wikimedia.org/wiki/File:Knocking_on_wood_or_door.ogg . Used for bump/landing impact feedback. Edits: mono, filtering, loudness normalization and edge fades. Rebuild with scripts/edit-vehicle-audio.py. No endorsement implied. Footsteps, jump takeoff and landings now use recordings, superseding the synthesized footstep/jump description above.

Tourist randomized Mandarin dialogue: twelve original game lines rendered with the installed macOS Tingting synthetic voice, normal Mandarin speech, no voice cloning. English translations and audio IDs are paired in tourist-voice-lines.js; rebuild with scripts/build-tourist-voices.py. These replace the two previously used Wikitongues clips at runtime.

## Tim Gio football reaction

Source supplied by the user: https://www.tiktok.com/@timgioh.clips_/video/7651330354875272481 (short link https://vm.tiktok.com/ZGdCkEf8y/), “Timgioh reagiert auf Deutschland 7:1 Curacao (ALLE TORE)”, @timgioh.clips_.

- `timgio-germany.mp3`: original clip 00:02.35–00:03.65, Germany goal call.
- `timgio-curacao.mp3`: original clip 00:22.35–00:24.75, Curaçao goal call.

Edited with short edge fades and loudness normalization to -18 LUFS / -2 dBTP. These are original recording excerpts, not synthesized or cloned speech. No open reuse licence was supplied; this attribution does not grant redistribution rights.

### Tim Gio ambient celebration edit

Same user-supplied reference as above. New excerpts use -20 LUFS / -3 dBTP and 25 ms / 100 ms edge fades:

| File | Original start | Length |
| --- | --- | --- |
| timgio-goal-1.mp3 | 00:02.40 | 1.10 s |
| timgio-goal-2.mp3 | 00:31.55 | 1.50 s |
| timgio-goal-3.mp3 | 00:47.90 | 1.10 s |
| timgio-goal-4.mp3 | 01:01.20 | 2.30 s |
| timgio-goal-5.mp3 | 01:20.15 | 1.80 s |
| timgio-goal-6.mp3 | 01:22.50 | 1.60 s |
| timgio-goal-7.mp3 | 01:35.90 | 1.20 s |
| timgio-curacao.mp3 | 00:22.35 | 2.00 s |
| timgio-funny.mp3 | 01:58.90 | 2.40 s |

The runtime plays the eight celebrations sequentially with silent gaps and distance falloff. The funny ending excerpt is reserved for conversation.

### Black Ops III medal earned

`bo3-medal-earned.mp3`: original Treyarch/Activision Black Ops III multiplayer beta medal effect, sourced from Bizargh's extraction linked in [the Sound Collection archive](https://steamcommunity.com/groups/bizarchivistsoundproject/discussions/2/152391995421803915/). Archive: `Call of Duty Black Ops III Multiplayer Beta Sound, VO & Music.zip`; entry: `snd/all/mpl/medal_earn/medal_earned.LN100.pc.snd.flac` (173761 bytes, ZIP CRC32 732D11AA). Converted to 192 kbps MP3 without pitch, duration or waveform effects. This is the beta recording; retail byte identity has not been established. Attribution does not grant a redistribution licence.

`timgio-hol-ihn-raus.mp3`: original 00:41.00–00:44.00, the response selected by the user. Same -20 LUFS / -3 dBTP edit and fades. The current conversation uses this response; the previous funny ending clip is no longer loaded. Current ambient order: Germany 1, Curaçao equaliser, Germany 2 through 7.

### Nerf AWP mechanical sounds

`audio/awp/bo3-{bolt-up,bolt-back,bolt-forward,bolt-down,mag-out,mag-in}.mp3` use six original `fly_dsr50_*_00.LN100.pc.snd.flac` recordings from the same **Black Ops III Multiplayer Beta Sound, VO & Music.zip** archive and Sound Collection source linked above. Archive directory: `snd/all/fly/weapon/reload/sniper/dsr50/`. Each extracted file was checked against its ZIP CRC32, then transcoded to 128 kbps MP3 without pitch, speed, or sound-design effects. Runtime gain is 0.32. These are beta archive recordings; retail identity has not been established. Rights remain with Treyarch/Activision. Exact entries, offsets, sizes and CRCs are recorded in `assets/audio/awp-cod-sources.json`.

The clips play separately at the magazine-removal/insertion and bolt lift/back/forward/lock animation phases. No synthesized replacement mechanical sounds are used.

## Nerf AWP firing sound

“Nerf Hammershot Dart Shot” by ImAFoley (2020), Freesound sound 516745, CC0 1.0.
Source: https://freesound.org/people/ImAFoley/sounds/516745/
License: https://creativecommons.org/publicdomain/zero/1.0/
Downloaded HQ preview: https://cdn.freesound.org/previews/516/516745_7117640-hq.mp3
The shot at 2.474 seconds is trimmed to 0.46 seconds, converted to mono, filtered at 80 Hz / 12 kHz, given a short fade and mild compression, and saved as `awp/nerf-fire.mp3`. Playback gain is 0.65. This replaces the synthesized firing tone; bolt/reload recordings remain separate.
