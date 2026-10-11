# Supplied cow and longhorn — animated copies

These are copies of the meshes supplied in `cow.zip` and `low-poly-longhorn.zip`.
The original shapes and materials are retained. The longhorn's existing mirror
modifier was applied, its eye objects joined, and both models normalized to a
grounded, meter-scale orientation. Bones and skin weights were added.

## Outputs

- `supplied_cows_animated.blend`: both models, rigs, three clips each, packed sound.
- `cow.glb` and `longhorn.glb`: separate skinned game assets.
- `soft_moo.wav`: softened real cow recording.
- `sources/`: untouched extracted source Blender files.

Clips: `SlowWalk` (3.2 s, in place), `Moo` (4 s), `IdleWalkMoo` (12 s).
The combined clip walks gently, pauses, and moos at 6 seconds; play the WAV then.
The standalone Moo clip cues audio at 0.8 seconds. GLB cannot carry sound; the
Blender scene includes it. In Blender play frames 0–359 at 30 fps.
Movement and mouth motion are intentionally restrained to preserve the supplied
low-poly topology. The models are not connected to the game's controller.

The assets are Three.js building blocks: load the GLBs with `GLTFLoader` and
play their clips with `AnimationMixer`. PNG frames and preview exports were
removed; visuals can be added later.

## Sound attribution

“Mudchute cow 1” by Secretlondon, April 2007, Wikimedia Commons:
https://commons.wikimedia.org/wiki/File:Mudchute_cow_1.ogg

Used under Creative Commons Attribution–ShareAlike 3.0:
https://creativecommons.org/licenses/by-sa/3.0/

Changes: volume reduced to 48%, 1,800 Hz low-pass filter, converted to mono WAV.
The modified sound is distributed under the same CC BY-SA 3.0 license.
Model rights remain with their respective source owners; no model license is
inferred from the supplied ZIP files.

The rejected generated cow was removed from the active Blender scenes and moved
to `../.discarded/cow-2026-10-11/` for recovery. It is not used by these assets.
