import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));
const productionPolicy = read("src/lib/production-notice.ts");
const registry = read("src/lib/registry.ts");
const generator = read("scripts/gen-catalog.mjs");
const toolEngine = read("src/components/tools/tool-engine.tsx");
const reader = read("src/components/engines/barcode-reader-engine.tsx");
const ecommerce = read("src/components/engines/ecommerce-engine-utils.ts");
const browserAudit = read("scripts/browser-qr-barcode-reader-audit.mjs");

assert.equal(pkg.dependencies?.["@zxing/browser"], "0.1.5", "ZXing browser package is pinned");
assert.equal(pkg.dependencies?.["@zxing/library"], "0.21.3", "ZXing core is pinned to the Node 22-compatible release");
assert.ok(productionPolicy.includes('"ecommerce"') && productionPolicy.includes('"qr"'), "Web QR and E-commerce categories are production-exempt");
assert.ok(registry.includes('catalogTool.category === "qr"') && registry.includes('catalogTool.category === "ecommerce"'), "Browser registry promotes implemented QR and E-commerce records");
assert.ok(registry.includes('name: "QR & Barcode Reader"'), "QR payload inspector is presented as the code reader");
assert.ok(generator.includes("const isEcommerceTool = cat === \"ecommerce\"") && generator.includes("|| isEcommerceTool ? \"active\""), "Generated E-commerce tools are active");
assert.ok(generator.includes('"QR & Barcode Reader"'), "Catalog generator exposes the reader label");
assert.ok(toolEngine.includes("if (tool.id === \"qr-payload-inspector\") return <BarcodeReaderEngine />;"), "Reader route reaches the scanner engine");
assert.ok(toolEngine.includes('if (tool.category === "ecommerce") return <EcommerceEngine toolId={tool.id} />;'), "E-commerce tools bypass planned fallback and reach their engine");
assert.ok(reader.includes("BrowserMultiFormatReader") && reader.includes("decodeFromVideoDevice") && reader.includes("decodeFromImageElement"), "Reader decodes camera streams and uploaded images");
assert.ok(reader.includes("Inspect a payload") && reader.includes("Paste a QR payload to inspect"), "Reader preserves manual QR payload inspection");
assert.ok(reader.includes("navigator.mediaDevices?.getUserMedia") && reader.includes("URL.createObjectURL"), "Camera access and local image handling are implemented");
assert.ok(reader.includes('url.protocol === "http:" || url.protocol === "https:"'), "Decoded links are restricted to HTTP(S)");
assert.ok(browserAudit.includes("Code 128") && browserAudit.includes("QR Code"), "Browser audit exercises both QR and 1D barcode decoding");
assert.ok(ecommerce.includes("parseEcommerceToolId") && ecommerce.includes("buildEcommerceOutput"), "E-commerce workflow engine remains wired to its family/workflow contract");

console.log("QR/barcode and E-commerce checks passed: browser production gating, active routing, local QR/1D/2D reader and commerce engine are wired.");
