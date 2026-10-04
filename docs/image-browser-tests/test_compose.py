import sys, zipfile, io
sys.path.insert(0, "/tmp/h")
from run import *
from PIL import Image
import numpy as np
res=[]
def check(n, ok, d=""): res.append(ok); print(("PASS " if ok else "FAIL ") + n + (" — " + d if d else ""))
for name, col, size in (("r", (220, 30, 30), (400, 300)), ("g", (30, 200, 60), (300, 400)), ("b", (30, 60, 220), (400, 300))): Image.new("RGB", size, col).save(f"/tmp/h/img/c_{name}.png")
A = "/tmp/h/img/c_r.png"; B = "/tmp/h/img/c_g.png"; C = "/tmp/h/img/c_b.png"
def open_c(p, op, files):
    b = p.chromium.launch(); ctx = b.new_context(accept_downloads=True, viewport={"width":1280,"height":900}); pg = ctx.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"file:///tmp/h/index.html?op={op}"); pg.set_input_files("input[type=file] >> nth=0", files); return b, pg, errs
def settle(pg): pg.wait_for_selector("text=/\\d+(\\.\\d+)? (KB|MB|B)/", timeout=40000); pg.wait_for_timeout(1200)
def dl(pg, name):
    with pg.expect_download(timeout=40000) as d: pg.get_by_role("button", name="Download", exact=True).click()
    path=f"/tmp/h/out_{name}.bin"; d.value.save_as(path); return Image.open(path)
with sync_playwright() as p:
    b, pg, errs = open_c(p, "merge", [A, B, C]); pg.wait_for_selector("text=Order (3)"); settle(pg)
    im = dl(pg, "merge").convert("RGB"); a = np.asarray(im)
    # default: horizontal, 'scale up to the largest' height (400): widths 533.3, 300, 533.3 + 2×16 gap
    check("merge: horizontal, heights matched to the tallest (400px)", im.size[1] == 400 and abs(im.size[0] - (533 + 300 + 533 + 32)) <= 3, str(im.size))
    near = lambda px, c: max(abs(int(px[i]) - c[i]) for i in range(3)) <= 2
    check("merge: order and colours correct (red, green, blue)", near(a[200, 100], (220, 30, 30)) and near(a[200, 533 + 16 + 150], (30, 200, 60)) and near(a[200, im.size[0] - 100], (30, 60, 220)))
    pg.get_by_role("button", name="Move down").first.click(); pg.wait_for_timeout(300); settle(pg); im = dl(pg, "merge2").convert("RGB"); a = np.asarray(im)
    check("merge: reordering with the arrow changes the output (green first)", near(a[200, 100], (30, 200, 60)), str(tuple(a[200, 100])))
    b.close()
    b, pg, errs = open_c(p, "image-image-grid-generator", [A, B, C, A]); pg.wait_for_selector("text=Order (4)"); pg.get_by_label("Columns value", exact=True).fill("2"); pg.get_by_label("Columns value", exact=True).blur(); pg.wait_for_timeout(300)
    pg.get_by_label("Output width", exact=True).fill("1000"); pg.get_by_label("Output width", exact=True).blur(); settle(pg)
    im = dl(pg, "grid"); check("grid: 2 columns × 2 rows, exact 1000px wide, square cells", im.size[0] == 1000 and abs(im.size[1] - (12 * 2 + 2 * ((1000 - 24 - 12) / 2) + 12)) <= 3, str(im.size))
    b.close()
    b, pg, errs = open_c(p, "image-image-splitter", [str(("/tmp/h/img/photo.png"))]); pg.wait_for_selector("text=Split into")
    with pg.expect_download(timeout=40000) as d: pg.get_by_role("button", name="Download 3 pieces (ZIP)").click()
    d.value.save_as("/tmp/h/split.zip"); z = zipfile.ZipFile("/tmp/h/split.zip"); names = sorted(z.namelist()); ims = [Image.open(io.BytesIO(z.read(n))) for n in names]
    check("splitter: 3 pieces, widths add up to 1600, heights 1000", len(ims) == 3 and sum(i.size[0] for i in ims) == 1600 and all(i.size[1] == 1000 for i in ims), ", ".join(names))
    src = np.asarray(Image.open("/tmp/h/img/photo.png").convert("RGB")).astype(int); x0 = ims[0].size[0]; mid = np.asarray(ims[1].convert("RGB")).astype(int)
    check("splitter: middle piece matches the source region (JPEG tolerance)", np.abs(mid - src[:, x0:x0 + ims[1].size[0]]).mean() < 3, f"mean diff {np.abs(mid - src[:, x0:x0 + ims[1].size[0]]).mean():.2f}")
    b.close()
    b, pg, errs = open_c(p, "image-before-after-image-maker", [A]); pg.wait_for_selector("text=Before:"); pg.locator("input[type=file]").first.set_input_files(B); pg.wait_for_selector("text=Layout"); settle(pg)
    im = dl(pg, "ba"); check("before/after: side by side output exists with expected width", im.size[0] == 1600, str(im.size))
    b.close()
    b, pg, errs = open_c(p, "image-image-comparison", [A]); pg.wait_for_selector("text=Image A:"); pg.locator("input[type=file]").first.set_input_files(C); pg.wait_for_selector("text=Pixels changed"); pg.wait_for_timeout(400)
    check("comparison: red vs blue → ~100% pixels changed", pg.get_by_text("100.00%").count() > 0, pg.get_by_text("Pixels changed").first.inner_text())
    b.close()
    b, pg, errs = open_c(p, "image-image-comparison", [A]); pg.wait_for_selector("text=Image A:"); pg.locator("input[type=file]").first.set_input_files(A); pg.wait_for_selector("text=Pixels changed"); pg.wait_for_timeout(400)
    check("comparison: identical images → 0% and 'identical'", pg.get_by_text("0.00%").count() > 0 and pg.get_by_text("identical").count() > 0)
    b.close()
    b, pg, errs = open_c(p, "image-image-contact-sheet", [A, B, C]); pg.wait_for_selector("text=Order (3)"); settle(pg)
    im = dl(pg, "contact"); check("contact sheet: 2480px wide with captions/title layout", im.size[0] == 2480 and im.size[1] > 600, str(im.size))
    b.close()
print(f"{sum(res)}/{len(res)} passed")
