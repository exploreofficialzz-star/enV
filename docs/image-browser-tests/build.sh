#!/bin/bash
# Bundles the Images engine for the browser tests. Used where node_modules is unavailable; set ESBUILD / REACT_DIR to your own paths.
set -e
H=${IMG_TEST_DIR:-/tmp/h}; PROJ=${PROJ:-$(cd "$(dirname "$0")/../.." && pwd)}
ESBUILD=${ESBUILD:-esbuild}; NM=${REACT_DIR:-$PROJ/node_modules}
cd "$PROJ"
# icons are shimmed as plain <span>s; regenerate the shim from every lucide import in the source tree
python3 - "$PROJ" "$H" <<'PY'
import re, glob, sys
proj, h = sys.argv[1], sys.argv[2]; names = set()
for f in glob.glob(proj + "/src/**/*.ts*", recursive=True):
    for m in re.finditer(r'import\s*\{([^}]*)\}\s*from\s*"lucide-react"', open(f, errors="ignore").read()):
        for n in m.group(1).split(","):
            n = n.strip().split(" as ")[0].replace("type ", "").strip()
            if n and n != "LucideIcon": names.add(n)
src = 'import * as React from "react";\nconst mk = (name: string) => (props: any) => React.createElement("span", { "data-icon": name, ...props });\n' + "\n".join(f'export const {n} = mk("{n}");' for n in sorted(names)) + "\n"
open(h + "/shims/lucide.tsx", "w").write(src)
PY
$ESBUILD $H/entry.tsx --bundle --outfile=$H/out.js --format=iife --jsx=automatic --target=es2022 --log-level=warning \
  --define:process.env.NODE_ENV='"development"' --loader:.ts=ts --loader:.tsx=tsx \
  --alias:@=$PROJ/src --alias:lucide-react=$H/shims/lucide.tsx --alias:clsx=$H/shims/cn.ts --alias:tailwind-merge=$H/shims/cn.ts \
  --alias:class-variance-authority=$H/shims/cn.ts --alias:@radix-ui/react-slot=$H/shims/cn.ts --alias:@tanstack/react-router=$H/shims/router.tsx \
  --alias:@/lib/registry=$H/shims/registry.ts --alias:react=$NM/react --alias:react-dom=$NM/react-dom
echo "built $(wc -c < $H/out.js) bytes"
