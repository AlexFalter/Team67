"""Join the selected original recordings into one browser playback stream."""
import json
import subprocess
import struct
from pathlib import Path
root = Path(__file__).resolve().parents[1]
edit = json.loads((root / 'assets/audio/frankfurt-scooter-edit.json').read_text())
clips = [{'file': 'frankfurt-scooter.mp3', 'caption': 'Komm nach Frankfurt, wir kämpfen!', 'speaker': 'FRONT RIDER'}, *edit['clips']]
rate = 48000
joined = bytearray()
cues = []
for clip in clips:
    name = clip['file']
    pcm = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(root / 'public/audio' / name), '-f', 'f32le', '-ac', '1', '-ar', str(rate), '-'])
    values = struct.unpack('<' + 'f' * (len(pcm) // 4), pcm)
    peak = max(abs(v) for v in values)
    if peak < .01:
        raise ValueError(f'{name} has no audible recording')
    # Preserve the voice while giving each short reply the same peak level.
    gain = min(3, .85 / peak)
    cues.append({'start': len(joined) / 4 / rate, 'end': (len(joined) + len(pcm)) / 4 / rate, 'file': name, 'caption': clip['caption'], 'speaker': clip['speaker']})
    joined.extend(struct.pack('<' + 'f' * len(values), *(v * gain for v in values)))
    joined.extend(bytes(int(.25 * rate) * 4))
subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(rate), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '128k', '-y', str(root / 'public/audio/frankfurt-dialogue.mp3')], input=joined, check=True)
(root / 'assets/audio/frankfurt-dialogue-cues.json').write_text(json.dumps(cues, indent=2) + '\n')
print(json.dumps(cues))
