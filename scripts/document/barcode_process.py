#!/usr/bin/env python3
import sys,json
from pathlib import Path
from reportlab.graphics import renderSVG
from reportlab.graphics.barcode import createBarcodeDrawing,getCodeNames

def main():
 fmt=sys.argv[1].lower(); value=sys.argv[2]; out=Path(sys.argv[3]); out.parent.mkdir(parents=True,exist_ok=True)
 aliases={'code128':'Code128','code39':'Standard39','codabar':'Codabar','ean13':'EAN13','ean8':'EAN8','upca':'UPCA','isbn':'ISBN','msi':'MSI','itf14':'I2of5','interleaved-2-of-5':'I2of5','qr':'QR','datamatrix':'ECC200DataMatrix'}
 name=aliases.get(fmt,fmt)
 if name not in getCodeNames(): raise RuntimeError(f'Barcode format {fmt} is not supported by this renderer.')
 drawing=createBarcodeDrawing(name,value=value,barHeight=50,barWidth=1.0)
 out.write_text(renderSVG.drawToString(drawing)); print(json.dumps({'path':str(out),'mime':'image/svg+xml','name':out.name}))
if __name__=='__main__':
 try: main()
 except Exception as e: print(json.dumps({'error':str(e)})); sys.exit(2)
