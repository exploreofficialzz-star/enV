import XCTest
import CoreImage
import UIKit
@testable import enV

final class NativeEcommerceEngineTests: XCTestCase {
    private func tool(_ id: String) -> Tool {
        Tool(
            id: id,
            name: id,
            slug: id,
            description: "",
            category: "ecommerce",
            subcategory: nil,
            keywords: [],
            tags: [],
            icon: "ShoppingCart",
            popularity: 0,
            featured: false,
            clientSide: true,
            requiresBackend: false,
            requiresAuth: false,
            status: "active",
            disclaimer: nil,
            related: [],
            engine: ToolEngine(type: "custom", id: id, op: nil)
        )
    }

    func testAllNinetyEcommerceToolsHaveNativeHandlers() throws {
        let families = ["product", "order", "inventory", "shipping", "pricing", "discount", "coupon", "sku", "barcode", "catalog", "store", "customer", "return", "profit", "margin"]
        let workflows = ["generator", "calculator", "planner", "template", "mockup", "helper"]
        XCTAssertEqual(families.count * workflows.count, 90)
        for family in families {
            for workflow in workflows {
                let item = tool("\(family)-\(workflow)")
                XCTAssertTrue(NativeEcommerceEngine.supports(item), item.id)
                let values = NativeEcommerceEngine.initialValues(for: item)
                XCTAssertGreaterThan(try NativeEcommerceEngine.run(item, values: values).count, 20, item.id)
            }
        }
    }

    func testInventoryReorderPointIncludesLeadTimeAndSafetyStock() throws {
        let item = tool("inventory-calculator")
        let values = NativeEcommerceEngine.initialValues(for: item).merging([
            "stock": "20", "dailySales": "6", "leadTime": "5", "safetyStock": "4"
        ]) { _, new in new }
        let output = try NativeEcommerceEngine.run(item, values: values)
        XCTAssertTrue(output.contains("Reorder point: 34.00 units"))
        XCTAssertTrue(output.contains("Reorder review required"))
    }

    func testOrderAppliesDiscountTaxAndShipping() throws {
        let item = tool("order-calculator")
        let values = NativeEcommerceEngine.initialValues(for: item).merging([
            "price": "100", "quantity": "2", "discount": "10", "tax": "7.5", "shipping": "8"
        ]) { _, new in new }
        let output = try NativeEcommerceEngine.run(item, values: values)
        XCTAssertTrue(output.contains("Order subtotal: 200.00"))
        XCTAssertTrue(output.contains("Discount: 20.00"))
        XCTAssertTrue(output.contains("Tax estimate: 13.50"))
        XCTAssertTrue(output.contains("ORDER TOTAL: 201.50"))
    }

    func testProfitIncludesPaymentFeesPackagingAndAdvertising() throws {
        let item = tool("profit-calculator")
        let values = NativeEcommerceEngine.initialValues(for: item).merging([
            "cost": "40", "price": "100", "quantity": "2", "feePercent": "3",
            "packaging": "2", "advertising": "10"
        ]) { _, new in new }
        let output = try NativeEcommerceEngine.run(item, values: values)
        XCTAssertTrue(output.contains("Payment / platform fees: 6.00"))
        XCTAssertTrue(output.contains("Estimated contribution profit: 100.00"))
    }

    func testPricingCalculatorComparesCurrentAndTargetSellingPrice() throws {
        let item = tool("pricing-calculator")
        let values = NativeEcommerceEngine.initialValues(for: item).merging([
            "cost": "40", "price": "75", "packaging": "2",
            "feePercent": "3", "targetMargin": "30"
        ]) { _, new in new }
        let output = try NativeEcommerceEngine.run(item, values: values)
        XCTAssertTrue(output.contains("Target selling price: 62.69"))
        XCTAssertTrue(output.contains("Current selling price: 75.00"))
    }

    func testPricingCalculatorReportsBreakEvenImpossibleAtOneHundredPercentFees() throws {
        let item = tool("pricing-calculator")
        let values = NativeEcommerceEngine.initialValues(for: item).merging([
            "cost": "40", "packaging": "2", "feePercent": "100", "targetMargin": "0"
        ]) { _, new in new }
        let output = try NativeEcommerceEngine.run(item, values: values)
        XCTAssertTrue(output.contains("Minimum break-even price before tax and advertising: Not achievable with these fees"))
        XCTAssertTrue(output.contains("Target selling price: Not achievable with these fee and margin inputs"))
    }

    func testNegativeAndOutOfRangeInputsAreRejected() {
        let item = tool("discount-calculator")
        var values = NativeEcommerceEngine.initialValues(for: item)
        values["price"] = "-10"
        XCTAssertThrowsError(try NativeEcommerceEngine.run(item, values: values))
        values["price"] = "100"
        values["discount"] = "150"
        XCTAssertThrowsError(try NativeEcommerceEngine.run(item, values: values))
    }
}

final class NativeBarcodeCatalogCoverageTests: XCTestCase {
    func testAllFiftyTwoQrAndBarcodeCatalogEntriesHaveNativeHandlers() {
        let qr = [
            "app-store-qr-generator", "bitcoin-qr-generator", "calendar-qr-generator", "crypto-wallet-qr-generator",
            "discord-invite-qr-generator", "email-qr-generator", "ethereum-qr-generator", "event-qr-generator",
            "facebook-link-qr-generator", "google-play-qr-generator", "instagram-link-qr-generator",
            "linkedin-link-qr-generator", "location-qr-generator", "mecard-qr-generator", "phone-qr-generator",
            "qr-batch-generator", "qr-capacity-helper", "qr-code-high-error-correction", "qr-code-low-error-correction",
            "qr-code-styled", "qr-data-url-generator", "qr-generator", "qr-payload-encoder", "qr-payload-inspector",
            "qr-size-calculator", "qr-svg-generator", "qr-version-helper", "sms-qr-generator", "telegram-link-qr-generator",
            "text-qr-generator", "url-qr-generator", "vcard-qr-generator", "whatsapp-qr-generator", "wifi-qr-generator",
            "x-link-qr-generator", "youtube-link-qr-generator"
        ]
        let barcodes = [
            "barcode-label-generator", "barcode-svg-generator", "codabar-barcode", "code128-barcode",
            "code39-barcode", "ean13-barcode", "ean13-check-digit", "ean8-barcode", "gtin-validator",
            "isbn-check-digit", "isbn-barcode", "itf14-barcode", "msi-barcode", "pharmacode-barcode",
            "upc-barcode", "upc-check-digit"
        ]
        XCTAssertEqual(qr.count + barcodes.count, 52)
        XCTAssertEqual(Set(qr + barcodes), NativeBarcodeEngine.supportedToolIDs)
    }
}

final class NativeBarcodeReadRecordTests: XCTestCase {
    func testOnlyHTTPAndHTTPSPayloadsBecomeOpenableLinks() {
        XCTAssertEqual(NativeBarcodeReadRecord(value: "https://example.com/path", format: "QR").safeHTTPURL?.scheme, "https")
        XCTAssertEqual(NativeBarcodeReadRecord(value: "http://example.com", format: "QR").safeHTTPURL?.scheme, "http")
        XCTAssertNil(NativeBarcodeReadRecord(value: "javascript:alert(1)", format: "QR").safeHTTPURL)
        XCTAssertNil(NativeBarcodeReadRecord(value: "file:///private/data", format: "QR").safeHTTPURL)
        XCTAssertNil(NativeBarcodeReadRecord(value: "plain text", format: "QR").safeHTTPURL)
    }

    func testVisionReaderDecodesLocallyGeneratedQrImage() throws {
        let payload = "https://example.com/env-ios-qr-reader"
        let filter = CIFilter(name: "CIQRCodeGenerator")!
        filter.setValue(Data(payload.utf8), forKey: "inputMessage")
        filter.setValue("H", forKey: "inputCorrectionLevel")
        let generated = try XCTUnwrap(filter.outputImage)
        let scaled = generated.transformed(by: CGAffineTransform(scaleX: 8, y: 8))
        let cgImage = try XCTUnwrap(CIContext().createCGImage(scaled, from: scaled.extent))
        let png = try XCTUnwrap(UIImage(cgImage: cgImage).pngData())
        let decoded = try NativeBarcodeImageDecoder.decode(png)
        XCTAssertTrue(decoded.contains { $0.value == payload })
    }

    func testCodeReaderResultRetainsDetectedValueAndFormat() {
        let record = NativeBarcodeReadRecord(value: "ENV-CODE-123", format: "org.iso.Code128")
        XCTAssertEqual(record.value, "ENV-CODE-123")
        XCTAssertEqual(record.format, "org.iso.Code128")
    }
}
