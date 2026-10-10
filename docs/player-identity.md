# Characters and player identity

The picker, room roster and server support four stable character IDs: 0 CS Student Boy (the original model), 1 CS Student Girl (replacing Student Athlete), 2 Albert Einstein (unchanged), and 3 Rector Dissertori. All use the same articulated running, jumping, sliding and first-person rig. The girl has fair skin, blonde tied-back hair, a green campus top and jeans. The rector has rectangular glasses, swept-back grey hair with silver temples, a matching charcoal suit with lapels, a light shirt, burgundy tie and dark shoes. The start menu shows character names without outfit descriptions.

The simplified rector was drawn in procedural geometry using [ETH's official Günther Dissertori portrait](https://ethz.ch/en/the-eth-zurich/organisation/executive-board/rector.html) as a visual reference. The photograph itself is not shipped with the game.

During play, other players have camera-facing name tags sourced from server-owned room member names. The local name appears only with the third-person body. Labels move lower for slides, falls and riding, and respect scene depth. Names are drawn as text on a canvas rather than interpreted as HTML; changes replace and dispose the previous texture.

Remote players have a faint red inverted-hull outline. Their animated mesh pieces are expanded into one combined geometry, so the outline adds one draw call per player and follows all joints. It uses normal depth testing and does not show through walls. The owner receives no red outline. Label textures/materials and outline geometry/materials are disposed on avatar removal, room exit and character replacement.

The movement preview includes all four outfits with name/outline examples. Checks cover four-rig animation and first-person poses, character validation and live fourth-character replication, name updates, outline animation/depth settings, resource disposal and existing room/network behavior.
