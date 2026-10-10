import subprocess
from pathlib import Path
source=Path('artifacts/tourist-mandarin-small.webm')
for name,start,duration in [('greeting',0,1.12),('goodbye',214.8,3.1)]:
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-ss',str(start),'-t',str(duration),'-vn','-af',f'highpass=f=90,lowpass=f=10000,afade=t=in:d=0.005,afade=t=out:st={duration-.04}:d=0.04,loudnorm=I=-18:TP=-2:LRA=7','-codec:a','libmp3lame','-b:a','128k',f'public/audio/tourist-mandarin-{name}.mp3'],check=True)
