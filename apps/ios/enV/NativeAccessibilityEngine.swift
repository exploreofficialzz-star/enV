import Foundation

public enum NativeAccessibilityEngine {
    private static let actions = ["checker", "generator", "helper", "preview", "simulator"]
    private static let validRoles = Set("alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox complementary contentinfo definition dialog directory document feed figure form generic grid gridcell group heading img link list listbox listitem log main marquee math menu menubar menuitem menuitemcheckbox menuitemradio meter navigation none note option presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox separator slider spinbutton status strong subscript superscript switch tab tabpanel table term textbox timer toolbar tooltip tree treegrid treeitem".split(separator: " ").map(String.init))

    private struct Element {
        let tag: String
        let attributes: [String: String]
        var target: String { "<\(tag)\(attributes["id"].map { "#\($0)" } ?? "")>" }
    }
    private struct Finding {
        let severity: String
        let rule: String
        let message: String
        let target: String
        let fix: String
    }

    public static func supports(_ tool: Tool) -> Bool { tool.category == "accessibility" && tool.engine.type == "custom" }
    public static func kind(_ toolID: String) -> String { actions.first(where: { toolID.hasSuffix("-\($0)") }).map { String(toolID.dropLast($0.count + 1)) } ?? toolID }

    public static func analyze(toolID: String, input: String, foreground: String = "#000000", background: String = "#ffffff", fontSize: String = "16px", lineHeight: String = "1.5") -> String {
        let kind = kind(toolID)
        let action = actions.first(where: { toolID.hasSuffix("-\($0)") }) ?? "checker"
        if action == "generator" { return template(kind: kind, foreground: foreground, background: background) }
        if ["contrast", "accessible-color"].contains(kind) { return contrast(kind, foreground, background, suggestions: toolID.hasSuffix("-generator")) }
        if kind == "color-blindness" { return colorVisionReport(foreground, background) }
        if kind == "font-size" {
            let px = cssPixels(fontSize)
            return "FONT SIZE REVIEW\nInput: \(fontSize)\nEquivalent: \(px.map { String(format: "%.2fpx", $0) } ?? "invalid unit")\n\n\((px ?? 0) >= 16 ? "At least 16 CSS px; still test 200% zoom and reflow." : "Consider a larger body-text size and verify text resizing to 200%.")"
        }
        if kind == "line-height" {
            let size = cssPixels(fontSize)
            let raw = Double(lineHeight)
            let ratio = lineHeight.lowercased().hasSuffix("px") ? ((Double(lineHeight.dropLast(2)) ?? 0) / (size ?? 1)) : raw
            return "LINE HEIGHT REVIEW\nFont size: \(fontSize)\nLine height: \(lineHeight)\nRatio: \(ratio.map { String(format: "%.2f", $0) } ?? "invalid")\n\n\((ratio ?? 0) >= 1.5 ? "At least 1.5×; confirm users can override spacing without clipping." : "Consider line-height of 1.5× or greater and test text-spacing overrides.")"
        }
        if kind == "text-readability" { return readability(input) }
        let elements = parse(input)
        var findings: [Finding] = []
        let ids = elements.compactMap { $0.attributes["id"] }.filter { !$0.isEmpty }
        let idSet = Set(ids)
        let duplicates = Set(ids.filter { id in ids.filter { $0 == id }.count > 1 })
        func add(_ severity: String, _ rule: String, _ message: String, _ target: String, _ fix: String) { findings.append(Finding(severity: severity, rule: rule, message: message, target: target, fix: fix)) }

        switch kind {
        case "alt-text":
            for element in elements where element.tag == "img" || (element.tag == "input" && element.attributes["type"]?.lowercased() == "image") {
                guard let alt = element.attributes["alt"] else { add("SERIOUS", "image-alt", "Image has no alt attribute.", element.target, "Add concise alt text, or alt=\"\" only when decorative."); continue }
                if alt.range(of: #"(?i)\.(png|jpe?g|gif|webp|svg)$"#, options: .regularExpression) != nil { add("MODERATE", "filename-alt", "Alt appears to be a filename.", element.target, "Describe the image's meaning or function in context.") }
                else if alt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { add("MINOR", "decorative-image", "Empty alt marks this image decorative; confirm that is correct.", element.target, "Keep empty alt only for decorative images.") }
            }
        case "aria":
            for element in elements {
                if let role = element.attributes["role"]?.split(whereSeparator: { $0.isWhitespace }).first.map(String.init)?.lowercased(), !validRoles.contains(role) { add("SERIOUS", "aria-valid-role", "Unknown ARIA role '\(role)'.", element.target, "Use a valid WAI-ARIA role or native HTML semantics.") }
                if element.attributes.keys.contains("aria-label") && (element.attributes["aria-label"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { add("MODERATE", "aria-label", "aria-label is empty.", element.target, "Give the control a name or remove the empty attribute.") }
                for missing in (element.attributes["aria-labelledby"] ?? "").split(whereSeparator: { $0.isWhitespace }).map(String.init) where !idSet.contains(missing) { add("SERIOUS", "aria-labelledby", "aria-labelledby references missing id '\(missing)'.", element.target, "Reference an existing, unique id.") }
                if element.attributes["aria-hidden"]?.lowercased() == "true" && (["a", "button", "input", "select", "textarea"].contains(element.tag) || element.attributes["tabindex"] != nil) { add("SERIOUS", "aria-hidden-focus", "Focusable content is hidden from the accessibility tree.", element.target, "Remove aria-hidden or make the hidden subtree non-interactive.") }
            }
            for id in duplicates { add("SERIOUS", "duplicate-id", "The id '\(id)' is duplicated.", "#\(id)", "Make ids unique so accessible-name references resolve correctly.") }
        case "form":
            let labelIDs = Set(elements.filter { $0.tag == "label" }.compactMap { $0.attributes["for"] })
            for element in elements where ["input", "select", "textarea"].contains(element.tag) && !["hidden", "submit", "button", "reset"].contains(element.attributes["type"] ?? "") {
                let explicit = !(element.attributes["aria-label"] ?? "").isEmpty || !(element.attributes["aria-labelledby"] ?? "").isEmpty
                if !explicit && !(element.attributes["id"].map(labelIDs.contains) ?? false) { add("SERIOUS", "label", "Form control has no detectable explicit label.", element.target, "Associate a visible label using for/id, or provide aria-label/aria-labelledby.") }
                if element.attributes["aria-invalid"] == "true" && (element.attributes["aria-describedby"] ?? "").isEmpty { add("MODERATE", "error-description", "Invalid control has no error-description reference.", element.target, "Connect readable error text with aria-describedby.") }
            }
        case "keyboard-navigation":
            for element in elements {
                if let tab = Int(element.attributes["tabindex"] ?? ""), tab > 0 { add("MODERATE", "tabindex", "Positive tabindex can create a confusing focus order.", element.target, "Use natural DOM order and avoid tabindex values above zero.") }
                if ["div", "span", "li"].contains(element.tag) && element.attributes["onclick"] != nil && element.attributes["role"] == nil && element.attributes["tabindex"] == nil { add("SERIOUS", "keyboard-operable", "Click-only non-interactive element may not be keyboard operable.", element.target, "Prefer a native button/link; otherwise provide keyboard support and focusability.") }
            }
            if matches(input, pattern: #":focus(?:-visible)?"#, options: [.caseInsensitive]).isEmpty { add("MODERATE", "visible-focus", "No focus indicator rule was found.", "CSS", "Provide a clearly visible :focus-visible indicator and test in context.") }
        case "focus-state":
            let rules = matches(input, pattern: #"[^{}]*:focus(?:-visible)?[^{}]*\{[^}]*\}"#, options: [.caseInsensitive])
            if rules.isEmpty { add("SERIOUS", "focus-visible", "No :focus or :focus-visible rule was found.", "CSS", "Add a visible :focus-visible indicator with sufficient contrast and offset.") }
            for rule in rules where matches(rule, pattern: #"outline\s*:\s*(none|0)"#, options: [.caseInsensitive]).isEmpty == false && matches(rule, pattern: #"(box-shadow|border)\s*:\s*(?!none|0)"#, options: [.caseInsensitive]).isEmpty { add("SERIOUS", "focus-not-hidden", "Focus outline is removed without a replacement.", rule.components(separatedBy: "{").first ?? "CSS", "Keep the outline or add a clearly visible replacement indicator.") }
        case "motion":
            let animated = matches(input, pattern: #"animation(?:-name)?\s*:|@keyframes|transition\s*:"#, options: [.caseInsensitive]).isEmpty == false
            if animated && matches(input, pattern: #"prefers-reduced-motion\s*:\s*reduce"#, options: [.caseInsensitive]).isEmpty { add("SERIOUS", "reduced-motion", "Motion CSS has no reduced-motion path.", "CSS motion", "Respect prefers-reduced-motion and remove non-essential animation.") }
            if matches(input, pattern: #"<marquee|blink\s*\("#, options: [.caseInsensitive]).isEmpty == false { add("SERIOUS", "flashing-motion", "Blinking or marquee-style content was found.", "animated content", "Remove it or provide safe controls and ensure safe flash thresholds.") }
        default:
            add("MINOR", "scope", "Use a focused checker for markup findings.", kind, "Choose the corresponding checker and paste the relevant source snippet.")
        }

        findings.sort { severityRank($0.severity) == severityRank($1.severity) ? $0.rule < $1.rule : severityRank($0.severity) < severityRank($1.severity) }
        let details = findings.isEmpty ? "No matching issues were detected in the supplied snippet. A clean snippet is not proof of conformance." : findings.enumerated().map { "\($0.offset + 1). [\($0.element.severity)] \($0.element.rule): \($0.element.message)\n   Target: \($0.element.target)\n   Fix: \($0.element.fix)" }.joined(separator: "\n")
        return "\(kind.uppercased()) LOCAL REVIEW\nElements inspected: \(elements.count)\nFindings: \(findings.count) (critical: 0 · serious: \(findings.filter { $0.severity == "SERIOUS" }.count) · moderate: \(findings.filter { $0.severity == "MODERATE" }.count) · minor: \(findings.filter { $0.severity == "MINOR" }.count))\n\n\(details)\n\nScope: Static snippet checks only. This does not inspect a live page or accessibility tree, test assistive technology, or certify WCAG conformance. Manually verify keyboard and screen-reader behavior."
    }

    private static func parse(_ input: String) -> [Element] {
        matches(input.replacingOccurrences(of: #"<!--[\s\S]*?-->"#, with: "", options: .regularExpression), pattern: #"<([a-zA-Z][\w:-]*)\b([^<>]*)>"#).compactMap { tag in
            let parts = matches(tag, pattern: #"^<([a-zA-Z][\w:-]*)\b([^<>]*)>"#).first
            guard let parts, let range = parts.range(of: #"^<[a-zA-Z][\w:-]*"#, options: .regularExpression) else { return nil }
            let name = String(tag[range].dropFirst()).lowercased()
            var attrs = [String: String]()
            for attr in matches(tag, pattern: #"([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?"#) {
                let fields = matches(attr, pattern: #"^([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?"#).first ?? attr
                let key = fields.components(separatedBy: "=").first?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
                let value = attr.replacingOccurrences(of: #"^([^\s=/>]+)\s*=\s*"?"#, with: "", options: .regularExpression).trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
                if !key.isEmpty { attrs[key] = value }
            }
            return Element(tag: name, attributes: attrs)
        }
    }

    private static func matches(_ input: String, pattern: String, options: NSRegularExpression.Options = []) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: options) else { return [] }
        return regex.matches(in: input, range: NSRange(input.startIndex..., in: input)).compactMap { Range($0.range, in: input).map { String(input[$0]) } }
    }
    private static func severityRank(_ value: String) -> Int { ["CRITICAL": 0, "SERIOUS": 1, "MODERATE": 2, "MINOR": 3][value] ?? 4 }
    private static func cssPixels(_ value: String) -> Double? { let clean = value.trimmingCharacters(in: .whitespacesAndNewlines); if clean.hasSuffix("rem") { return Double(clean.dropLast(3)).map { $0 * 16 } }; if clean.hasSuffix("px") { return Double(clean.dropLast(2)) }; return Double(clean) }

    private static func contrast(_ kind: String, _ fg: String, _ bg: String, suggestions: Bool = false) -> String {
        guard let a = rgb(fg), let b = rgb(bg) else { return "Enter valid #RRGGBB foreground and background colors." }
        let la = luminance(a), lb = luminance(b), ratio = (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
        let alternatives = suggestions ? ["#000000", "#ffffff", "#1f2937", "#334155", "#0f766e", "#7f1d1d", "#1d4ed8"].compactMap { color -> String? in
            guard let candidate = rgb(color) else { return nil }
            let l = luminance(candidate), candidateRatio = (max(l, lb) + 0.05) / (min(l, lb) + 0.05)
            return candidateRatio >= 4.5 ? "\(color) — \(String(format: "%.2f:1", candidateRatio))" : nil
        }.prefix(5).joined(separator: "\n") : ""
        return "\(kind.uppercased()) CONTRAST REVIEW\nForeground: \(fg)\nBackground: \(bg)\nRatio: \(String(format: "%.2f:1", ratio))\nWCAG AA normal text (4.5:1): \(ratio >= 4.5 ? "PASS" : "FAIL")\nWCAG AA large text (3:1): \(ratio >= 3 ? "PASS" : "FAIL")\nWCAG AAA normal text (7:1): \(ratio >= 7 ? "PASS" : "FAIL")\(suggestions ? "\n\nForeground alternatives on this background (AA normal text):\n\(alternatives.isEmpty ? "No built-in palette candidate reached 4.5:1." : alternatives)" : "")\n\nA color pair alone cannot establish full-page WCAG conformance or check use of color."
    }
    private static func rgb(_ value: String) -> [Double]? {
        let clean = value.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard clean.range(of: #"^[0-9a-fA-F]{6}$"#, options: .regularExpression) != nil else { return nil }
        return stride(from: 0, to: 6, by: 2).compactMap { start in Int(clean.dropFirst(start).prefix(2), radix: 16).map { Double($0) } }
    }
    private static func luminance(_ rgb: [Double]) -> Double {
        let c = rgb.map { $0 / 255 }.map { $0 <= 0.04045 ? $0 / 12.92 : pow(($0 + 0.055) / 1.055, 2.4) }
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    }

    private static func colorVisionReport(_ foreground: String, _ background: String) -> String {
        let cases: [(String, [[Double]])] = [
            ("Protanopia approximation", [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]]),
            ("Deuteranopia approximation", [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]]),
            ("Tritanopia approximation", [[0.95, 0.05, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]])
        ]
        let details = cases.map { name, matrix in
            "\(name)\nForeground: \(transformColor(foreground, matrix)) · Background: \(transformColor(background, matrix))"
        }.joined(separator: "\n\n")
        return "COLOR-VISION PREVIEW (approximate)\nOriginal foreground: \(foreground) · background: \(background)\n\n\(details)\n\nThis matrix preview is illustrative only, not a clinical simulation or substitute for testing with users. Never rely on color alone to communicate meaning."
    }

    private static func transformColor(_ color: String, _ matrix: [[Double]]) -> String {
        guard let channels = rgb(color), matrix.count == 3 else { return "invalid color" }
        let transformed = matrix.map { row in min(255, max(0, Int(zip(row, channels).reduce(0.0) { $0 + $1.0 * $1.1 }.rounded()))) }
        return "#" + transformed.map { String(format: "%02X", $0) }.joined()
    }

    private static func readability(_ text: String) -> String {
        let words = matches(text, pattern: #"[A-Za-z]+(?:['-][A-Za-z]+)*"#)
        guard !words.isEmpty else { return "Paste English text to calculate readability estimates." }
        let sentences = max(1, matches(text, pattern: #"[.!?]+(?=\s|$)"#).count)
        let syllables = words.reduce(0) { total, word in
            let cleaned = word.lowercased().replacingOccurrences(of: #"[^a-z]"#, with: "", options: .regularExpression)
            let groups = matches(cleaned.replacingOccurrences(of: #"(?:[^aeiouy]+$)|^y"#, with: "", options: .regularExpression), pattern: #"[aeiouy]{1,2}"#).count
            return total + max(1, groups)
        }
        let wps = Double(words.count) / Double(sentences), spw = Double(syllables) / Double(words.count)
        let ease = 206.835 - 1.015 * wps - 84.6 * spw, grade = 0.39 * wps + 11.8 * spw - 15.59
        return "TEXT READABILITY (English estimate)\nWords: \(words.count)\nSentences: \(sentences)\nSyllables: \(syllables)\nFlesch Reading Ease: \(String(format: "%.1f", ease))\nApproximate Flesch-Kincaid grade: \(String(format: "%.1f", grade))\n\nThese formulas are language-specific and do not replace testing with readers."
    }
    private static func template(kind: String, foreground: String, background: String) -> String {
        switch kind {
        case "aria": return "ARIA STARTER\n\nPrefer native HTML semantics before ARIA. Example:\n<button type=\"button\">Save changes</button>\n\nAdd ARIA only when native semantics cannot express the required name, role, or state."
        case "alt-text": return "ALT TEXT GUIDE\n\nDescribe an informative image's purpose in context. Use alt=\"\" only when it is decorative. Do not repeat nearby text or use filenames."
        case "form": return "ACCESSIBLE FORM STARTER\n\n<label for=\"email\">Email address</label>\n<input id=\"email\" name=\"email\" autocomplete=\"email\">\n\nAssociate errors with aria-describedby; do not communicate error state by color alone."
        case "focus-state": return "VISIBLE FOCUS CSS\n:focus-visible {\n  outline: 3px solid currentColor;\n  outline-offset: 3px;\n}\n\nCheck contrast and ensure the focused control is not obscured."
        case "keyboard-navigation": return "KEYBOARD REVIEW\n\nTab / Shift+Tab: logical order\nEnter / Space: expected activation\nEscape: closes dismissible overlays\nNo keyboard trap; visible focus remains present."
        case "motion": return "REDUCED MOTION CSS\n@media (prefers-reduced-motion: reduce) {\n  *, *::before, *::after {\n    scroll-behavior: auto !important;\n    animation-duration: 0.01ms !important;\n    animation-iteration-count: 1 !important;\n    transition-duration: 0.01ms !important;\n  }\n}\n\nUse only when appropriate to the component; preserve essential feedback."
        case "color-blindness": return colorVisionReport(foreground, background)
        case "font-size": return "FONT SIZE CSS STARTER\n\nbody {\n  font-size: 1rem; /* 16 CSS px starting point */\n  line-height: 1.5;\n}\n\nVerify resizing and reflow; these are starting values, not WCAG conformance thresholds."
        case "line-height": return "LINE HEIGHT CSS STARTER\n\nbody {\n  font-size: 1rem;\n  line-height: 1.5;\n}\n\nPrefer a unitless ratio that scales with the font. Verify user text-spacing overrides."
        case "text-readability": return "READABILITY WRITING CHECKLIST\n\nUse clear headings, short sentences, concrete words, and one idea per paragraph. The English readability estimate is advisory; validate with readers."
        case "contrast", "accessible-color": return contrast(kind, foreground, background, suggestions: true)
        default: return "ACCESSIBILITY CHECKLIST\n\nUse semantic HTML, provide meaningful names, preserve keyboard operation and visible focus, support zoom and user text spacing, and test with assistive technology."
        }
    }
}
