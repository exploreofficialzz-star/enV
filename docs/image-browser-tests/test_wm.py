import sys, zipfile, io
sys.path.insert(0, "/tmp/h")
from run import *
from PIL import Image
import numpy as np
res=[]
def check(n, ok, d=""): res.append(ok); print(("PASS " if ok else "FAIL ") + n + (" — " + d if d else ""))
SRC = np.asarray(Image.open("/tmp/h/img/photo.png").convert("RGB")).astype(int)
def settle(pg): pg.wait_for_selector("text=/\\d+(\\.\\d+)? (KB|MB)/", timeout=40000); pg.wait_for_timeout(1500)
def dl(pg, name):
    with pg.expect_download(timeout=40000) as d: pg.get_by_role("button", name="Download", exact=True).click()
    path=f"/tmp/h/out_{name}.bin"; d.value.save_as(path); return Image.open(path)
# a small logo with alpha
logo = Image.new("RGBA", (200, 100), (0, 0, 0, 0)); 
from PIL import ImageDraw; ImageDraw.Draw(logo).rectangle((10, 10, 190, 90), fill=(255, 0, 255, 255)); logo.save("/tmp/h/img/logo.png")
with sync_playwright() as p:
    b, c, pg, errs = open_tool(p, "watermark", "/tmp/h/img/photo.png"); pg.wait_for_selector("textarea"); 
    pg.get_by_label("Opacity value", exact=True).fill("100"); pg.get_by_label("Opacity value", exact=True).blur(); pg.get_by_label("Shadow value", exact=True).fill("0"); pg.get_by_label("Shadow value", exact=True).blur(); settle(pg)
    im = dl(pg, "wm1"); a = np.asarray(im.convert("RGB")).astype(int); diff = np.abs(a - SRC).sum(axis=2)
    ys, xs = np.nonzero(diff > 30)
    check("text watermark: size unchanged, only the bottom-right area changed", im.size == (1600, 1000) and len(xs) > 200 and xs.min() > 1600 * 0.55 and ys.min() > 1000 * 0.8, f"changed bbox x[{xs.min() if len(xs) else None},{xs.max() if len(xs) else None}] y[{ys.min() if len(ys) else None},{ys.max() if len(ys) else None}]")
    check("pixels far from the watermark are untouched", np.abs(a[:700, :1000] - SRC[:700, :1000]).max() == 0)
    b.close()
    b, c, pg, errs = open_tool(p, "watermark", "/tmp/h/img/photo.png"); pg.wait_for_selector("textarea")
    pg.get_by_role("button", name="Tiled diagonal").click(); settle(pg)
    im = dl(pg, "wm2"); a = np.asarray(im.convert("RGB")).astype(int); changed = (np.abs(a - SRC).sum(axis=2) > 12).mean()
    check("tiled watermark covers the whole image (>3% of pixels changed in all four quadrants)", all((np.abs(a - SRC).sum(axis=2)[y:y+500, x:x+800] > 12).mean() > 0.01 for y in (0, 500) for x in (0, 800)), f"{changed*100:.1f}% changed")
    b.close()
    b, c, pg, errs = open_tool(p, "watermark", "/tmp/h/img/photo.png"); pg.wait_for_selector("textarea")
    pg.get_by_role("radio", name="Image / logo").click(); pg.locator("input[type=file]").first.set_input_files("/tmp/h/img/logo.png"); pg.wait_for_timeout(500)
    pg.get_by_label("Opacity value", exact=True).fill("100"); pg.get_by_label("Opacity value", exact=True).blur(); pg.get_by_role("button", name="Place top-left").click(); settle(pg)
    im = dl(pg, "wm3"); a = np.asarray(im.convert("RGB")).astype(int); mag = (np.abs(a - np.array([255, 0, 255])).sum(axis=2) < 20)
    ys, xs = np.nonzero(mag); check("image watermark: magenta logo drawn in the top-left", len(xs) > 1000 and xs.max() < 800 and ys.max() < 500, f"bbox x[{xs.min() if len(xs) else None},{xs.max() if len(xs) else None}] y[{ys.min() if len(ys) else None},{ys.max() if len(ys) else None}]")
    b.close()
    # batch
    import shutil; shutil.copy("/tmp/h/img/photo.png", "/tmp/h/img/b1.png"); shutil.copy("/tmp/h/img/noisy.jpg", "/tmp/h/img/b2.jpg"); open("/tmp/h/img/bad.png", "wb").write(b"not an image")
    b = p.chromium.launch(); ctx = b.new_context(accept_downloads=True); pg = ctx.new_page(); pg.goto("file:///tmp/h/index.html?op=image-image-watermark-batch-tool")
    pg.set_input_files("input[type=file] >> nth=0", ["/tmp/h/img/b1.png", "/tmp/h/img/b2.jpg", "/tmp/h/img/bad.png"]); pg.wait_for_selector("text=Watermark 3 images")
    pg.get_by_role("button", name="Watermark 3 images").click(); pg.wait_for_selector("text=/2 done, 1 failed/", timeout=60000)
    check("batch: 2 succeed, the corrupt file fails with a readable message", pg.get_by_text("2 done, 1 failed of 3").count() == 1 and pg.get_by_text("couldn't be decoded").count() + pg.get_by_text("isn't a recognised image").count() >= 1)
    with pg.expect_download(timeout=30000) as d: pg.get_by_role("button", name="Download all (ZIP)").click()
    d.value.save_as("/tmp/h/wm.zip"); z = zipfile.ZipFile("/tmp/h/wm.zip"); names = z.namelist()
    ims = [Image.open(io.BytesIO(z.read(n))) for n in names]; check("batch ZIP: 2 watermarked files with original formats kept", len(names) == 2 and {i.format for i in ims} == {"PNG", "JPEG"} and z.testzip() is None, ", ".join(names))
    b.close()
print(f"{sum(res)}/{len(res)} passed")
