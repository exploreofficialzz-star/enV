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

const androidGate = read("apps/android/app/src/main/java/com/chastech/env/MainActivity.kt");
const androidCatalog = read("apps/android/app/src/main/java/com/chastech/env/data/CatalogModels.kt");
const androidReader = read("apps/android/app/src/main/java/com/chastech/env/NativeBarcodeReader.kt");
const androidCommerce = read("apps/android/app/src/main/java/com/chastech/env/NativeEcommerceEngine.kt");
const iosCatalog = read("apps/ios/enV/CatalogCore.swift");
const iosViews = read("apps/ios/enV/ToolViews.swift");
const iosReader = read("apps/ios/enV/NativeQrBarcodeAndEcommerceViews.swift");
const iosCommerce = read("apps/ios/enV/NativeEcommerceEngine.swift");
const iosProject = read("apps/ios/enV.xcodeproj/project.pbxproj");
const executionPolicy = JSON.parse(read("apps/shared/execution-policy.json"));
const androidBackend = read("apps/android/app/src/main/java/com/chastech/env/NativeBackendEngine.kt");
const iosBackend = read("apps/ios/enV/ToolViews.swift");
const androidTests = read("apps/android/app/src/test/java/com/chastech/env/NativeEcommerceEngineTest.kt");
const androidReaderTests = read("apps/android/app/src/androidTest/java/com/chastech/env/NativeBarcodeReaderInstrumentedTest.kt");
const iosTests = read("apps/ios/enVTests/NativeEcommerceEngineTests.swift");
const webCommerceUi = read("src/components/engines/ecommerce-engine.tsx");
const webCommerceTests = read("src/components/engines/ecommerce-engine-utils.test.ts");


assert.ok(androidGate.includes('"ecommerce"') && androidGate.includes('"qr"'), "Android production gate exempts QR and E-commerce");
assert.ok(iosCatalog.includes('"ecommerce", "qr"'), "iOS production gate exempts QR and E-commerce");
assert.ok(androidCatalog.includes('category in setOf("qr", "ecommerce")') && androidCatalog.includes('"active"'), "Android catalog activates QR and E-commerce records");
assert.ok(iosCatalog.includes('["qr", "ecommerce"].contains(category.lowercased()) ? "active" : status'), "iOS catalog activates QR and E-commerce records");
assert.ok(androidReader.includes("ProcessCameraProvider") && androidReader.includes("NativeBarcodeCameraAnalyzer") && androidReader.includes("NativeBarcodeImageDecoder"), "Android QR/barcode reader uses CameraX, ZXing and local image decoding");
assert.ok(androidCommerce.includes("fun supports(tool: ToolRecord)") && androidCommerce.includes("fun execute("), "Android has its own native E-commerce engine");
assert.ok(androidCommerce.includes("safetyStock") && androidCommerce.includes("feePercent") && androidCommerce.includes("targetMargin"), "Android commerce engine includes inventory safety and pricing economics");
assert.ok(iosViews.includes('tool.id == "qr-payload-inspector" { NativeBarcodeReaderView() }') && iosViews.includes("NativeEcommerceEngine.supports(tool)"), "iOS native dispatch routes reader and E-commerce tools");
assert.ok(iosReader.includes("AVCaptureMetadataOutput") && iosReader.includes("VNDetectBarcodesRequest") && iosReader.includes("PhotosPicker"), "iOS reader uses AVFoundation and Vision for camera and image scanning");
assert.ok(iosCommerce.includes("static func supports(_ tool: Tool)") && iosCommerce.includes("static func run("), "iOS has an independent native E-commerce engine");
assert.ok(iosCommerce.includes("safetyStock") && iosCommerce.includes("feePercent") && iosCommerce.includes("targetMargin"), "iOS commerce engine includes inventory safety and pricing economics");
assert.ok(iosProject.includes("NativeEcommerceEngine.swift in Sources") && iosProject.includes("NativeQrBarcodeAndEcommerceViews.swift in Sources") && iosProject.includes("NativeEcommerceEngineTests.swift in Sources"), "iOS native engine and test files are registered in Xcode");

assert.ok(androidBackend.includes("if (NativeEcommerceEngine.supports(tool)) return false"), "Android local commerce operations never fall through to generic backend routing");
assert.ok(iosBackend.includes("if NativeEcommerceEngine.supports(tool) { return false }"), "iOS local commerce operations never fall through to generic backend routing");
assert.ok(androidReaderTests.includes("NativeBarcodeImageDecoder.decode") && androidReaderTests.includes("CODE_128"), "Android emulator test covers local QR and Code 128 decoding");
assert.ok(androidTests.includes("allNinetyCatalogWorkflowsHaveNativeHandlers") && androidTests.includes("safetyStock"), "Android tests the 90 native commerce workflows and safety-stock calculation");
assert.ok(iosTests.includes("testAllNinetyEcommerceToolsHaveNativeHandlers") && iosTests.includes("NativeBarcodeImageDecoder.decode"), "iOS tests native commerce workflows and Vision QR decoding");
assert.ok(webCommerceUi.includes("Advanced costs, stock and shipping") && webCommerceUi.includes("targetMargin") && webCommerceUi.includes("safetyStock"), "Web exposes advanced commerce pricing and inventory fields");
assert.ok(webCommerceTests.includes("safety stock") && webCommerceTests.includes("payment fees") && webCommerceTests.includes("target-margin"), "Web tests advanced commerce calculations");

for (const family of ["barcode", "qr", "ecommerce"]) {
  assert.equal(executionPolicy.families[family]?.web?.mode, "local", `${family} web mode is local`);
  assert.equal(executionPolicy.families[family]?.android?.mode, "local", `${family} Android mode is local`);
  assert.equal(executionPolicy.families[family]?.ios?.mode, "local", `${family} iOS mode is local`);
}


console.log("QR/barcode and E-commerce checks passed: browser production gating, active routing, local QR/1D/2D reader and commerce engine are wired.");
