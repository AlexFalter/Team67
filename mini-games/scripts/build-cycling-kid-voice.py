"""Extract the short original refrain from the official recording; no synthesis."""
from pathlib import Path
import argparse, subprocess, tempfile, json
root=Path(__file__).resolve().parents[1]
edit=json.loads((root/'assets/audio/cycling-kid-song-edit.json').read_text());duration=edit['end']-edit['start']
parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path);args=parser.parse_args()
with tempfile.TemporaryDirectory() as temp:
    folder=Path(temp)
    if args.source:
        source=args.source
    else:
        subprocess.run(['uv','run','--python','3.12','--with','yt-dlp','yt-dlp','--no-playlist','--download-sections',f"*0-{edit['end']+.5}",'-f','bestaudio/best','-o',str(folder/'official.%(ext)s'),edit['source']],check=True,capture_output=True)
        source=next(folder.glob('official.*'))
    subprocess.run(['ffmpeg','-y','-loglevel','error','-ss',str(edit['start']),'-i',str(source),'-t',str(duration),'-af',f"afade=t=in:d={edit.get('fadeInSeconds', .04)},afade=t=out:st={duration-edit.get('fadeOutSeconds', 1.55)}:d={edit.get('fadeOutSeconds', 1.55)}:curve=qsin",'-ar','48000','-ac','2',str(folder/'phrase.wav')],check=True)
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(folder/'phrase.wav'),'-af',f"apad=pad_dur={edit['pauseSeconds']}",'-c:a','libmp3lame','-b:a','160k',str(root/'public/audio'/edit['file'])],check=True)
