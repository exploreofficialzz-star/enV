import sys, time
sys.path.insert(0, "/tmp/h")
from run import *
from PIL import Image
import numpy as np
res=[]
def check(n, ok, d=""): res.append(ok); print(("PASS " if ok else "FAIL ") + n + (" — " + d if d else ""))
def dl(pg, name):
    with pg.expect_download(timeout=120000) as d: pg.get_by_role("button", name="Download", exact=True).click()
    path=f"/tmp/h/out_{name}.bin"; d.value.save_as(path); return Image.open(path)
def raw(p, op, img, cat="image"):
    b = p.chromium.launch(); ctx = b.new_context(accept_downloads=True, viewport={"width":1280,"height":900}); pg = ctx.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"file:///tmp/h/index.html?op={op}&cat={cat}"); pg.set_input_files("input[type=file] >> nth=0", img); return b, pg, errs
with sync_playwright() as p:
    # --- large photograph (24 MP) ---
    t0 = time.time(); b, pg, errs = raw(p, "compress", "/tmp/h/img/big24.jpg"); pg.wait_for_selector("text=/Compressed/", timeout=120000); pg.wait_for_selector("text=/\\d+\\.?\\d* MB/", timeout=120000)
    t_open = time.time() - t0; t1 = time.time(); pg.wait_for_function("() => document.body.innerText.includes('Saved vs original')", timeout=120000)
    pg.wait_for_function("() => /Output size\\s*\\n?\\s*\\d/.test(document.body.innerText)", timeout=120000); t_meas = time.time() - t1
    im = dl(pg, "big"); check("24 MP photo: compress opens, measures and exports full size", im.size == (6000, 4000) and not errs, f"open {t_open:.1f}s, measured +{t_meas:.1f}s, {im.size}")
    b.close()
    t0 = time.time(); b, pg, errs = raw(p, "levels", "/tmp/h/img/big24.jpg"); pg.wait_for_selector("text=Brightness", timeout=60000); pg.wait_for_selector("text=Full resolution", timeout=120000); t_full = time.time() - t0
    check("24 MP photo: brightness/contrast reaches the full-resolution preview", not errs, f"{t_full:.1f}s")
    b.close()
    t0 = time.time(); b, pg, errs = raw(p, "resize", "/tmp/h/img/big24.jpg"); pg.get_by_label("Width", exact=True).fill("1920"); pg.get_by_label("Width", exact=True).blur(); pg.wait_for_selector("text=/Showing the full-resolution/", timeout=120000)
    im = dl(pg, "bigresize"); check("24 MP photo: resize to 1920 wide (Lanczos) exports 1920×1280", im.size == (1920, 1280), f"{time.time()-t0:.1f}s {im.size}")
    b.close()
    # --- extreme shapes and tiny images ---
    for op, img, name in [("image-cropper", "/tmp/h/img/wide.png", "wide 8000×400"), ("instagram-post-image-resizer", "/tmp/h/img/tall.png", "tall 400×8000"), ("levels", "/tmp/h/img/tiny16.png", "tiny 16×16"), ("blur", "/tmp/h/img/one.png", "1×1 with alpha")]:
        b, pg, errs = raw(p, op if op != "image-cropper" else "crop", img); pg.wait_for_timeout(2500); pg.wait_for_selector("text=/\\d+(\\.\\d+)? (KB|MB|B)/", timeout=40000); pg.wait_for_timeout(800)
        im = dl(pg, "shape"); check(f"{name} opens in {op} and exports a valid image", im.size[0] >= 1 and not errs, f"{im.size} {im.format}")
        b.close()
    # --- bad input handled with readable messages ---
    for img, expect, label in [("/tmp/h/img/fake.png", "couldn't be decoded", "text file named .png"), ("/tmp/h/img/empty.png", "empty", "0-byte file"), ("/tmp/h/img/fake.heic", "can't decode HEIC", "HEIC the browser can't decode")]:
        b = p.chromium.launch(); pg = b.new_page(); pg.goto("file:///tmp/h/index.html?op=levels&cat=image"); pg.set_input_files("input[type=file] >> nth=0", img); pg.wait_for_timeout(1500)
        body = pg.inner_text("body"); check(f"{label}: friendly error, no crash", expect.lower() in body.lower() and "TypeError" not in body and "undefined" not in body, [l for l in body.split("\n") if expect.lower() in l.lower()][:1].__repr__())
        b.close()
    # --- other categories keep the original engine ---
    b, pg, errs = raw(p, "merge", "/tmp/h/img/photo.png", cat="pdf") if False else (None, None, None)
    b = p.chromium.launch(); pg = b.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.goto("file:///tmp/h/index.html?op=beautify&cat=screenshots"); pg.wait_for_timeout(1500)
    check("a non-Images tool (screenshot beautifier) still renders the original engine", not errs and pg.inner_text("body").strip() != "" and "Choose another image" not in pg.inner_text("body"), pg.inner_text("body")[:60].replace("\n", " "))
    b.close()
print(f"{sum(res)}/{len(res)} passed")
