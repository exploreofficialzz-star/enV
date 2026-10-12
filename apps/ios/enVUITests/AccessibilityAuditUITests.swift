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
            try app.performAccessibilityAudit()
        }
    }

    func testMoreOptionsMenuIsAuditedInItsOpenState() throws {
        let moreOptions = toolbarAction("more-options-navigation-action")
        XCTAssertTrue(moreOptions.waitForExistence(timeout: 10))
        moreOptions.tap()

        // Query the menu action, not the Home TextField which carries the same accessibility label.
        let searchMenuItem = app.buttons["Search tools"]
        XCTAssertTrue(searchMenuItem.waitForExistence(timeout: 5), "The open menu should expose its Search tools action.")

        if #available(iOS 17.0, *) {
            try app.performAccessibilityAudit()
        }
    }

    func testSearchDestinationIsAuditedAfterMenuNavigation() throws {
        let moreOptions = toolbarAction("more-options-navigation-action")
        XCTAssertTrue(moreOptions.waitForExistence(timeout: 10))
        moreOptions.tap()

        let searchMenuItem = app.buttons["Search tools"]
        XCTAssertTrue(searchMenuItem.waitForExistence(timeout: 5))
        searchMenuItem.tap()

        XCTAssertTrue(app.textFields["Search tools"].waitForExistence(timeout: 5), "The native Search screen should expose a named search field.")
        if #available(iOS 17.0, *) {
            try app.performAccessibilityAudit()
        }
    }
}
