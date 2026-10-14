import Foundation
import UIKit

/// Optional clipboard smart-suggest for Developer Studios on iOS.
/// Only reads UIPasteboard when the user triggers suggest (no background monitoring).
enum NativeDeveloperClipboardSuggest {
    /// Call from a user-initiated control (e.g. "Detect from clipboard").
    static func suggestFromPasteboard() -> DeveloperInputHint? {
        guard UIPasteboard.general.hasStrings, let text = UIPasteboard.general.string, !text.isEmpty else {
            return nil
        }
        return NativeDeveloperSmartDetect.detect(text)
    }

    static func suggest(from text: String) -> DeveloperInputHint? {
        NativeDeveloperSmartDetect.detect(text)
    }
}
