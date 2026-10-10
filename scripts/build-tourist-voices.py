"""Build original Mandarin dialogue with macOS Tingting; no voice cloning."""
import json, subprocess, tempfile
from pathlib import Path
lines = {
 'request': [
  ('你好，可以帮我们拍两张照片吗？','Hi! Could you take two photos of us?'),
  ('不好意思，先帮我们拍一张竖着的照片吧。','Excuse me, could you take a vertical photo first?'),
  ('今天的风景真漂亮，能帮我们拍照吗？','The view is beautiful today. Could you take our photo?')],
 'sideways': [
  ('太好了！再横着拍一张，好吗？','Great! Could you take a sideways one as well?'),
  ('这张不错，再来一张横着的吧。','That looks good. Let’s take a horizontal one too.'),
  ('谢谢！把手机转过来，再拍一张。','Thanks! Turn the phone sideways and take another one.')],
 'thanks': [
  ('拍得真好，谢谢你！','Those look great. Thank you!'),
  ('这两张我们都很喜欢，太感谢了！','We love both photos. Thank you so much!'),
  ('谢谢，这下可以发给朋友了！','Thanks! Now we can send these to our friends!')],
 'goodbye': [
  ('谢谢帮忙，祝你今天愉快！','Thanks for helping. Have a lovely day!'),
  ('再见，祝你上课不迟到！','Bye! Hope you make it to class on time!'),
  ('谢谢摄影师，我们去找咖啡了！','Thank you, photographer! We’re off to find coffee!')]
}
manifest={}
with tempfile.TemporaryDirectory() as temporary:
 for stage, variants in lines.items():
  manifest[stage]=[]
  for i,(zh,en) in enumerate(variants):
   name=f'tourist-{stage}-{i+1}'
   intermediate=f'{temporary}/{name}.aiff'
   subprocess.run(['say','-v','Tingting','-r','190','-o',intermediate,zh],check=True)
   subprocess.run(['ffmpeg','-v','error','-y','-i',intermediate,'-af','loudnorm=I=-18:TP=-2:LRA=7','-codec:a','libmp3lame','-b:a','128k',f'public/audio/{name}.mp3'],check=True)
   manifest[stage].append(dict(id=name,zh=zh,en=en,src=f'/audio/{name}.mp3'))
Path('tourist-voice-lines.js').write_text('// Original Mandarin dialogue; rebuild with scripts/build-tourist-voices.py.\nexport const touristVoiceLines = '+json.dumps(manifest,ensure_ascii=False,indent=2)+';\n')
