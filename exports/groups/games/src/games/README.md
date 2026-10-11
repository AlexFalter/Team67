# Games and mini-games

Import from `src/games/index.js`. This groups PubliBike scan/hold-still/stutter logic, Moodle quiz questions, random quiz events, failure reactions and shared scan progress. Vehicles own movement; interactions own the world object and resulting item; games own the challenge.

Ticket CAPTCHA and Jane Street's fill-in-the-blank currently stay inside their machine/quest implementations. They can be shared through the `tickets` and `interview` feature exports; this roster does not pretend those puzzles have independent APIs yet. When a puzzle is extracted, add its factory here.

Use `npm run features:export -- games --out exports/next` to export the group. Existing constructor arguments, update/input/reset contracts and callbacks are unchanged.

The implementations now live here in `bike-scan/` and `quizzes/`. PubliBike models, station and riding stay under `../vehicles/publibike/`; the phone handset/app presentation stays under `../ui/phone/`. See [the code map](../README.md) for adding a feature.
