import sys, os
sys.path.insert(0, "/tmp/h")
from run import *
from PIL import Image
import numpy as np
SRC = np.asarray(Image.open("/tmp/h/img/photo.png").convert("RGBA")).astype(int)
results = []
def check(name, ok, detail=""):
    results.append(ok); print(("PASS " if ok else "FAIL ") + name + (" — " + detail if detail else ""))

def run_op(p, op, setup=None, img="/tmp/h/img/photo.png"):
    b, ctx, pg, errs = open_tool(p, op, img)
    try:
        if setup: setup(pg)
        pg.wait_for_selector("text=Full resolution", timeout=20000)
        pg.wait_for_selector("text=/\\d+(\\.\\d+)? (KB|MB|B)/", timeout=20000)
        pg.wait_for_timeout(900)
        with pg.expect_download(timeout=20000) as d: pg.get_by_role("button", name="Download", exact=True).click()
        path = f"/tmp/h/out_{op}.bin"; d.value.save_as(path)
        out = Image.open(path); out.load()
        return out, d.value.suggested_filename, errs
    finally:
        b.close()

def num(pg, label, value): 
    pg.get_by_label(f"{label} value", exact=True).fill(str(value)); pg.get_by_label(f"{label} value", exact=True).blur()

with sync_playwright() as p:
    out, fn, errs = run_op(p, "levels", lambda pg: num(pg, "Brightness", 40))
    a = np.asarray(out.convert("RGB")).astype(int)
    check("levels: brightness +40 brightens, same size, PNG kept", a.mean() > SRC[..., :3].mean() + 8 and out.size == (1600, 1000) and out.format == "PNG", f"mean {SRC[...,:3].mean():.1f}->{a.mean():.1f} {out.format} {fn}")
    out, fn, errs = run_op(p, "grayscale")
    a = np.asarray(out.convert("RGB")).astype(int)
    check("grayscale: R=G=B everywhere", np.abs(a[..., 0] - a[..., 1]).max() <= 1 and np.abs(a[..., 1] - a[..., 2]).max() <= 1)
    out, fn, errs = run_op(p, "invert")
    a = np.asarray(out.convert("RGB")).astype(int)
    check("invert: every pixel = 255 − original", np.abs(a - (255 - SRC[..., :3])).max() <= 1)
    out, fn, errs = run_op(p, "blur", lambda pg: num(pg, "Strength", 20))
    a = np.asarray(out.convert("RGB")).astype(int)
    edge = SRC[500, 295:305, :3].astype(int); edge2 = a[500, 295:305]
    check("blur: size kept, hard edge softened", out.size == (1600, 1000) and np.abs(np.diff(edge2, axis=0)).max() < np.abs(np.diff(edge, axis=0)).max(), f"edge step {np.abs(np.diff(edge,axis=0)).max()}->{np.abs(np.diff(edge2,axis=0)).max()}")
    out, fn, errs = run_op(p, "sharpen", lambda pg: num(pg, "Amount", 250))
    a = np.asarray(out.convert("RGB")).astype(int)
    check("sharpen: changes pixels, keeps size", out.size == (1600, 1000) and np.abs(a - SRC[..., :3]).max() > 5)
    out, fn, errs = run_op(p, "image-image-pixelation-tool", lambda pg: (pg.get_by_role("radio", name="Pixels", exact=True).click(), num(pg, "Block size", 20)))
    a = np.asarray(out.convert("RGB")).astype(int)
    check("pixelate: 20px blocks are flat", out.size == (1600, 1000) and np.ptp(a[100:120, 100:120].reshape(-1, 3), axis=0).max() == 0)
    out, fn, errs = run_op(p, "border", lambda pg: num(pg, "Thickness", 30))
    check("border: 30px on all sides → 1660×1060", out.size == (1660, 1060), str(out.size))
    out, fn, errs = run_op(p, "rounded", lambda pg: (pg.get_by_role("radio", name="Pixels", exact=True).click(), num(pg, "Radius", 200)))
    a = np.asarray(out.convert("RGBA"))
    check("rounded: PNG with transparent corners, opaque centre", out.format == "PNG" and a[0, 0, 3] == 0 and a[500, 800, 3] == 255, f"{out.format} corner a={a[0,0,3]}")
    out, fn, errs = run_op(p, "image-image-shadow-generator")
    a = np.asarray(out.convert("RGBA"))
    check("shadow: canvas grows, outer corner transparent, shadow pixels semi-transparent", out.size[0] > 1600 and a[0, 0, 3] == 0 and ((a[..., 3] > 0) & (a[..., 3] < 255)).sum() > 1000, str(out.size))
    out, fn, errs = run_op(p, "rotate", lambda pg: pg.get_by_role("button", name="90° clockwise").click())
    a = np.asarray(out.convert("RGB")).astype(int)
    ref = np.rot90(SRC[..., :3], k=-1)
    check("rotate 90° CW: 1000×1600 and pixel-exact", out.size == (1000, 1600) and np.abs(a - ref).max() <= 2, f"{out.size} maxdiff {np.abs(a-ref).max()}")
    out, fn, errs = run_op(p, "flip")
    a = np.asarray(out.convert("RGB")).astype(int)
    check("flip horizontal: pixel-exact mirror", np.abs(a - SRC[:, ::-1, :3]).max() <= 1)
    out, fn, errs = run_op(p, "image-image-circle-mask-generator")
    a = np.asarray(out.convert("RGBA"))
    check("circle mask: corners transparent, centre opaque, PNG", out.format == "PNG" and a[0, 0, 3] == 0 and a[500, 800, 3] == 255)
    out, fn, errs = run_op(p, "levels", lambda pg: num(pg, "Exposure", 1), img="/tmp/h/img/transparent.png")
    a = np.asarray(out.convert("RGBA"))
    check("transparent PNG: alpha preserved through tone adjustment", (a[..., 3] == np.asarray(Image.open('/tmp/h/img/transparent.png').convert('RGBA'))[..., 3]).all())
print(f"\n{sum(results)}/{len(results)} passed")
