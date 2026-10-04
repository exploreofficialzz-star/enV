import sys
sys.path.insert(0, "/tmp/h")
from run import *
res=[]
def check(n, ok, d=""): res.append(ok); print(("PASS " if ok else "FAIL ") + n + (" — " + d if d else ""))
def page(p, op, file=None):
    b = p.chromium.launch(); pg = b.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"file:///tmp/h/index.html?op={op}")
    if file: pg.set_input_files("input[type=file]", file); pg.wait_for_selector("text=read from your image", timeout=10000)
    return b, pg, errs
with sync_playwright() as p:
    b, pg, errs = page(p, "image-image-aspect-ratio-calculator", "/tmp/h/img/photo.png"); pg.wait_for_timeout(300)
    check("aspect: reads 1600×1000 from the image → 8:5 and 16:10 standard", pg.get_by_text("8:5", exact=True).count() > 0 and pg.get_by_text("16:10", exact=True).count() > 0)
    pg.get_by_label("New width").fill("800"); pg.get_by_label("New width").blur(); check("aspect: 800 wide keeps ratio → 800 × 500", pg.get_by_text("800 × 500 px").count() > 0)
    b.close()
    b, pg, errs = page(p, "image-image-dpi-calculator"); pg.get_by_label("Width", exact=True).fill("3000"); pg.get_by_label("Width", exact=True).blur(); pg.get_by_label("Print width (in)").fill("10"); pg.get_by_label("Print width (in)").blur(); pg.wait_for_timeout(200)
    check("dpi: 3000px over 10in = 300 DPI, Excellent", pg.get_by_text("300 DPI").count() > 0 and pg.get_by_text("Excellent").count() > 0)
    b.close()
    b, pg, errs = page(p, "image-image-ppi-calculator"); pg.get_by_label("Horizontal pixels").fill("2560"); pg.get_by_label("Horizontal pixels").blur(); pg.get_by_label("Vertical pixels").fill("1440"); pg.get_by_label("Vertical pixels").blur(); pg.get_by_label("Screen diagonal").fill("27"); pg.get_by_label("Screen diagonal").blur(); pg.wait_for_timeout(200)
    check("ppi: 2560×1440 at 27in = 108.8 PPI", pg.get_by_text("108.8 PPI").count() > 0, pg.locator("b").first.inner_text())
    b.close()
    b, pg, errs = page(p, "image-image-print-size-calculator"); pg.get_by_label("Width", exact=True).fill("2480"); pg.get_by_label("Width", exact=True).blur(); pg.get_by_label("Height", exact=True).fill("3508"); pg.get_by_label("Height", exact=True).blur(); pg.wait_for_timeout(200)
    check("print: 2480×3508 prints A4 at 300 DPI (Excellent)", pg.get_by_text("A4 (210 × 297 mm)").count() > 0 and pg.locator("li", has_text="A4 (210").first.inner_text().find("300 DPI") >= 0)
    b.close()
    b, pg, errs = page(p, "image-image-file-size-calculator", "/tmp/h/img/photo.png"); pg.get_by_role("button", name="Measure by encoding this image").click(); pg.wait_for_selector("text=JPG 80%", timeout=30000)
    check("file-size: measured sizes for several formats flagged 'measured'", pg.get_by_text("measured", exact=True).count() >= 5)
    b.close()
    b, pg, errs = page(p, "image-image-dimension-calculator"); pg.get_by_label("Width", exact=True).fill("4000"); pg.get_by_label("Width", exact=True).blur(); pg.get_by_label("Height", exact=True).fill("3000"); pg.get_by_label("Height", exact=True).blur(); pg.wait_for_timeout(200)
    check("dimension: 4000×3000 = 12 MP", pg.get_by_text("12 MP").count() > 0 and pg.get_by_text("12,000,000").count() > 0)
    b.close()
print(f"{sum(res)}/{len(res)} passed")
