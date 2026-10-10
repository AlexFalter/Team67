Hand anatomy, UVs, skin texture and authored grip poses by DigitalN8m4r3 (Miodrag Sejic), from Godot XR Tools, CC0 1.0. See License.md.

Source: https://github.com/GodotVR/godot-xr-tools/tree/master/addons/godot-xr-tools/hands

build-first-person-hand.py loads the original Blender rig to preserve bone axes, bakes a reverse knife grip and relaxed walking pose, adds the game's cream hoodie sleeve, and exports only the first-person asset. No world geometry or collision changes.

Rebuild from the project root:
/Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --python assets/blender/build-first-person-hand.py
