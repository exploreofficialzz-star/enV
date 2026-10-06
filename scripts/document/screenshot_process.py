#!/usr/bin/env python3
import sys, os, json, re
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont

def main():
 op=sys.argv[1]; outdir=Path(sys.argv[2]); paths=[Path(x) for x in sys.argv[3:]]; p=paths[0]; img=Image.open(p).convert('RGBA'); outdir.mkdir(parents=True,exist_ok=True)
 family=re.match(r'^([^-]+(?:-[^-]+)*)-',op)
 # use tool naming to select a device family; output is an original frame, never a vendor screenshot
 dark='dark' in op
 pad=80 if 'frame' in op or 'mockup' in op or 'presentation' in op else 48
 if 'collage' in op and len(paths)>1:
  thumbs=[]
  for x in paths:
   im=Image.open(x).convert('RGB'); im.thumbnail((720,720),Image.Resampling.LANCZOS); thumbs.append(im)
  w=sum(i.width for i in thumbs)+pad*(len(thumbs)+1); h=max(i.height for i in thumbs)+pad*2; canvas=Image.new('RGB',(w,h),'#111827' if dark else '#f3f4f6'); x=pad
  for i in thumbs: canvas.paste(i,(x,pad)); x+=i.width+pad
  out=outdir/(p.stem+'-collage.png'); canvas.save(out); print(json.dumps({'path':str(out),'mime':'image/png','name':out.name})); return
 bg='#111827' if dark else '#f3f4f6'; canvas=Image.new('RGBA',(img.width+pad*2,img.height+pad*2),bg); canvas.alpha_composite(img,(pad,pad))
 d=ImageDraw.Draw(canvas)
 if 'frame' in op or 'mockup' in op:
  d.rounded_rectangle((2,2,canvas.width-3,canvas.height-3),radius=32,outline='#6b7280',width=8)
  d.ellipse((canvas.width//2-6,18,canvas.width//2+6,30),fill='#111827')
 if 'beautifier' in op: d.rounded_rectangle((pad//2,pad//2,canvas.width-pad//2,canvas.height-pad//2),radius=24,outline='#d1d5db',width=2)
 if 'redaction' in op: d.rectangle((img.width//4+pad,img.height//4+pad,img.width*3//4+pad,img.height//4+pad+60),fill='#000000')
 if 'annotation' in op: d.line((pad+30,pad+30,pad+img.width//2,pad+img.height//3),fill='#ef4444',width=8); d.polygon([(pad+img.width//2,pad+img.height//3),(pad+img.width//2-20,pad+img.height//3-8),(pad+img.width//2-8,pad+img.height//3-25)],fill='#ef4444')
 if 'presentation' in op: d.text((pad,pad//2),p.stem,fill='#111827' if not dark else '#ffffff')
 if 'lock-screen' in op or 'lockscreen' in op: d.text((pad+20,pad+40),'12:00',fill='#ffffff',stroke_width=2,stroke_fill='#000000')
 out=outdir/(p.stem+'-env.png'); canvas.save(out); print(json.dumps({'path':str(out),'mime':'image/png','name':out.name}))
if __name__=='__main__': main()
