"""Build recorded vehicle loops; source credits are in public/audio/CREDITS.md."""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parent.parent
source=root/'artifacts/vehicle-audio'
out=root/'public/audio'
def edit(name,file,start,length,loop=False,low=6000):
    filters=f'highpass=f=45,lowpass=f={low},loudnorm=I=-20:TP=-3:LRA=7,aresample=44100'
    if loop:
        # Wrap the end into the beginning, rather than fading every loop to silence.
        graph=f'[0:a]{filters},asplit=3[h][b][t];[h]atrim=0:0.3,asetpts=PTS-STARTPTS[head];[b]atrim=0.3:{length-.3},asetpts=PTS-STARTPTS[body];[t]atrim={length-.3}:{length},asetpts=PTS-STARTPTS[tail];[tail][head]acrossfade=d=0.3:c1=tri:c2=tri[seam];[body][seam]concat=n=2:v=0:a=1[a]'
    else:graph=f'[0:a]{filters},afade=t=in:d=0.015,afade=t=out:st={length-.06}:d=0.06[a]'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(start),'-t',str(length),'-i',str(source/file),'-filter_complex',graph,'-map','[a]','-ac','1','-ar','44100','-c:a','libmp3lame','-b:a','128k',str(out/(name+'.mp3'))],check=True)
edit('bus-engine','WWS_CityBusMANSG220engine.ogg',20,10,True,3500)
edit('car-engine','5_cylinder_engine_sound.ogg',3,8,True,3500)
edit('rail-running','Tatra_RT6N1_Engine_Sound.ogg',25,12,True,4500)
edit('vehicle-door','Tram_doors_open_and_close_hiss_and_beeping.ogg',0,2)
edit('footstep-left','Concrete_Steps_2.ogg',0,.32,False,6000)
edit('footstep-right','Concrete_Steps_2.ogg',.59,.21,False,6000)
edit('collision-thud','Knocking_on_wood_or_door.ogg',2.36,.23,False,2000)
