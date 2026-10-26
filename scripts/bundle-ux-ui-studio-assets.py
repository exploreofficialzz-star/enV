"""Refresh the small, licensed offline Studio preview library from upstream sources.

Run from the repository root. Network access is used only by this maintenance
script; the generated files are shipped with each application.
"""
import concurrent.futures
import json
import pathlib
import re
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CATALOG = ROOT / "src/components/engines/ux-ui-studio-engine.tsx"
DESTINATIONS = [ROOT / "public/uxui", ROOT / "apps/shared", ROOT / "apps/ios/enV/StudioAssets"]
EXTRA_LUCIDE = "a-arrow-down a-arrow-up a-large-small align-center align-end-horizontal align-end-vertical align-start-horizontal align-start-vertical align-horizontal-distribute-center align-vertical-distribute-center app-window arrow-down-left arrow-up-right baseline book-a box circle-dashed circle-dot-dashed columns-2 crop focus frame grid-2x2 grid-3x3 grip-horizontal hand helping-hand image-plus indent-decrease indent-increase letter-text ligature list-filter move-diagonal move-horizontal move-vertical panel-bottom-open panel-left-open panel-right-open panel-top-open pilcrow rectangle-ellipsis rotate-ccw rotate-cw rows-2 scan-text scaling separator-horizontal separator-vertical space text-cursor text-cursor-input text-select type-outline wrap-text".split()
FONTS = {
    "inter": ("Inter", "inter/Inter[opsz,wght].ttf"),
    "lora": ("Lora", "lora/Lora[wght].ttf"),
    "jetbrains-mono": ("JetBrains Mono", "jetbrainsmono/JetBrainsMono[wght].ttf"),
    "bebas-neue": ("Bebas Neue", "bebasneue/BebasNeue-Regular.ttf"),
    "caveat": ("Caveat", "caveat/Caveat[wght].ttf"),
}
ICON_LICENSE_URLS = {
    "carbon": "https://raw.githubusercontent.com/carbon-design-system/carbon/main/LICENSE",
    "fa6-solid": "https://raw.githubusercontent.com/FortAwesome/Font-Awesome/6.x/LICENSE.txt",
    "fluent": "https://raw.githubusercontent.com/microsoft/fluentui-system-icons/main/LICENSE",
    "heroicons": "https://raw.githubusercontent.com/tailwindlabs/heroicons/master/LICENSE",
    "lucide": "https://raw.githubusercontent.com/lucide-icons/lucide/main/LICENSE",
    "material-symbols": "https://raw.githubusercontent.com/google/material-design-icons/master/LICENSE",
    "mdi": "https://raw.githubusercontent.com/Templarian/MaterialDesign/master/LICENSE",
    "mingcute": "https://raw.githubusercontent.com/Richard9394/MingCute/main/LICENSE",
    "ph": "https://raw.githubusercontent.com/phosphor-icons/core/main/LICENSE",
    "tabler": "https://raw.githubusercontent.com/tabler/tabler-icons/main/LICENSE",
}


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "enV-Studio-assets/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def write_all(relative, content):
    for destination in DESTINATIONS:
        path = destination / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)


def icon_svg(collection, name):
    icon = collection["icons"].get(name)
    alias = collection.get("aliases", {}).get(name)
    if icon is None and alias:
        parent = alias["parent"]
        parent_svg = icon_svg(collection, parent)
        if parent_svg is None:
            return None
        # Iconify aliases in the curated library are plain renames. Reject
        # transformed aliases instead of silently drawing the wrong glyph.
        if any(alias.get(key) for key in ("rotate", "hFlip", "vFlip")):
            return None
        return parent_svg
    if icon is None:
        return None
    width = icon.get("width", collection.get("width", 16))
    height = icon.get("height", collection.get("height", 16))
    left, top = icon.get("left", 0), icon.get("top", 0)
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="{left} {top} {width} {height}">{icon["body"]}</svg>'


def main():
    source = CATALOG.read_text()
    start = source.index("const ICON_BROWSE_CATEGORIES:")
    end = source.index("const SWATCHES", start)
    identifiers = set(re.findall(r'"([a-z0-9-]+:[a-z0-9-]+)"', source[start:end]))
    identifiers.update("lucide:" + name for name in EXTRA_LUCIDE)
    groups = {}
    for identifier in identifiers:
        prefix, name = identifier.split(":")
        groups.setdefault(prefix, set()).add(name)
    icons, collections, unavailable = {}, {}, []

    def load_collection(pair):
        prefix, names = pair
        url = "https://raw.githubusercontent.com/iconify/icon-sets/master/json/" + prefix + ".json"
        return prefix, names, json.loads(fetch(url)), url

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for prefix, names, collection, url in pool.map(load_collection, sorted(groups.items())):
            info = collection.get("info", {})
            collections[prefix] = {"name": info.get("name", prefix), "author": info.get("author", {}), "license": info.get("license", {}), "source": url}
            if prefix in ICON_LICENSE_URLS:
                write_all("licenses/" + prefix + ".txt", fetch(ICON_LICENSE_URLS[prefix]))
            else:
                # CC BY attribution permits linking to the license. Preserve
                # creator, original collection and license links in the bundle.
                notice = {"collection": collections[prefix], "modifications": "Selected icon subset; original vector geometry retained."}
                write_all("licenses/" + prefix + ".txt", json.dumps(notice, indent=2).encode())
            for name in sorted(names):
                svg = icon_svg(collection, name)
                if svg:
                    icons[prefix + ":" + name] = svg
                else:
                    unavailable.append(prefix + ":" + name)

    manifest = {"schemaVersion": 1, "source": "Iconify collections; original upstream license applies to each collection", "collections": collections, "unavailable": sorted(unavailable), "additionalIcons": ["lucide:" + name for name in EXTRA_LUCIDE if "lucide:" + name in icons]}
    write_all("uxui-icons.json", json.dumps(dict(sorted(icons.items())), ensure_ascii=False, separators=(",", ":")).encode())
    # The web URL is kept short; native bundles use uxui-icons.json.
    (ROOT / "public/uxui/uxui-icons.json").rename(ROOT / "public/uxui/icons.json")
    write_all("uxui-icon-licenses.json", json.dumps(manifest, indent=2).encode())
    font_manifest = []
    for slug, (family, path) in FONTS.items():
        url = "https://raw.githubusercontent.com/google/fonts/main/ofl/" + urllib.parse.quote(path, safe="/")
        font = fetch(url)
        assert font[:4] in (b"\x00\x01\x00\x00", b"OTTO"), "Expected a real OpenType font"
        write_all("fonts/" + slug + ".ttf", font)
        license_url = "https://raw.githubusercontent.com/google/fonts/main/ofl/" + path.split("/")[0] + "/OFL.txt"
        write_all("fonts/" + slug + "-OFL.txt", fetch(license_url))
        font_manifest.append({"family": family, "file": "fonts/" + slug + ".ttf", "license": "SIL Open Font License 1.1", "source": url})
    write_all("uxui-fonts.json", json.dumps(font_manifest, indent=2).encode())
    print(json.dumps({"bundledIcons": len(icons), "additionalIcons": len(manifest["additionalIcons"]), "unavailableIds": sorted(unavailable), "fonts": len(font_manifest)}, indent=2))


if __name__ == "__main__":
    main()
