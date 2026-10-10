"""Cut complete scooter dialogue lines from the cached original recording."""
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
edit = json.loads((root / 'assets/audio/frankfurt-scooter-edit.json').read_text())
for clip in edit['clips']:
    duration = clip['end'] - clip['start']
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error',
        '-ss', str(clip['start']), '-i', str(root / edit['source']),
        '-t', str(duration), '-vn', '-af',
        f'afade=t=in:d=0.015,afade=t=out:st={duration-.025:.6f}:d=0.025',
        '-c:a', 'libmp3lame', '-b:a', '128k', '-y',
        str(root / 'public/audio' / clip['file']),
    ], check=True)
    print(f"{clip['file']}: {clip['caption']} ({duration:.2f}s)")
