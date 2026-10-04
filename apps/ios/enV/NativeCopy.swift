import Foundation

/// Rewrites catalog copy that was written for the website so native iOS
/// screens never show in-browser language. Names, keywords, and tags stay
/// unchanged so product names like "Chrome Browser Frame" still search.
enum NativeCopy {
    static let webRuntimeOnlyToolIDs: Set<String> = [
        "connection-info",
        "media-capability-checker",
        "media-runtime-inspector",
        "mediarecorder-support-checker",
        "video-audio-track-checker",
        "video-codec-support-checker",
        "webcodecs-audio-checker",
        "webcodecs-video-checker",
    ]

    static func isWebRuntimeOnly(_ toolID: String) -> Bool {
        webRuntimeOnlyToolIDs.contains(toolID)
    }

    static func text(_ value: String) -> String {
        guard !value.isEmpty else { return value }
        var placeholders: [String] = []
        var out = value

        func protect(_ pattern: String) {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return }
            let range = NSRange(out.startIndex..<out.endIndex, in: out)
            let matches = regex.matches(in: out, options: [], range: range).reversed()
            for match in matches {
                guard let swiftRange = Range(match.range, in: out) else { continue }
                placeholders.append(String(out[swiftRange]))
                out.replaceSubrange(swiftRange, with: "\u{0}\(placeholders.count - 1)\u{0}")
            }
        }

        protect("headless browser")
        protect("(Chrome|Firefox|Safari) Browser")
        protect("into browser,\\s*OS")
        protect("Browser frames")

        let replacements: [(String, String)] = [
            ("locally in your browser", "locally on this device"),
            ("locally in the browser", "locally on this device"),
            ("entirely in your browser", "entirely on this device"),
            ("entirely in the browser", "entirely on this device"),
            ("computed in the browser", "computed on this device"),
            ("Data stays in the browser", "Data stays on this device"),
            ("without leaving the browser", "without leaving the app"),
            ("all in the browser", "all on this device"),
            ("in your browser", "on this device"),
            ("in the current browser", "on this device"),
            ("in the browser", "on this device"),
            ("in-browser", "on-device"),
            ("browser-supported", "supported"),
            ("browser interpolation", "interpolation"),
            ("your browser provides native", "this device provides native"),
            ("the browser supports it", "this device supports it"),
            ("where the browser supports it", "where this device supports it"),
            ("using browser media capture", "using on-device media capture"),
            ("browser media APIs", "on-device media APIs"),
            ("Inspect browser, native", "Inspect native"),
            ("whether the browser exposes", "whether this device exposes"),
            ("Inspect browser support for common browser-recordable", "Inspect support for common recordable"),
            ("the browser processing pipeline", "the on-device processing pipeline"),
            ("browser processing", "on-device processing"),
            ("browser-readable", "readable"),
            ("browser-native WebM", "WebM"),
            ("browser-exposed", "on-device"),
            ("where the browser allows it", "where this device allows it"),
            ("Client-side PDF utilities", "On-device PDF utilities"),
        ]
        for (from, to) in replacements {
            guard let regex = try? NSRegularExpression(pattern: NSRegularExpression.escapedPattern(for: from), options: [.caseInsensitive]) else { continue }
            let range = NSRange(out.startIndex..<out.endIndex, in: out)
            for match in regex.matches(in: out, options: [], range: range).reversed() {
                guard let swiftRange = Range(match.range, in: out) else { continue }
                let original = String(out[swiftRange])
                let letters = original.filter(\.isLetter)
                let replacement: String
                if !letters.isEmpty && letters.allSatisfy(\.isUppercase) {
                    replacement = to.uppercased()
                } else if original.first?.isUppercase == true {
                    replacement = to.prefix(1).uppercased() + String(to.dropFirst())
                } else {
                    replacement = to
                }
                out.replaceSubrange(swiftRange, with: replacement)
            }
        }
        for (index, original) in placeholders.enumerated() {
            out = out.replacingOccurrences(of: "\u{0}\(index)\u{0}", with: original)
        }
        return out
    }
}
