PubliBike model copied from `mini-games/public/models/publibike.glb`.
The prototype authors it in `mini-games/assets/blender/build-publibike.py`.

Station placement, QR tags, scanning challenge, broken-bike probability,
and battery duration are adapted from the singleplayer prototype's
`src/vehicles/publibike/`, `src/games/bike-scan/`, and `game.config.json`.
The scanner displays the existing game scene; it does not access a real
camera, payment service, PubliBike account, or external API.
