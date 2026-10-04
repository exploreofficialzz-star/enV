import sys
sys.path.insert(0, "/tmp/h")
from run import *
from PIL import Image
import numpy as np
res=[]
def check(n, ok, d=""): res.append(ok); print(("PASS " if ok else "FAIL ") + n + (" — " + d if d else ""))
def settle(pg): pg.wait_for_selector("text=/\\d+(\\.\\d+)? (KB|MB|B)/", timeout=40000); pg.wait_for_timeout(1500)
def dl(pg, name):
    with pg.expect_download(timeout=40000) as d: pg.get_by_role("button", name="Download", exact=True).click()
    path=f"/tmp/h/out_{name}.bin"; d.value.save_as(path); return Image.open(path)
SRC = Image.open("/tmp/h/img/photo.png").convert("RGB")
with sync_playwright() as p:
    b, c, pg, errs = open_tool(p, "crop"); pg.wait_for_selector("text=Rule-of-thirds"); 
    pg.get_by_role("button", name="Select everything").click()
    for lbl, val in (("Left", 200), ("Top", 100), ("Width", 600), ("Height", 400)):
        pg.get_by_label(lbl, exact=True).fill(str(val)); pg.get_by_label(lbl, exact=True).blur()
    settle(pg); im = dl(pg, "crop1")
    ref = SRC.crop((200, 100, 800, 500)); d = np.abs(np.asarray(im.convert("RGB")).astype(int) - np.asarray(ref).astype(int))
    check("crop numeric 200,100 600×400 → exact region", im.size == (600, 400) and d.max() <= 1, f"{im.size} maxdiff {d.max()}")
    b.close()
    b, c, pg, errs = open_tool(p, "crop"); pg.wait_for_selector("text=Rule-of-thirds")
    pg.get_by_role("button", name="16:9", exact=True).click(); pg.wait_for_timeout(300)
    w = int(pg.get_by_label("Width", exact=True).input_value()); h = int(pg.get_by_label("Height", exact=True).input_value())
    check("16:9 chip locks the ratio (±1px)", abs(w / h - 16 / 9) < 0.02, f"{w}×{h}")
    # drag the SE handle and make sure ratio is kept
    box = pg.locator("[data-handle=se]").bounding_box(); pg.mouse.move(box["x"] + box["width"]/2, box["y"] + box["height"]/2); pg.mouse.down(); pg.mouse.move(box["x"] - 60, box["y"] - 20, steps=6); pg.mouse.up(); pg.wait_for_timeout(300)
    w2 = int(pg.get_by_label("Width", exact=True).input_value()); h2 = int(pg.get_by_label("Height", exact=True).input_value())
    check("dragging a handle keeps 16:9 and shrinks the crop", abs(w2 / h2 - 16 / 9) < 0.02 and w2 < w, f"{w}×{h} → {w2}×{h2}")
    b.close()
    b, c, pg, errs = open_tool(p, "crop"); pg.wait_for_selector("text=Rule-of-thirds")
    pg.get_by_role("button", name="Select everything").click(); pg.get_by_text("Rotate & flip").click(); pg.get_by_label("Flip horizontally").check(); settle(pg)
    im = dl(pg, "cropflip"); check("crop + flip horizontal: pixel-exact mirror", np.abs(np.asarray(im.convert("RGB")).astype(int) - np.asarray(SRC)[:, ::-1].astype(int)).max() <= 1 and im.size == (1600, 1000))
    b.close()
    b, c, pg, errs = open_tool(p, "circle"); settle(pg)
    im = dl(pg, "circle").convert("RGBA"); a = np.asarray(im)
    check("circle cropper: 512×512 PNG, transparent corners, opaque centre", im.size == (512, 512) and a[0, 0, 3] == 0 and a[256, 256, 3] == 255, f"{im.size}")
    b.close()
    b, c, pg, errs = open_tool(p, "pfp"); pg.wait_for_selector("text=Frame"); pg.get_by_role("radio", name="Rounded").click(); pg.get_by_label("Size (square)", exact=True).fill("256"); pg.get_by_label("Size (square)", exact=True).blur(); settle(pg)
    im = dl(pg, "pfp").convert("RGBA"); a = np.asarray(im); check("profile picture: 256×256 rounded, corner transparent", im.size == (256, 256) and a[0, 0, 3] == 0 and a[128, 128, 3] == 255, f"{im.size}")
    b.close()
print(f"{sum(res)}/{len(res)} passed")
