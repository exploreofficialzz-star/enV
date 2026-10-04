import sys, zipfile, io
sys.path.insert(0, "/tmp/h")
from run import *
from PIL import Image
import numpy as np
res=[]
def check(n, ok, d=""): res.append(ok); print(("PASS " if ok else "FAIL ") + n + (" — " + d if d else ""))
with sync_playwright() as p:
    b, c, pg, errs = open_tool(p, "to-ico", "/tmp/h/img/transparent.png"); pg.wait_for_selector("text=ICO sizes"); pg.wait_for_timeout(500)
    with pg.expect_download(timeout=30000) as d: pg.get_by_role("button", name="Download .ico", exact=True).click()
    d.value.save_as("/tmp/h/out.ico"); ico = Image.open("/tmp/h/out.ico")
    sizes = sorted(ico.info.get("sizes", [])); check("to-ico: valid ICO with 7 frames 16…256", sizes == [(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)], str(sizes))
    ico.size = (256, 256); fr = ico.convert("RGBA"); a = np.asarray(fr)
    check("ICO frame keeps transparency (corner a=0, centre opaque)", a[0, 0, 3] == 0 and abs(int(a[128, 128, 3]) - 128) <= 1, f"corner {a[0,0,3]} centre {a[128,128,3]}")
    b.close()
    b, c, pg, errs = open_tool(p, "favicon", "/tmp/h/img/photo.png"); pg.wait_for_selector("text=HTML & manifest"); pg.wait_for_timeout(500)
    with pg.expect_download(timeout=30000) as d: pg.get_by_role("button", name="Download full package (ZIP)").click()
    d.value.save_as("/tmp/h/fav.zip"); z = zipfile.ZipFile("/tmp/h/fav.zip"); names = sorted(z.namelist()); check("favicon package contents", {"favicon.ico","apple-touch-icon.png","android-chrome-192x192.png","android-chrome-512x512.png","favicon-16x16.png","favicon-32x32.png","site.webmanifest","favicon-tags.html"} <= set(names) and z.testzip() is None, ", ".join(names))
    im = Image.open(io.BytesIO(z.read("apple-touch-icon.png"))); check("apple-touch-icon is 180×180", im.size == (180, 180), str(im.size))
    im = Image.open(io.BytesIO(z.read("android-chrome-512x512.png"))); check("android 512 is 512×512 PNG", im.size == (512, 512) and im.format == "PNG")
    b.close()
print(f"{sum(res)}/{len(res)} passed")
