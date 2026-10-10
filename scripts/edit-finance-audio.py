"""Build the NPC's single-speaker edit from the cached original SRF recording."""
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
edit = json.loads((root / 'assets/audio/finance-guy-edit.json').read_text())
segments = edit['segments']
filters = []
for i, clip in enumerate(segments):
    duration = clip['end'] - clip['start']
    pad = f",apad=pad_dur={edit['gapSeconds']}" if i < len(segments) - 1 else ''
    filters.append(
        f"[0:a]atrim=start={clip['start']}:end={clip['end']},asetpts=PTS-STARTPTS,"
        f"aresample=48000,afade=t=in:d=0.015,afade=t=out:st={duration - 0.025:.6f}:d=0.025"
        f"{pad}[clip{i}]"
    )
filters.append(''.join(f'[clip{i}]' for i in range(len(segments))) + f'concat=n={len(segments)}:v=0:a=1[out]')
subprocess.run([
    'ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(root / 'artifacts/finance-guy-reference.webm'),
    '-filter_complex', ';'.join(filters), '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '128k',
    '-y', str(root / 'public/audio/finance-guy.mp3')
], check=True)
expected = sum(c['end'] - c['start'] for c in segments) + edit['gapSeconds'] * (len(segments) - 1)
print(f'Built {len(segments)} Finance Guy answers; {expected:.2f}s including pauses.')
