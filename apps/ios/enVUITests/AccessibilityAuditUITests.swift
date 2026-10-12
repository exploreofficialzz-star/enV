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

    func testHomeSearchAndPrimaryActionsHaveAccessibleNames() throws {
        XCTAssertTrue(app.textFields["Search tools"].waitForExistence(timeout: 10), "The home search field should expose its Search tools label.")
        XCTAssertTrue(app.buttons["Home"].exists, "The home navigation action should be named.")
        XCTAssertTrue(app.buttons["Saved tools"].exists, "The saved-tools action should be named.")
        XCTAssertTrue(app.buttons["Tools"].exists, "The tools navigation action should be named.")
        XCTAssertTrue(app.buttons["More options"].exists, "The overflow menu should be named.")

        if #available(iOS 17.0, *) {
            try app.performAccessibilityAudit()
        }
    }

    func testMoreOptionsMenuIsAuditedInItsOpenState() throws {
        let moreOptions = app.buttons["More options"]
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
        let moreOptions = app.buttons["More options"]
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
