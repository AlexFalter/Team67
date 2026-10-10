# Campusless · Final Exam

Open `/minigames/eth-blur` for a looping, skippable HG tutorial, then start the exam. The old development URL also opens the game. No browser storage or curation UI is used.

User-approved pools are hardcoded in `buildings.ts`:
- Easy: HG, CAB, HIL
- Medium: HCI, CHN, LEE, CLA, HPH, LFW, ML
- Hard: NO, ETZ, HXE, MM
- OG: HWW, HWO

Each pool is shuffled once: Easy → Medium → Hard → OG. Correct guesses and skips advance through the pool without repeats. After the final OG building, the game ends automatically; the final clock can also end it earlier.

Pixelation uses six fixed reveal steps (32, 48, 72, 112, 192 columns, then the original image), with 1000, 800, 600, 400, 200, 100 points respectively. The entire image is contained within a responsive frame, without cropping. Photo and reveal controls occupy the left column on wider screens, with search and suggestions on the right; narrow screens stack them. The page fits the viewport while the list alone scrolls. Wrong unique guesses deduct 100 points (minimum 50). Red animations show the actual reduction in available points for mistakes and reveals. Reveal progresses only via the prominent button, one step at a time; the six segments are a read-only meter. Difficulty pools advance automatically in the background. Skips earn zero.

Select a suggestion then submit with Guess or Enter. The building list is visible immediately and scrolls within a persistent scrollbar, showing at most five rows. Search, arrow keys, Enter, and browsing support photos and footprint/location previews. HPH also accepts the hidden aliases “Physikgebäude” and “Physics building”. Correct answers show the complete image for 550ms before advancing; the clock keeps running.

The standalone clock defaults to 30 seconds and starts once the first photo loads. Add `?time=120` for a two-minute debug session, e.g. `/minigames/eth-blur?time=120`. Positive whole seconds from 1 to 86400 are accepted; invalid values fall back to 30. Restart uses the same configured duration. An external `remainingSeconds` clock takes precedence over the URL setting. Mount `<EthBlur remainingSeconds={finalClockSeconds} onComplete={handleFinalScore} />` to use the external final clock; completion fires once when the clock expires or the deck is completed. No external counter is connected here.

Photos are downloaded from ETH’s official exterior-photo service, `https://www.files.ethz.ch/webrelaunch/gebaeude/bilder/CODE.jpg`. Source links are retained per building. Footprint/location SVGs come from the official ETH building orientation directory; they are site plans, not interior floor plans. Assets are bundled locally.
