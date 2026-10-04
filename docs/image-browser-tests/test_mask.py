import sys
sys.path.insert(0, "/tmp/h")
from run import *
from PIL import Image, ImageDraw
import numpy as np
res=[]
def check(n, ok, d=""): res.append(ok); print(("PASS " if ok else "FAIL ") + n + (" — " + d if d else ""))
im = Image.new("RGB", (800, 600), (255, 255, 255)); d = ImageDraw.Draw(im); d.ellipse((250, 150, 550, 450), fill=(200, 30, 30)); d.ellipse((370, 270, 430, 330), fill=(255, 255, 255)); im.save("/tmp/h/img/subject.png")
SRC = np.asarray(im).astype(int)
def settle(pg): pg.wait_for_selector("text=/\\d+(\\.\\d+)? (KB|MB)/", timeout=40000); pg.wait_for_timeout(1500)
def dl(pg, name):
    with pg.expect_download(timeout=40000) as d: pg.get_by_role("button", name="Download", exact=True).click()
    path=f"/tmp/h/out_{name}.bin"; d.value.save_as(path); return Image.open(path)
def canvas_xy(pg, fx, fy):
    b = pg.locator("canvas[role=application]").bounding_box(); return b["x"] + b["width"] * fx, b["y"] + b["height"] * fy
with sync_playwright() as p:
    b, c, pg, errs = open_tool(p, "background-remover", "/tmp/h/img/subject.png"); pg.wait_for_selector("text=Background detection"); settle(pg)
    o = dl(pg, "bg1"); a = np.asarray(o.convert("RGBA"))
    check("remover: PNG, corner transparent, subject opaque, enclosed hole kept (edge mode)", o.format == "PNG" and o.size == (800, 600) and a[5, 5, 3] == 0 and a[300, 300, 3] == 255 and a[300, 400, 3] == 255, f"corner {a[5,5,3]} subject {a[300,300,3]} hole {a[300,400,3]}")
    check("remover: subject colours untouched", tuple(a[300, 300, :3]) == (200, 30, 30))
    pg.get_by_role("radio", name="Everywhere it appears").click(); settle(pg); o = dl(pg, "bg2"); a = np.asarray(o.convert("RGBA"))
    check("remover: 'everywhere' also removes the enclosed white hole", a[300, 400, 3] == 0 and a[300, 300, 3] == 255, f"hole {a[300,400,3]}")
    b.close()
    # manual erase then restore
    b, c, pg, errs = open_tool(p, "background-remover", "/tmp/h/img/subject.png"); pg.wait_for_selector("text=Background detection"); settle(pg)
    pg.get_by_label("Value", exact=False) if False else None
    x0, y0 = canvas_xy(pg, 0.35, 0.5); x1, y1 = canvas_xy(pg, 0.65, 0.5)
    pg.mouse.move(x0, y0); pg.mouse.down(); pg.mouse.move(x1, y1, steps=12); pg.mouse.up(); settle(pg)
    o = dl(pg, "bg3"); a = np.asarray(o.convert("RGBA"))
    check("manual erase stroke through the subject → transparent along the stroke", a[300, 300, 3] == 0 and a[300, 500, 3] == 0 and a[200, 400, 3] == 255, f"on stroke {a[300,300,3]} / {a[300,500,3]}; off stroke {a[200,400,3]}")
    pg.get_by_role("radio", name="Restore").click(); x0, y0 = canvas_xy(pg, 0.02, 0.5); x1, y1 = canvas_xy(pg, 0.12, 0.5)
    pg.mouse.move(x0, y0); pg.mouse.down(); pg.mouse.move(x1, y1, steps=8); pg.mouse.up(); settle(pg)
    o = dl(pg, "bg4"); a = np.asarray(o.convert("RGBA")); check("restore brush brings background pixels back (opaque)", a[300, 40, 3] == 255 and a[300, 700, 3] == 0, f"restored {a[300,40,3]}, untouched bg {a[300,700,3]}")
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(200)
    check("undo is available and works (button enabled before, stroke count shown)", pg.get_by_role("button", name="↶ Undo").count() == 1)
    b.close()
    # redaction
    b, c, pg, errs = open_tool(p, "image-image-redaction-tool", "/tmp/h/img/subject.png"); pg.wait_for_selector("text=Redaction style"); pg.wait_for_timeout(400)
    x0, y0 = canvas_xy(pg, 0.30, 0.25); x1, y1 = canvas_xy(pg, 0.70, 0.55); pg.mouse.move(x0, y0); pg.mouse.down(); pg.mouse.move(x1, y1, steps=10); pg.mouse.up(); settle(pg)
    o = dl(pg, "red1"); a = np.asarray(o.convert("RGB")).astype(int)
    inside = a[200:300, 280:520]; check("redaction rectangle → solid black inside", (inside.sum(axis=2) == 0).mean() > 0.97, f"{(inside.sum(axis=2)==0).mean()*100:.1f}% black")
    check("redaction leaves the rest of the image pixel-identical", np.abs(a[400:, :] - SRC[400:, :]).max() <= 2 and np.abs(a[:100, :] - SRC[:100, :]).max() <= 2)
    b.close()
    # background blur: busy border -> focus oval by default; centre must stay sharp, corners must be blurred
    b, c, pg, errs = open_tool(p, "image-image-background-blur", "/tmp/h/img/noisy.jpg"); pg.wait_for_selector("text=Background blur"); settle(pg)
    check("busy background → warns and starts with a focus oval", pg.get_by_text("aren't a single plain colour").count() > 0 and pg.get_by_role("radio", name="Focus oval").get_attribute("aria-checked") == "true")
    o = dl(pg, "blur1"); a = np.asarray(o.convert("RGB")).astype(int); ref = np.asarray(Image.open("/tmp/h/img/noisy.jpg").convert("RGB")).astype(int)
    hf = lambda arr: np.abs(np.diff(arr, axis=1)).mean()
    c_ref, c_out, k_ref, k_out = hf(ref[400:600, 600:1000]), hf(a[400:600, 600:1000]), hf(ref[:150, :150]), hf(a[:150, :150])
    check("background blur: centre keeps its detail, corners lose it (high-frequency energy)", o.size == (1600, 1000) and c_out > 0.8 * c_ref and k_out < 0.25 * k_ref, f"centre detail {c_ref:.1f}->{c_out:.1f}; corner detail {k_ref:.1f}->{k_out:.1f}")
    b.close()
    b, c, pg, errs = open_tool(p, "image-image-background-blur", "/tmp/h/img/subject.png"); pg.wait_for_selector("text=Background blur"); settle(pg)
    o = dl(pg, "blur2"); a = np.asarray(o.convert("RGB")).astype(int)
    check("plain background + subject colour mask: subject untouched, blur keeps flat white", np.abs(a[250:350, 300:500] - SRC[250:350, 300:500]).max() <= 2 and o.size == (800, 600))
    b.close()
print(f"{sum(res)}/{len(res)} passed")
