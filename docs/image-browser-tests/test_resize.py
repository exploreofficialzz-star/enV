import sys
sys.path.insert(0, "/tmp/h")
from run import *
from PIL import Image
import numpy as np
SRC = Image.open("/tmp/h/img/photo.png").convert("RGB")
res = []
def check(n, ok, d=""): res.append(ok); print(("PASS " if ok else "FAIL ") + n + (" — " + d if d else ""))
def dl(pg, op):
    with pg.expect_download(timeout=30000) as d: pg.get_by_role("button", name="Download", exact=True).click()
    path = f"/tmp/h/out_{op}.bin"; d.value.save_as(path); im = Image.open(path); im.load(); return im
def settle(pg):
    pg.wait_for_selector("text=/Showing the full-resolution/", timeout=30000); pg.wait_for_selector("text=/\\d+(\\.\\d+)? (KB|MB|B)/", timeout=30000); pg.wait_for_timeout(700)
with sync_playwright() as p:
    b, c, pg, errs = open_tool(p, "resize")
    pg.get_by_label("Width value", exact=False).first  # smoke
    pg.get_by_label("Width", exact=True).fill("800"); pg.get_by_label("Width", exact=True).blur(); settle(pg)
    im = dl(pg, "resize"); check("resize: width 800 with lock → 800×500", im.size == (800, 500), str(im.size))
    ref = SRC.resize((800, 500), Image.LANCZOS); d = np.abs(np.asarray(im.convert("RGB")).astype(int) - np.asarray(ref).astype(int)); check("resize: matches Pillow Lanczos closely (mean diff < 3)", d.mean() < 3, f"mean diff {d.mean():.2f}")
    b.close()
    b, c, pg, errs = open_tool(p, "resize")
    pg.get_by_role("radio", name="Fill & crop").click(); pg.get_by_label("Width", exact=True).fill("500"); pg.get_by_label("Width", exact=True).blur()
    pg.get_by_label("Lock aspect ratio").uncheck(); pg.get_by_label("Height", exact=True).fill("500"); pg.get_by_label("Height", exact=True).blur(); settle(pg)
    im = dl(pg, "fill"); check("resize fill: 500×500 centre-crop", im.size == (500, 500), str(im.size))
    cen = SRC.crop((300, 0, 1300, 1000)).resize((500, 500), Image.LANCZOS); d = np.abs(np.asarray(im.convert("RGB")).astype(int) - np.asarray(cen).astype(int)); check("resize fill: content is the centred square", d.mean() < 4, f"mean diff {d.mean():.2f}")
    b.close()
    b, c, pg, errs = open_tool(p, "upscaler")
    pg.get_by_role("button", name="3×").click(); settle(pg)
    im = dl(pg, "upscaler"); check("upscaler: 3× → 4800×3000", im.size == (4800, 3000), str(im.size))
    b.close()
    b, c, pg, errs = open_tool(p, "resize")
    pg.get_by_label("Width", exact=True).fill("90000"); pg.get_by_label("Width", exact=True).blur(); pg.wait_for_timeout(600)
    check("resize: absurd size shows a readable error and disables Download", pg.get_by_text("megapixels").count() > 0 and pg.get_by_role("button", name="Download", exact=True).is_disabled())
    b.close()
print(f"{sum(res)}/{len(res)} passed")
