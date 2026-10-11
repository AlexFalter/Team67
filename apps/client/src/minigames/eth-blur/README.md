# Campusless · Final Exam

Open `/dev/exam/game?time=180` to test the exam directly, or `/dev/exam` for the ETH entrance transition followed by the exam. `/minigames/eth-blur` and `/dev/eth-blur` also open the game. No browser storage or curation UI is used.

User-approved pools are hardcoded in `buildings.ts`:
- Easy: HG, CAB, HIL
- Medium: HCI, CHN, LEE, CLA, HPH, LFW, ML
- Hard: NO, ETZ, HXE, MM
- OG: HWW, HWO

Each pool is shuffled once: Easy → Medium → Hard → OG. Correct guesses and skips advance through the pool without repeats. After the final OG building, the game ends automatically; the final clock can also end it earlier.

The light exam page follows the first page of the supplied ETH exam template: an enlarged multilingual letterhead, locally bundled Computer Modern fonts, its date and “DO NOT OPEN!” text. The heading reads “Advanced BS”, with the date and seal below it. Staff names, the department label, header navigation and the bottom assessment section are omitted. The sheet fills the viewport with a narrow outer margin and the letterhead has 10% side margins. Oversized letter slots are centered in the left answer panel, beside the building photograph; narrow screens stack the page with the photo first. The large countdown sits above “Type Building Code”; Submit, Reveal and Skip buttons sit below the input, followed by the green-to-yellow-to-red point indicator.

Pixelation uses six fixed reveal steps (32, 48, 72, 112, 192 columns, then the original image), with 1000, 800, 600, 400, 200, 100 points respectively. The entire image is contained within a responsive frame, without cropping. Wrong unique guesses deduct 100 points (minimum 50). Red animations show the actual reduction in available points for mistakes and reveals. Reveal progresses via Right Arrow or its button, one step at a time. Difficulty pools advance automatically in the background. Skips earn zero.

Type a building code and press Enter to submit. Enter always submits the typed answer, even if a button has focus. Right Arrow reveals more detail without changing the building; only the Skip building button skips. Held keys do not repeatedly submit or reveal, and the shortcuts are inactive after completion. A single native text input renders one underscore slot per letter of the current code, supports normal editing and paste, and normalises letters to uppercase. It receives focus immediately, including while the photograph loads, and regains focus after a wrong answer, reveal, or next question. There is no building reference directory or default photograph instruction; answer feedback appears only after an attempt. Correct answers show the complete image for 550ms before advancing; the clock keeps running.

The standalone clock defaults to 30 seconds and starts once the first photo loads. Add `?time=120` for a two-minute debug session, e.g. `/minigames/eth-blur?time=120`. Positive whole seconds from 1 to 86400 are accepted; invalid values fall back to 30. The exam cannot be restarted from the results screen. An external `remainingSeconds` clock takes precedence over the URL setting. The real portal supplies the existing server round deadline, so travel and the entrance animation consume the same three-minute budget. `onProgress({ score, correct, completed })` fires immediately for each correct answer and once on completion; MapViewer forwards it through MapGame to the server. `onComplete(score)` fires once when the clock expires or the deck is completed. Standalone practice and preview routes do not send multiplayer score reports.

Photos are downloaded from ETH’s official exterior-photo service, `https://www.files.ethz.ch/webrelaunch/gebaeude/bilder/CODE.jpg`. Source links are retained per building. Footprint/location SVGs come from the official ETH building orientation directory; they are site plans, not interior floor plans. Assets are bundled locally.
