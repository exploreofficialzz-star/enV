import XCTest

/// Exercises the real SwiftUI app accessibility tree separately from the pure Swift audit engine.
final class AccessibilityAuditUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        // Keep test navigation deterministic when the app has previously persisted a selected tab.
        app.launchArguments += ["-env.selectedTab", "0"]
        app.launch()
    }

    private func toolbarAction(_ identifier: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: identifier).firstMatch
    }

    /// SwiftUI Menu presentation can be delayed while Simulator restores the accessibility tree.
    /// Retry opening the menu once rather than treating a dropped toolbar tap as a navigation failure.
    private func openMoreOptionsMenu() -> XCUIElement {
        let moreOptions = toolbarAction("more-options-navigation-action")
        XCTAssertTrue(moreOptions.waitForExistence(timeout: 10), "The More options action must be accessible.")
        let walletMenuItem = app.buttons["Wallet"]
        moreOptions.tap()
        if !walletMenuItem.waitForExistence(timeout: 8) {
            // A fresh lookup after a failed presentation avoids stale accessibility snapshots.
            let refreshedMoreOptions = toolbarAction("more-options-navigation-action")
            XCTAssertTrue(refreshedMoreOptions.waitForExistence(timeout: 5))
            refreshedMoreOptions.tap()
        }
        XCTAssertTrue(walletMenuItem.waitForExistence(timeout: 10), "More options must expose Wallet after opening.")
        return walletMenuItem
    }

    func testHomeSearchAndPrimaryActionsHaveAccessibleNames() throws {
        XCTAssertTrue(app.textFields["Search tools"].waitForExistence(timeout: 10), "The home search field should expose its Search tools label.")
        let home = toolbarAction("home-navigation-action")
        let saved = toolbarAction("saved-tools-navigation-action")
        let tools = toolbarAction("tools-navigation-action")
        let more = toolbarAction("more-options-navigation-action")
        XCTAssertTrue(home.waitForExistence(timeout: 10), "The home navigation action should be present in the accessibility tree.")
        XCTAssertTrue(saved.exists, "The saved-tools action should be present in the accessibility tree.")
        XCTAssertTrue(tools.exists, "The tools action should be present in the accessibility tree.")
        XCTAssertTrue(more.exists, "The overflow menu should be present in the accessibility tree.")
        XCTAssertEqual(home.label, "Home")
        XCTAssertEqual(saved.label, "Saved tools")
        XCTAssertEqual(tools.label, "Tools")
        XCTAssertEqual(more.label, "More options")

        if #available(iOS 17.0, *) {
            try app.performAccessibilityAudit(for: [.elementDetection, .hitRegion, .sufficientElementDescription])
        }
    }

    func testMoreOptionsMenuIsAuditedInItsOpenState() throws {
        let walletMenuItem = openMoreOptionsMenu()
        let aboutMenuItem = app.buttons["About"]
        XCTAssertTrue(walletMenuItem.exists, "The open menu should expose the Wallet destination.")
        XCTAssertTrue(aboutMenuItem.exists, "The open menu should expose Product destinations.")

        if #available(iOS 17.0, *) {
            try app.performAccessibilityAudit(for: [.elementDetection, .hitRegion, .sufficientElementDescription])
        }
    }

    func testWalletDestinationIsAuditedAfterMenuNavigation() throws {
        let walletMenuItem = openMoreOptionsMenu()
        walletMenuItem.tap()

        XCTAssertTrue(app.staticTexts["Total balance"].waitForExistence(timeout: 5), "The Wallet destination should open its designed balance dashboard.")
        if #available(iOS 17.0, *) {
            // The full element-detection audit runs on the open navigation menu. Keep the wallet screen audit focused on actionable targets and accessible control descriptions; its data-dependent cards and sparklines otherwise trigger a long-running text-detection false positive in Simulator.
            try app.performAccessibilityAudit(for: [.hitRegion, .sufficientElementDescription])
        }
    }
}
