import sys, json, time
from playwright.sync_api import sync_playwright
CSS = '.absolute{position:absolute}.relative{position:relative}.overflow-hidden{overflow:hidden}.inset-0{inset:0}.size-full{width:100%;height:100%}.flex{display:flex}.justify-center{justify-content:center}.pointer-events-none{pointer-events:none}.touch-none{touch-action:none}.size-8{width:2rem;height:2rem}.hidden{display:none}'
HTML = "<!doctype html><style>" + CSS + "</style><meta name=viewport content='width=device-width,initial-scale=1'><body style='font-family:sans-serif;margin:8px'><div id=root></div><script src='file:///tmp/h/out.js'></script>"
open("/tmp/h/index.html","w").write(HTML)
def open_tool(p, op, img="/tmp/h/img/photo.png", w=1280, h=900):
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width":w,"height":h}, accept_downloads=True); pg = ctx.new_page()
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
    pg.goto(f"file:///tmp/h/index.html?op={op}")
    pg.set_input_files("input[type=file]", img)
    pg.wait_for_selector("text=Choose another image", timeout=15000)
    return b, ctx, pg, errs
