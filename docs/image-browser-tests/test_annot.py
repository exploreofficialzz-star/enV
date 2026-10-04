import sys
sys.path.insert(0, "/tmp/h")
from run import *
from PIL import Image
import numpy as np
res=[]
def check(n, ok, d=""): res.append(ok); print(("PASS " if ok else "FAIL ") + n + (" — " + d if d else ""))
SRC = np.asarray(Image.open("/tmp/h/img/subject.png").convert("RGB")).astype(int)
def settle(pg): pg.wait_for_selector("text=/\\d+(\\.\\d+)? (KB|MB)/", timeout=40000); pg.wait_for_timeout(1500)
def dl(pg, name):
    with pg.expect_download(timeout=40000) as d: pg.get_by_role("button", name="Download", exact=True).click()
    path=f"/tmp/h/out_{name}.bin"; d.value.save_as(path); return Image.open(path)
def xy(pg, fx, fy):
    b = pg.locator("canvas[role=application]").bounding_box(); return b["x"] + b["width"] * fx, b["y"] + b["height"] * fy
with sync_playwright() as p:
    b, c, pg, errs = open_tool(p, "image-image-annotation-tool", "/tmp/h/img/subject.png"); pg.wait_for_selector("text=Style for new objects")
    pg.get_by_role("button", name="Redact", exact=True).click(); x0, y0 = xy(pg, 0.35, 0.35); x1, y1 = xy(pg, 0.65, 0.6); pg.mouse.move(x0, y0); pg.mouse.down(); pg.mouse.move(x1, y1, steps=8); pg.mouse.up()
    pg.get_by_role("button", name="Box", exact=True).click(); x0, y0 = xy(pg, 0.05, 0.05); x1, y1 = xy(pg, 0.2, 0.15); pg.mouse.move(x0, y0); pg.mouse.down(); pg.mouse.move(x1, y1, steps=6); pg.mouse.up(); settle(pg)
    check("objects list shows both annotations", pg.get_by_text("Objects", exact=True).count() >= 1 and pg.get_by_text("2", exact=True).count() >= 1)
    im = dl(pg, "ann1"); a = np.asarray(im.convert("RGB")).astype(int)
    check("redact box → solid colour, original pixels gone", im.size == (800, 600) and (np.abs(a[240:340, 300:500] - np.array([239, 68, 68])).sum(axis=2) < 6).mean() > 0.95, f"{(np.abs(a[240:340,300:500]-np.array([239,68,68])).sum(axis=2)<6).mean()*100:.0f}% filled")
    check("untouched areas identical to the source", np.abs(a[500:, 300:700] - SRC[500:, 300:700]).max() == 0)
    # undo removes the last object
    pg.get_by_role("button", name="↶ Undo").click(); settle(pg); im = dl(pg, "ann2"); a2 = np.asarray(im.convert("RGB")).astype(int)
    check("undo removes the last object (corner box gone)", np.abs(a2[20:60, 50:150] - SRC[20:60, 50:150]).max() == 0)
    b.close()
    b, c, pg, errs = open_tool(p, "meme", "/tmp/h/img/photo.png"); pg.wait_for_selector("textarea"); pg.get_by_label("Meme text").fill("hello world"); settle(pg)
    im = dl(pg, "meme"); a = np.asarray(im.convert("RGB")).astype(int); ref = np.asarray(Image.open("/tmp/h/img/photo.png").convert("RGB")).astype(int)
    d = np.abs(a - ref).sum(axis=2); ys, xs = np.nonzero(d > 60)
    check("meme: size kept, text drawn near the top, bottom text drawn near the bottom", im.size == (1600, 1000) and (d[:250] > 60).sum() > 800 and (d[750:] > 60).sum() > 800 and (d[400:600, :] > 60).sum() == 0, f"top {int((d[:250]>60).sum())} bottom {int((d[750:]>60).sum())} middle {int((d[400:600]>60).sum())}")
    pg.get_by_label("Vertical value", exact=True).first.fill("50"); pg.get_by_label("Vertical value", exact=True).first.blur(); settle(pg)
    im = dl(pg, "meme2"); a = np.asarray(im.convert("RGB")).astype(int); d = np.abs(a - ref).sum(axis=2)
    check("meme: moving box 1 to 50% vertical puts text in the middle", (d[400:600] > 60).sum() > 800)
    b.close()
print(f"{sum(res)}/{len(res)} passed")
