import sys
sys.path.insert(0, "/tmp/h")
from run import *
from PIL import Image
import numpy as np, io
res = []
def check(n, ok, d=""): res.append(ok); print(("PASS " if ok else "FAIL ") + n + (" — " + d if d else ""))
def settle(pg, text="/\\d+(\\.\\d+)? (KB|MB)/"):
    pg.wait_for_selector(f"text={text}", timeout=40000); pg.wait_for_timeout(1800)
def dl(pg, op):
    with pg.expect_download(timeout=40000) as d: pg.get_by_role("button", name="Download", exact=True).click()
    path = f"/tmp/h/out_{op}.bin"; d.value.save_as(path); return path
# a noisy, photo-like image so JPEG sizes behave realistically
rng = np.random.default_rng(1); base = np.asarray(Image.open("/tmp/h/img/photo.png").convert("RGB")).astype(int)
noisy = np.clip(base + rng.normal(0, 14, base.shape), 0, 255).astype("uint8"); Image.fromarray(noisy).save("/tmp/h/img/noisy.jpg", quality=95)
import os; orig = os.path.getsize("/tmp/h/img/noisy.jpg")
with sync_playwright() as p:
    b, c, pg, errs = open_tool(p, "compress", "/tmp/h/img/noisy.jpg"); settle(pg)
    path = dl(pg, "compress"); im = Image.open(path)
    check("compress: JPG stays JPG and shrinks", im.format == "JPEG" and os.path.getsize(path) < orig, f"{orig} -> {os.path.getsize(path)}")
    check("compare view shows decoded result canvas", pg.locator("canvas[role=img]").count() == 1 and pg.get_by_text("Compressed").count() > 0)
    b.close()
    b, c, pg, errs = open_tool(p, "image-exact-size-image-compressor", "/tmp/h/img/noisy.jpg")
    pg.get_by_label("Target size (KB — or type 2 MB)").fill("120"); pg.get_by_label("Target size (KB — or type 2 MB)").blur(); settle(pg, "/Fits/")
    path = dl(pg, "exact"); size = os.path.getsize(path); im = Image.open(path)
    check("exact-size: output ≤ 120 KB", size <= 120 * 1024, f"{size/1024:.1f} KB, {im.size}")
    check("exact-size: uses most of the budget (≥ 60 KB, not wastefully tiny)", size >= 60 * 1024, f"{size/1024:.1f} KB")
    b.close()
    b, c, pg, errs = open_tool(p, "to-webp", "/tmp/h/img/photo.png"); settle(pg)
    path = dl(pg, "towebp"); check("to-webp: real WebP file", Image.open(path).format == "WEBP", Image.open(path).format)
    b.close()
    b, c, pg, errs = open_tool(p, "to-png", "/tmp/h/img/noisy.jpg"); settle(pg)
    path = dl(pg, "topng"); check("to-png: real PNG, lossless of the decoded pixels", Image.open(path).format == "PNG" and np.abs(np.asarray(Image.open(path).convert("RGB")).astype(int) - np.asarray(Image.open('/tmp/h/img/noisy.jpg').convert('RGB')).astype(int)).max() <= 1)
    b.close()
    b, c, pg, errs = open_tool(p, "to-jpeg", "/tmp/h/img/transparent.png"); settle(pg)
    path = dl(pg, "tojpg"); im = Image.open(path); a = np.asarray(im.convert("RGB"))
    check("to-jpeg: transparency flattened onto white", im.format == "JPEG" and a[0, 0].min() >= 250, f"corner {a[0,0]}")
    b.close()
    b, c, pg, errs = open_tool(p, "youtube-image-compressor", "/tmp/h/img/noisy.jpg"); settle(pg)
    check("platform compressor: shows YouTube limits chips", pg.get_by_text("YouTube limits").count() > 0)
    b.close()
print(f"{sum(res)}/{len(res)} passed")
