from pathlib import Path
from playwright.sync_api import sync_playwright

Path("/workspace/.grok/favicon-preview.html").write_text(
    """<!doctype html>
<html><head><style>
  html,body{margin:0;background:#888;}
  .row{display:flex;gap:16px;align-items:center;padding:16px;background:#fff;}
  .row.dark{background:#1a1a1a;}
  img{display:block;}
</style></head><body>
  <div class="row">
    <img src="favicon.svg" width="16" height="16">
    <img src="favicon.svg" width="32" height="32">
    <img src="favicon.svg" width="64" height="64">
    <img src="favicon.svg" width="180" height="180">
  </div>
  <div class="row dark">
    <img src="favicon.svg" width="16" height="16">
    <img src="favicon.svg" width="32" height="32">
    <img src="favicon.svg" width="64" height="64">
  </div>
</body></html>
"""
)
Path("/workspace/.grok/favicon-16.html").write_text(
    '<html><body style="margin:0;background:#fff">'
    '<img src="favicon.svg" width="16" height="16"></body></html>'
)
Path("/workspace/.grok/favicon-32.html").write_text(
    '<html><body style="margin:0;background:#fff">'
    '<img src="favicon.svg" width="32" height="32"></body></html>'
)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 520, "height": 280})
    page.goto("file:///workspace/.grok/favicon-preview.html")
    page.screenshot(path="/workspace/.grok/favicon-preview.png")

    p16 = browser.new_page(viewport={"width": 16, "height": 16}, device_scale_factor=1)
    p16.goto("file:///workspace/.grok/favicon-16.html")
    p16.screenshot(path="/workspace/.grok/favicon-16.png")

    p32 = browser.new_page(viewport={"width": 32, "height": 32}, device_scale_factor=1)
    p32.goto("file:///workspace/.grok/favicon-32.html")
    p32.screenshot(path="/workspace/.grok/favicon-32.png")
    browser.close()
print("ok")
