"""Split the user-provided recording into complete contiguous goal sections."""
import argparse
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path, help='Path to the user-provided MP4')
args = parser.parse_args()
edit = json.loads((root / 'assets/audio/timgio-goal-edit.json').read_text())
actual = float(subprocess.check_output([
    'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', str(args.source)
], text=True).strip())
if abs(actual - edit['sourceDuration']) > .1:
    raise ValueError(f'Expected {edit["sourceDuration"]:.3f}s recording, got {actual:.3f}s; review cut points for this source.')
segments = edit['segments']
assert segments[0]['start'] == 0 and segments[-1]['end'] == edit['sourceDuration']
assert all(a['end'] == b['start'] for a, b in zip(segments, segments[1:]))
for section in [*segments, edit['reply']]:
    duration = section['end'] - section['start']
    assert duration > 0
    output = root / 'public/audio' / section['file']
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
        '-ss', str(section['start']), '-t', str(duration), '-i', str(args.source),
        '-vn', '-af', f'afade=t=in:d=0.015,afade=t=out:st={duration-.015}:d=0.015,'
        f'loudnorm=I={edit["loudnessLUFS"]}:TP={edit["peakDb"]}:LRA=7',
        '-c:a', 'libmp3lame', '-b:a', '128k', str(output)
    ], check=True)
    print(f'{section["file"]}: {section["start"]:.3f}–{section["end"]:.3f} ({duration:.3f}s)')
print(f'All {actual:.3f}s covered once across {len(segments)} goal sections; no skipped source intervals.')
