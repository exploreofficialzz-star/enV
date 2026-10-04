import sys, os
sys.path.insert(0, "/tmp/h")
from run import *
from PIL import Image
import numpy as np
res=[]
def check(n, ok, d=""): res.append(ok); print(("PASS " if ok else "FAIL ") + n + (" — " + d if d else ""))
def settle(pg): pg.wait_for_selector("text=/\\d+(\\.\\d+)? (KB|MB)/", timeout=40000); pg.wait_for_timeout(1500)
def dl(pg, name):
    with pg.expect_download(timeout=40000) as d: pg.get_by_role("button", name="Download", exact=True).click()
    path=f"/tmp/h/out_{name}.bin"; d.value.save_as(path); return path
rng = np.random.default_rng(5); base = np.asarray(Image.open("/tmp/h/img/photo.png").convert("RGB")).astype(int)
Image.fromarray(np.clip(base + rng.normal(0, 10, base.shape), 0, 255).astype("uint8")).save("/tmp/h/img/photo_noisy.jpg", quality=92)
with sync_playwright() as p:
    for op, size, cap, fmt in [("instagram-post-image-resizer", (1080, 1350), None, "JPEG"), ("youtube-banner-resizer", (2560, 1440), 6*1024*1024, "JPEG"), ("x-profile-image-resizer", (400, 400), 2*1024*1024, "JPEG"), ("facebook-cover-image-resizer", (851, 315), 100*1024, "JPEG")]:
        b, c, pg, errs = open_tool(p, op, "/tmp/h/img/photo_noisy.jpg"); settle(pg)
        path = dl(pg, op); im = Image.open(path); sz = os.path.getsize(path)
        check(f"{op}: exact size {size[0]}×{size[1]}, {fmt}" + (f", ≤ {cap//1024} KB" if cap else ""), im.size == size and im.format == fmt and (cap is None or sz <= cap), f"{im.size} {im.format} {sz/1024:.0f} KB")
        b.close()
    b, c, pg, errs = open_tool(p, "tiktok-banner-resizer", "/tmp/h/img/photo.png"); settle(pg)
    check("tiktok-banner: honest 'approximate' labelling, no invented official spec", pg.get_by_text("Approximate").count() > 0 and pg.get_by_text("no dedicated spec", exact=False).count() + pg.get_by_text("doesn't publish", exact=False).count() > 0)
    b.close()
    b, c, pg, errs = open_tool(p, "youtube-banner-resizer", "/tmp/h/img/photo.png"); settle(pg)
    check("youtube-banner: official label + source link", pg.get_by_text("Official", exact=True).count() > 0 and pg.locator("a[href*='support.google.com/youtube']").count() > 0)
    b.close()
    # manual framing: zoom in and snap to the right; the crop must change accordingly
    b, c, pg, errs = open_tool(p, "instagram-square-image-maker", "/tmp/h/img/photo.png"); settle(pg)
    pg.get_by_label("Zoom value", exact=True).fill("2"); pg.get_by_label("Zoom value", exact=True).blur(); pg.get_by_role("button", name="Snap right").click(); settle(pg)
    path = dl(pg, "frame"); im = Image.open(path).convert("RGB"); check("manual zoom 2× + snap right → 1080×1080", im.size == (1080, 1080))
    a = np.asarray(im).astype(int); ref = np.asarray(Image.open("/tmp/h/img/photo.png").convert("RGB").crop((1100, 250, 1600, 750)).resize((1080, 1080), Image.LANCZOS)).astype(int)
    check("framing matches the expected right-hand crop (mean diff < 3)", np.abs(a - ref).mean() < 3, f"mean diff {np.abs(a-ref).mean():.1f}")
    b.close()
    b, c, pg, errs = open_tool(p, "social-resize", "/tmp/h/img/photo.png"); settle(pg)
    check("generic social resizer exposes a platform picker", pg.get_by_label("Platform", exact=True).count() == 1)
    pg.get_by_label("Platform", exact=True).select_option("linkedin"); pg.wait_for_timeout(500); settle(pg)
    path = dl(pg, "social"); check("social-resize → LinkedIn post 1200×627", Image.open(path).size == (1200, 627), str(Image.open(path).size))
    b.close()
print(f"{sum(res)}/{len(res)} passed")
