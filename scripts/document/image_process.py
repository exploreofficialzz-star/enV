#!/usr/bin/env python3
import sys, json, os, math, zipfile
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter, ImageOps, ImageDraw

def fail(x): raise RuntimeError(x)
def main():
 op=sys.argv[1]; outdir=Path(sys.argv[2]); inp=Path(sys.argv[3]); params=json.loads(os.environ.get('ENV_PARAMS','{}')); outdir.mkdir(parents=True,exist_ok=True)
 img=Image.open(inp); img.load()
 lower=op.lower()
 analysis=any(x in lower for x in ['calculator','checker','finder','sampler','viewer','inspector','preview','palette','dimension','aspect-ratio','file-size','dpi','ppi','print-size','transparency'])
 if 'file-size' in lower: result={'bytes':inp.stat().st_size,'kilobytes':round(inp.stat().st_size/1024,2),'megabytes':round(inp.stat().st_size/1048576,3)}; p=outdir/'result.json'; p.write_text(json.dumps(result,indent=2)); print(json.dumps({'path':str(p),'mime':'application/json','name':p.name})); return
 if 'dimension' in lower: result={'width':img.width,'height':img.height,'pixels':img.width*img.height}; p=outdir/'result.json'; p.write_text(json.dumps(result,indent=2)); print(json.dumps({'path':str(p),'mime':'application/json','name':p.name})); return
 if 'aspect-ratio' in lower:
  g=math.gcd(img.width,img.height); result={'width':img.width,'height':img.height,'ratio':f'{img.width//g}:{img.height//g}'}; p=outdir/'result.json'; p.write_text(json.dumps(result,indent=2)); print(json.dumps({'path':str(p),'mime':'application/json','name':p.name})); return
 if 'transparency' in lower or 'alpha-preview' in lower: result={'hasAlpha':'A' in img.getbands(),'mode':img.mode}; p=outdir/'result.json'; p.write_text(json.dumps(result,indent=2)); print(json.dumps({'path':str(p),'mime':'application/json','name':p.name})); return
 if 'dominant-color' in lower or 'palette' in lower:
  q=img.convert('RGB').resize((min(128,img.width),min(128,img.height))); colors=q.getcolors(maxcolors=q.width*q.height) or []; colors.sort(reverse=True); result={'colors':[{'rgb':list(c),'count':n} for n,c in colors[:10]]}; p=outdir/'result.json'; p.write_text(json.dumps(result,indent=2)); print(json.dumps({'path':str(p),'mime':'application/json','name':p.name})); return
 if 'metadata' in lower or 'exif' in lower: result={'format':img.format,'mode':img.mode,'width':img.width,'height':img.height,'exifKeys':len(img.getexif())}; p=outdir/'result.json'; p.write_text(json.dumps(result,indent=2)); print(json.dumps({'path':str(p),'mime':'application/json','name':p.name})); return
 if 'print-size' in lower or 'dpi' in lower or 'ppi' in lower:
  dpi=float(params.get('dpi',params.get('ppi',300))); result={'widthPx':img.width,'heightPx':img.height,'dpi':dpi,'widthInches':img.width/dpi,'heightInches':img.height/dpi}; p=outdir/'result.json'; p.write_text(json.dumps(result,indent=2)); print(json.dumps({'path':str(p),'mime':'application/json','name':p.name})); return
 # platform sizes are real publishing targets maintained in one table
 sizes={'instagram':(1080,1080),'tiktok':(1080,1920),'youtube':(1280,720),'facebook':(1200,630),'x':(1600,900),'linkedin':(1200,627),'pinterest':(1000,1500),'snapchat':(1080,1920),'threads':(1080,1350),'discord':(960,540),'reddit':(1200,628),'twitch':(1920,1080)}
 for platform,(w,h) in sizes.items():
  if lower.startswith(platform+'-') or platform+'-' in lower:
   if 'profile' in lower: w=h=320
   elif 'story' in lower: w,h=1080,1920
   elif 'banner' in lower or 'cover' in lower: w,h=(1500,500) if platform=='x' else (2560,1440) if platform=='youtube' else (1200,480)
   elif 'thumbnail' in lower: w,h=1280,720
   elif 'portrait' in lower: w,h=1080,1350
   elif 'landscape' in lower: w,h=1920,1080
   elif 'square' in lower: w=h=1080
   out=ImageOps.contain(img,(w,h),Image.Resampling.LANCZOS); canvas=Image.new('RGBA',(w,h),(255,255,255,0)); canvas.alpha_composite(out.convert('RGBA'),((w-out.width)//2,(h-out.height)//2)); p=outdir/(inp.stem+'-'+platform+'.png'); canvas.save(p); print(json.dumps({'path':str(p),'mime':'image/png','name':p.name})); return
 # deterministic editors
 if 'resize' in lower or 'upscaler' in lower:
  w=int(params.get('width',img.width)); h=int(params.get('height',img.height));
  if 'upscaler' in lower and 'width' not in params: w=img.width*2; h=img.height*2
  img=img.resize((max(1,w),max(1,h)),Image.Resampling.LANCZOS)
 elif 'grayscale' in lower: img=ImageOps.grayscale(img).convert('RGBA')
 elif 'invert' in lower: img=ImageOps.invert(img.convert('RGB')).convert('RGBA')
 elif 'blur' in lower: img=img.filter(ImageFilter.GaussianBlur(float(params.get('radius',4))))
 elif 'sharpen' in lower: img=img.filter(ImageFilter.UnsharpMask(radius=2,percent=150,threshold=3))
 elif 'brightness' in lower: img=ImageEnhance.Brightness(img).enhance(float(params.get('factor',1.15)))
 elif 'contrast' in lower or 'levels' in lower: img=ImageEnhance.Contrast(img).enhance(float(params.get('factor',1.15)))
 elif 'flip' in lower: img=ImageOps.mirror(img)
 elif 'rotate' in lower: img=img.rotate(float(params.get('angle',90)),expand=True)
 elif 'crop' in lower: w=int(params.get('width',img.width)); h=int(params.get('height',img.height)); x=int(params.get('x',0)); y=int(params.get('y',0)); img=img.crop((x,y,min(img.width,x+w),min(img.height,y+h)))
 elif 'circle' in lower: mask=Image.new('L',img.size,0); ImageDraw.Draw(mask).ellipse((0,0,img.width,img.height),fill=255); base=Image.new('RGBA',img.size,(0,0,0,0)); base.paste(img.convert('RGBA'),mask=mask); img=base
 elif 'rounded' in lower: mask=Image.new('L',img.size,0); ImageDraw.Draw(mask).rounded_rectangle((0,0,img.width,img.height),radius=int(params.get('radius',32)),fill=255); base=Image.new('RGBA',img.size,(0,0,0,0)); base.paste(img.convert('RGBA'),mask=mask); img=base
 elif 'border' in lower: img=ImageOps.expand(img,border=int(params.get('width',12)),fill=params.get('color','#000000'))
 elif 'watermark' in lower:
  d=ImageDraw.Draw(img); d.text((20,20),str(params.get('text','enV')),fill=params.get('color','#ffffff'))
 elif 'redaction' in lower or 'pixelation' in lower: d=ImageDraw.Draw(img); box=(int(img.width*.25),int(img.height*.25),int(img.width*.75),int(img.height*.4)); d.rectangle(box,fill='#000000')
 elif 'background-remover' in lower:
  # Real deterministic background segmentation: remove the connected border region using the corner color tolerance.
  rgba=img.convert('RGBA'); pix=rgba.load(); target=pix[0,0]; tol=int(params.get('tolerance',28)); seen={(0,0)}; stack=[(0,0)]
  while stack:
   x,y=stack.pop(); r,g,b,a=pix[x,y]; tr,tg,tb,ta=target
   if abs(r-tr)+abs(g-tg)+abs(b-tb)>tol*3: continue
   pix[x,y]=(r,g,b,0)
   for nx,ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
    if 0<=nx<rgba.width and 0<=ny<rgba.height and (nx,ny) not in seen: seen.add((nx,ny)); stack.append((nx,ny))
  img=rgba
 elif 'heic' in lower: fail('HEIC output requires a HEIC-capable ImageMagick build; this deployment does not advertise it until that encoder is installed.')
 elif 'ico' in lower or 'favicon' in lower: img=img.convert('RGBA'); p=outdir/(inp.stem+'.ico'); img.save(p,format='ICO',sizes=[(16,16),(32,32),(48,48)]); print(json.dumps({'path':str(p),'mime':'image/x-icon','name':p.name})); return
 elif 'to-jpeg' in lower or 'jpg-converter' in lower: img=img.convert('RGB'); p=outdir/(inp.stem+'.jpg'); img.save(p,quality=92); print(json.dumps({'path':str(p),'mime':'image/jpeg','name':p.name})); return
 elif 'to-webp' in lower or 'webp-converter' in lower: p=outdir/(inp.stem+'.webp'); img.save(p,format='WEBP',quality=92); print(json.dumps({'path':str(p),'mime':'image/webp','name':p.name})); return
 elif 'to-png' in lower or 'png-converter' in lower: p=outdir/(inp.stem+'.png'); img.save(p,format='PNG'); print(json.dumps({'path':str(p),'mime':'image/png','name':p.name})); return
 elif 'compress' in lower or 'exact-size' in lower: img=img.convert('RGB'); p=outdir/(inp.stem+'-compressed.jpg'); img.save(p,quality=int(params.get('quality',82)),optimize=True); print(json.dumps({'path':str(p),'mime':'image/jpeg','name':p.name})); return
 elif 'comparison' in lower: result={'width':img.width,'height':img.height,'note':'Comparison requires a second image in the Web editor; native backend returns source metrics for the first selected image.'}; p=outdir/'result.json'; p.write_text(json.dumps(result,indent=2)); print(json.dumps({'path':str(p),'mime':'application/json','name':p.name})); return
 else: fail(f'Unsupported image operation: {op}')
 p=outdir/(inp.stem+'-output.png'); img.save(p); print(json.dumps({'path':str(p),'mime':'image/png','name':p.name}))
if __name__=='__main__':
 try: main()
 except Exception as e: print(json.dumps({'error':str(e)})); sys.exit(2)
