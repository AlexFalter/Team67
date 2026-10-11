# Encounter input audit — 2026-10-11

The current client uses one Escape priority: close the phone first, then an
optional interaction; otherwise open the game menu without cancelling a
mandatory encounter. The multiplayer clock and scripted scenes keep running.
NPC input is routed by `NpcFeature.keydown`; normal movement remains disabled
until the encounter completes.

| Encounter | Escape | Phone |
| --- | --- | --- |
| Helicopter flight, parachute and landing | Open menu; resume restores ride input | Available; opening releases capture, closing returns to ride |
| Finance, inspector and scooter dialogue | Open menu without skipping dialogue | Available over the conversation |
| Private-property and teleport sequences | Open menu without skipping the sequence | Deferred during forced travel |
| 6–7 kid, food enthusiast, Einstein, Michael and Tim Gio dialogue | Close dialogue; a later Escape opens the menu | Available; closing returns to dialogue |
| Jane Street laptop | Close the coding panel | Deferred while coding |
| Polybahn ticket purchase / QR scanner | Close or cancel the active app | Deferred while the app is active |
| Tourist and Lime parking photos | Open menu; resume returns to required photo | Keep the camera app active |
| Mate machine and PubliBike scanner | Close interaction without also pausing | Deferred while the app is active |
| Map and emote wheel | Their existing handlers close the overlay and consume Escape | Existing availability gates prevent competing overlays |
| ETH Link intro | Open menu; world sequence continues | Available after the intro |

## Corrections

- Releasing capture now also applies when a phone opens inside an encounter
  that already saved the player's camera/input state.
- Phone close explicitly requests ride capture during the closing gesture.
  This handles a quick open/close between frames and browsers that require
  a fresh gesture instead of an automatic frame-based request.
- The phone has one keyboard route. Typing P in a dialogue field cannot reach
  it through the generic feature loop.
- Optional interactions consume Escape before GameControls can toggle its menu.
  Mate now consumes its keys too, fixing dismissal followed by accidental pause.
- Phone close restores prior UI focus before the host restores gameplay focus.
- Phone and pause overlays render above NPC dialogues. Underlying NPC panels
  become inert while another overlay owns input; paused photo aiming resets.
- Conversations can retain their state underneath the phone. Camera, payment,
  coding and forced-travel apps retain their own interface.
- The menu accepts keyboard resume during mandatory encounters, including the
  intro. Intro mouse-look and thanks input are disabled while the menu is open.

## Verification

Regression tests exercise the real NPC host dispatch across optional dialogues,
mandatory scenes, phone focus/capture handoff and pause input isolation. Related
camera, NPC, phone, Mate, PubliBike, emote and spectator tests also pass.

Browser checks use the actual game with simulated pointer lock. Passenger
dialogue components are mounted as UI fixtures under the real NPC host; the
checks cover phone layering and returning to the dialogue, Einstein/Michael
dismissal and text input, finance phone/pause/resume, required tourist photos
and Mate dismissal. These are UI checks, not a complete playthrough of every
quest or a test of native browser Escape interception.

The full helicopter browser check also passes: repeated phone open/close and
Escape/resume during flight, camera input isolation while the phone is open,
rejection reading, throw-out, replicated canopy, descent, landing and cleanup.
Screenshots of the in-flight phone and the pause menu over mandatory photos
were inspected. TypeScript, lint, production build and 77 related tests pass.
The normal ETH Link intro browser check passes Escape/keyboard resume, completes
the intro and restores the street camera and walking controls.
