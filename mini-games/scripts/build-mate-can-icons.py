"""Crop one can from each existing product image; preserve source assets."""
import subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
output=root/'public/assets/tony-mate/cans';output.mkdir(parents=True,exist_ok=True)
for flavor,crop in [('basic','510:990:600:865'),('light','510:990:600:865'),('mint','550:950:50:300'),('ginger','550:950:50:300')]:
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(root/f'public/assets/tony-mate/{flavor}.png'),'-vf',f'crop={crop},scale=256:-1','-frames:v','1',str(output/f'{flavor}.png')],check=True)
