"""Creates the images the browser tests use (Pillow + numpy). Output: $IMG_TEST_DIR/img and /tmp/imgtest."""
import os
import numpy as np
from PIL import Image, ImageDraw
from PIL.TiffImagePlugin import IFDRational

H = os.environ.get("IMG_TEST_DIR", "/tmp/h")
os.makedirs(H + "/img", exist_ok=True); os.makedirs("/tmp/imgtest", exist_ok=True)
w, h = 1600, 1000
yy, xx = np.mgrid[0:h, 0:w]
im = Image.fromarray(np.stack([xx / w * 255, yy / h * 255, (xx + yy) / (w + h) * 255], -1).astype("uint8"))
d = ImageDraw.Draw(im); d.ellipse((300, 200, 900, 800), fill=(220, 40, 40)); d.rectangle((1000, 300, 1450, 700), fill=(30, 60, 200)); d.text((50, 50), "TEST", fill=(255, 255, 255))
im.save(H + "/img/photo.png")
t = Image.new("RGBA", (400, 300), (0, 0, 0, 0)); td = ImageDraw.Draw(t); td.ellipse((50, 40, 350, 260), fill=(255, 180, 0, 255)); td.ellipse((120, 100, 280, 200), fill=(0, 0, 0, 128)); t.save(H + "/img/transparent.png")
rng = np.random.default_rng(11); yy, xx = np.mgrid[0:4000, 0:6000]
base = np.stack([xx / 6000 * 255, yy / 4000 * 255, (xx + yy) / 10000 * 255], -1)
Image.fromarray(np.clip(base + rng.normal(0, 6, base.shape), 0, 255).astype("uint8")).save(H + "/img/big24.jpg", quality=90)
ramp = np.linspace(0, 255, 8000)
Image.fromarray(np.stack([np.tile(ramp, (400, 1))] * 3, -1).astype("uint8")).save(H + "/img/wide.png")
Image.fromarray(np.stack([np.tile(ramp[:, None], (1, 400))] * 3, -1).astype("uint8")).save(H + "/img/tall.png")
Image.new("RGB", (16, 16), (10, 120, 200)).save(H + "/img/tiny16.png"); Image.new("RGBA", (1, 1), (255, 0, 0, 128)).save(H + "/img/one.png")
open(H + "/img/fake.png", "wb").write(b"this is definitely not an image\n" * 20); open(H + "/img/empty.png", "wb").write(b"")
open(H + "/img/fake.heic", "wb").write(b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1heic" + b"\x00" * 64)
# JPEG / PNG / WebP carrying camera EXIF + a GPS position
exif = Image.Exif(); exif[0x010F] = "Acme Cameras"; exif[0x0110] = "Model Z9"; exif[0x0112] = 6; exif[0x0131] = "FirmwareTool 1.2"; exif[0x013B] = "Jane Photographer"
e = exif.get_ifd(0x8769); e[0x829A] = IFDRational(1, 250); e[0x829D] = IFDRational(28, 10); e[0x920A] = IFDRational(50, 1); e[0x8827] = 400; e[0x9003] = "2026:08:01 09:30:00"
g = exif.get_ifd(0x8825); g[1] = "N"; g[2] = (40.0, 26.0, 46.0); g[3] = "W"; g[4] = (79.0, 58.0, 56.0)
px = Image.fromarray((np.random.default_rng(7).random((240, 320, 3)) * 255).astype("uint8"))
px.save("/tmp/imgtest/exif_gps.jpg", quality=92, exif=exif, dpi=(300, 300)); px.save("/tmp/imgtest/exif_gps.png", exif=exif, dpi=(144, 144)); px.save("/tmp/imgtest/exif_gps.webp", quality=90, exif=exif)
print("fixtures written")
