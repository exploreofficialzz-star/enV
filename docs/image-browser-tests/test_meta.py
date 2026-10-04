import sys
sys.path.insert(0, "/tmp/h")
from run import *
from PIL import Image
import numpy as np
res=[]
def check(n, ok, d=""): res.append(ok); print(("PASS " if ok else "FAIL ") + n + (" — " + d if d else ""))
def dl(pg, op, name="Download"):
    with pg.expect_download(timeout=30000) as d: pg.get_by_role("button", name=name, exact=True).first.click()
    path=f"/tmp/h/out_{op}.bin"; d.value.save_as(path); return path
def open_meta(p, op, files):
    b = p.chromium.launch(); ctx = b.new_context(accept_downloads=True); pg = ctx.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"file:///tmp/h/index.html?op={op}"); pg.set_input_files("input[type=file]", files); return b, pg, errs
with sync_playwright() as p:
    b, pg, errs = open_meta(p, "Image-image-metadata-inspector", "/tmp/imgtest/exif_gps.jpg")
    pg.wait_for_selector("text=GPS position", timeout=15000)
    check("inspector: shows GPS coordinates", pg.get_by_text("40.446111, -79.982222").count() >= 1, str(pg.get_by_text("40.446111, -79.982222").count()))
    check("inspector: shows camera make and privacy warning", pg.get_by_text("Acme Cameras").count() > 0 and pg.get_by_text("Privacy:").count() > 0)
    b.close()
    b, pg, errs = open_meta(p, "exif-strip", ["/tmp/imgtest/exif_gps.jpg", "/tmp/imgtest/exif_gps.png", "/tmp/imgtest/exif_gps.webp"])
    pg.wait_for_selector("text=Will remove", timeout=15000)
    pg.get_by_role("button", name="Clean 3 files", exact=True).click(); pg.wait_for_selector("text=Cleaned and verified", timeout=15000)
    check("cleaner: all 3 formats verified clean", pg.get_by_text("Cleaned and verified").count() == 3)
    path = dl(pg, "clean_jpg"); im = Image.open(path); ex = im.getexif()
    ref = np.asarray(Image.open("/tmp/imgtest/exif_gps.jpg").convert("RGB"))
    check("cleaned JPEG: no GPS, no make, pixels identical", len(ex.get_ifd(0x8825)) == 0 and ex.get(0x010F) is None and np.array_equal(np.asarray(im.convert("RGB")), ref), f"exif tags {len(ex)}")
    with pg.expect_download(timeout=30000) as d: pg.get_by_role("button", name="Download all (ZIP)", exact=True).click()
    d.value.save_as("/tmp/h/clean.zip"); import zipfile; z = zipfile.ZipFile("/tmp/h/clean.zip"); check("ZIP: 3 valid files", len(z.namelist()) == 3 and z.testzip() is None, ", ".join(z.namelist()))
    b.close()
    b, pg, errs = open_meta(p, "image-image-metadata-cleaner", "/tmp/imgtest/exif_gps.jpg")
    pg.get_by_role("radio", name="Remove GPS location only").click(); pg.get_by_role("button", name="Clean file", exact=True).click(); pg.wait_for_selector("text=Cleaned and verified", timeout=15000)
    path = dl(pg, "loc"); im = Image.open(path); ex = im.getexif()
    check("location-only: GPS gone, camera make kept", len(ex.get_ifd(0x8825)) == 0 and ex.get(0x010F) == "Acme Cameras")
    b.close()
print(f"{sum(res)}/{len(res)} passed")
