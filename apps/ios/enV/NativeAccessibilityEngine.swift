import Foundation

public enum NativeAccessibilityEngine {
    public struct ColorVisionPreview: Equatable {
        public let label: String
        public let foreground: String
        public let background: String
    }
    private static let actions = ["checker", "generator", "helper", "preview", "simulator"]
    private static let validRoles = Set("alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox complementary contentinfo definition dialog directory document feed figure form generic grid gridcell group heading img link list listbox listitem log main marquee math menu menubar menuitem menuitemcheckbox menuitemradio meter navigation none note option presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox separator slider spinbutton status strong subscript superscript switch tab tablist tabpanel table term textbox timer toolbar tooltip tree treegrid treeitem".split(separator: " ").map(String.init))

    private struct Element {
        let tag: String
        let attributes: [String: String]
        let source: String
        let innerMarkup: String
        let textContent: String
        var target: String { "<\(tag)\(attributes["id"].map { "#\($0)" } ?? "")>" }
    }
    private struct Finding {
        let severity: String
        let rule: String
        let message: String
        let target: String
        let fix: String
        var id: String = ""
        var line: Int? = nil
        var evidence: String = ""
        var relatedCriteria: [String] = []
        var review: String = "manual-review"
    }

    static func supports(_ tool: Tool) -> Bool { tool.category == "accessibility" && tool.engine.type == "custom" }
    public static func kind(_ toolID: String) -> String { actions.first(where: { toolID.hasSuffix("-\($0)") }).map { String(toolID.dropLast($0.count + 1)) } ?? toolID }

    public static func analyze(toolID: String, input: String, foreground: String = "#000000", background: String = "#ffffff", fontSize: String = "16px", lineHeight: String = "1.5", focusWidth: String = "3px", focusOffset: String = "3px") -> String {
        let kind = kind(toolID)
        let action = actions.first(where: { toolID.hasSuffix("-\($0)") }) ?? "checker"
        if action == "generator" { return template(kind: kind, foreground: foreground, background: background, focusWidth: focusWidth, focusOffset: focusOffset, pattern: input) }
        if action == "helper" && kind == "alt-text" { return altTextCoach(input) }
        if action == "helper" && ["contrast", "accessible-color"].contains(kind) { return "\(helperGuide(kind))\n\n\(contrast(kind, foreground, background, suggestions: true))" }
        if action == "helper" && kind == "text-readability" && !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "READABILITY COACH · Heuristic draft for review\n\nOriginal:\n\(input)\n\nSimpler wording draft:\n\(plainLanguageDraft(input))\n\nReview each substitution for meaning and tone with intended readers.\n\n\(readability(input))" }
        if action == "helper" { return "\(helperGuide(kind))\n\n\(analyze(toolID: String(toolID.dropLast("-helper".count)) + "-checker", input: input, foreground: foreground, background: background, fontSize: fontSize, lineHeight: lineHeight))" }
        if action == "preview" { return preview(kind: kind, input: input, foreground: foreground, background: background, fontSize: fontSize, lineHeight: lineHeight) }
        if action == "simulator" { return simulator(kind: kind, input: input, foreground: foreground, background: background, fontSize: fontSize, lineHeight: lineHeight) }
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
            // Document-level source checks only run when an HTML root/document is supplied.
            if let htmlRoot = elements.first(where: { $0.tag == "html" }), (htmlRoot.attributes["lang"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                add("SERIOUS", "document-language", "The HTML root has no detectable language declaration.", "<html>", "Set a valid BCP 47 language tag such as lang=\"en\" and verify the actual page language.")
            }
            if !matches(input, pattern: #"<html\b|<head\b"#, options: [.caseInsensitive]).isEmpty {
                let title = elements.first(where: { $0.tag == "title" })
                if title == nil || (title?.textContent ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    add("MODERATE", "document-title", "A non-empty document title was not detected in this document-like snippet.", "<head>", "Provide a concise, descriptive <title>; usefulness still needs human review.")
                }
            }
            var previousHeadingLevel = 0
            for heading in elements where matches(heading.tag, pattern: #"^h[1-6]$"#).isEmpty == false {
                let level = Int(heading.tag.dropFirst()) ?? 0
                if previousHeadingLevel > 0 && level > previousHeadingLevel + 1 {
                    add("MODERATE", "heading-order", "Heading level jumps from h\(previousHeadingLevel) to h\(level); verify the heading hierarchy.", heading.target, "Use heading levels that reflect the content structure. A skipped level is a review lead, not automatically a WCAG failure.")
                }
                previousHeadingLevel = level
            }
            for element in elements {
                let role = element.attributes["role"]?.split(whereSeparator: { $0.isWhitespace }).first.map(String.init)?.lowercased()
                if let role, !validRoles.contains(role) { add("SERIOUS", "aria-valid-role", "Unknown ARIA role '\(role)'.", element.target, "Use a valid WAI-ARIA role or native HTML semantics.") }
                if element.attributes.keys.contains("aria-label") && (element.attributes["aria-label"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { add("MODERATE", "aria-label", "aria-label is empty.", element.target, "Give the control a name or remove the empty attribute.") }
                if element.attributes["aria-label"] != nil && ["div", "span", "p", "li"].contains(element.tag) && (role == nil || ["generic", "none", "presentation"].contains(role!)) && (element.attributes["aria-labelledby"] ?? "").isEmpty { add("SERIOUS", "aria-prohibited-attr", "aria-label is used on a generic container without a role that supports an accessible name.", element.target, "Prefer a native semantic element or an accurate role that supports naming; do not add a role just to silence the checker.") }
                for missing in (element.attributes["aria-labelledby"] ?? "").split(whereSeparator: { $0.isWhitespace }).map(String.init) where !idSet.contains(missing) { add("SERIOUS", "aria-labelledby", "aria-labelledby references missing id '\(missing)'.", element.target, "Reference an existing, unique id.") }
                for attribute in ["aria-describedby", "aria-controls", "aria-owns", "aria-details", "aria-errormessage", "aria-flowto"] {
                    for missing in (element.attributes[attribute] ?? "").split(whereSeparator: { $0.isWhitespace }).map(String.init) where !idSet.contains(missing) { add("MODERATE", "aria-reference", "\(attribute) references missing id '\(missing)'. Dynamic content may create this target later, so verify the rendered state.", element.target, "Ensure \(attribute) points to an existing element in each relevant state, or remove the stale reference.") }
                }
                if element.attributes["aria-hidden"]?.lowercased() == "true" && (["a", "button", "input", "select", "textarea"].contains(element.tag) || element.attributes["tabindex"] != nil) { add("SERIOUS", "aria-hidden-focus", "Focusable content is hidden from the accessibility tree.", element.target, "Remove aria-hidden or make the hidden subtree non-interactive.") }
                let validTokens: [String: Set<String>] = [
                    "aria-checked": ["true", "false", "mixed"], "aria-pressed": ["true", "false", "mixed"],
                    "aria-selected": ["true", "false"], "aria-expanded": ["true", "false"], "aria-hidden": ["true", "false"],
                    "aria-disabled": ["true", "false"], "aria-required": ["true", "false"], "aria-readonly": ["true", "false"], "aria-busy": ["true", "false"],
                    "aria-invalid": ["true", "false", "grammar", "spelling"]
                ]
                for (attribute, allowed) in validTokens {
                    if let value = element.attributes[attribute]?.lowercased(), !allowed.contains(value) { add("MODERATE", "aria-value-\(attribute.replacingOccurrences(of: "aria-", with: ""))", "\(attribute) has invalid value '\(value)'.", element.target, "Use one of \(allowed.sorted().joined(separator: ", ")) and only use the attribute when supported by the element's role.") }
                }
                if let live = element.attributes["aria-live"]?.lowercased(), !["off", "polite", "assertive"].contains(live) { add("MODERATE", "aria-value-live", "aria-live has invalid value '\(live)'.", element.target, "Use off, polite, or assertive and avoid unnecessarily interrupting assistive technology.") }
                let controlRoles: Set<String> = ["button", "link", "checkbox", "radio", "switch", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option"]
                let inputType = element.attributes["type"]?.lowercased() ?? ""
                if element.tag == "button" || (element.tag == "input" && ["button", "submit", "reset"].contains(inputType)) {
                    if !hasAccessibleName(element, elements: elements) { add("SERIOUS", "button-name", "Button has no detectable accessible name in the supplied markup.", element.target, "Give the button meaningful visible text, a valid aria-label/aria-labelledby, or a meaningful value for input buttons.") }
                } else if element.tag == "a" && element.attributes["href"] != nil {
                    if !hasAccessibleName(element, elements: elements) { add("SERIOUS", "link-name", "Link has no detectable accessible name in the supplied markup.", element.target, "Provide meaningful link text or an accessible name that communicates the link purpose in context.") }
                } else if let role, controlRoles.contains(role), !["a", "button", "input", "select", "textarea", "summary"].contains(element.tag), !hasAccessibleName(element, elements: elements) {
                    add("SERIOUS", "custom-control-name", "Custom role=\(role) has no detectable accessible name.", element.target, "Prefer a native interactive element or give the custom control a meaningful accessible name and validate its computed name in a browser.")
                }
            }
            for id in duplicates { add("SERIOUS", "duplicate-id", "The id '\(id)' is duplicated.", "#\(id)", "Make ids unique so accessible-name references resolve correctly.") }
        case "form":
            let labelIDs = Set(elements.filter { $0.tag == "label" }.compactMap { $0.attributes["for"] })
            let formControls = elements.filter {
                ["input", "select", "textarea"].contains($0.tag) &&
                !["hidden", "submit", "button", "reset", "image"].contains($0.attributes["type"] ?? "")
            }
            for element in formControls {
                let explicit = !(element.attributes["aria-label"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    || !(element.attributes["aria-labelledby"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                let associated = element.attributes["id"].map(labelIDs.contains) ?? false
                let hasPlaceholder = !(element.attributes["placeholder"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                let titleOnly = !(element.attributes["title"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !explicit && !associated
                if !explicit && !associated {
                    add("SERIOUS", "label", "Form control has no detectable programmatic label.", element.target, "Add a visible <label for=\"…\"> that matches this control's id, wrap the control in a <label>, or provide aria-label/aria-labelledby.")
                    if hasPlaceholder {
                        add("MODERATE", "placeholder-label", "Placeholder text is present but is not a programmatic label and often disappears while typing.", element.target, "Keep a persistent visible label; do not rely on placeholder alone for the accessible name.")
                    }
                    if titleOnly {
                        add("MODERATE", "title-label", "Only a title attribute is present; title is not a reliable visible label for form controls.", element.target, "Provide a visible <label> (or aria-label/aria-labelledby) in addition to any title tooltip.")
                    }
                }
                if element.attributes["aria-invalid"] == "true" {
                    let describedBy = (element.attributes["aria-describedby"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                    if describedBy.isEmpty {
                        add("MODERATE", "error-description", "Invalid form control has no detectable description reference for its error.", element.target, "Associate concise error text with aria-describedby on this control and expose the error state.")
                    } else if describedBy.split(whereSeparator: { $0.isWhitespace }).map(String.init).contains(where: { !idSet.contains($0) }) {
                        add("MODERATE", "error-description-reference", "Invalid form control references an error description missing from this snippet.", element.target, "Ensure the error element exists in the rendered state and explains how to correct the issue.")
                    }
                }
            }
            for label in elements where label.tag == "label" {
                let forId = (label.attributes["for"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                if !forId.isEmpty {
                    if !idSet.contains(forId) {
                        add("MODERATE", "label-reference", "Label references a missing form-control id '\(forId)'.", label.target, "Match the label's for value to a unique control id, or wrap the control inside the label.")
                    }
                } else if matches(label.innerMarkup, pattern: #"<(input|select|textarea)\b"#, options: [.caseInsensitive]).isEmpty
                            && !label.textContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    add("MODERATE", "label-unassociated", "Label text is present but is not associated with a control via for/id or wrapping.", label.target, "Add for=\"control-id\" matching a unique control id, or place the control inside the label.")
                }
            }
            let radios = formControls.filter { ($0.attributes["type"] ?? "").lowercased() == "radio" }
            let radioNames = Set(radios.compactMap { $0.attributes["name"] }.filter { !$0.isEmpty })
            for name in radioNames {
                let group = radios.filter { $0.attributes["name"] == name }
                if group.count >= 2 {
                    let hasFieldset = !matches(input, pattern: #"<fieldset\b"#, options: [.caseInsensitive]).isEmpty
                        && !matches(input, pattern: #"<legend\b"#, options: [.caseInsensitive]).isEmpty
                    if !hasFieldset {
                        add("MODERATE", "radio-group", "Radio group name=\"\(name)\" has \(group.count) options but no fieldset/legend grouping was detected.", group[0].target, "Wrap related radios in <fieldset> with a <legend> that names the group.")
                    }
                }
            }
            let checkboxes = formControls.filter { ($0.attributes["type"] ?? "").lowercased() == "checkbox" }
            if checkboxes.count >= 2 {
                let hasFieldset = !matches(input, pattern: #"<fieldset\b"#, options: [.caseInsensitive]).isEmpty
                    && !matches(input, pattern: #"<legend\b"#, options: [.caseInsensitive]).isEmpty
                if !hasFieldset {
                    add("MINOR", "checkbox-group", "Multiple checkboxes detected without fieldset/legend grouping.", checkboxes[0].target, "When checkboxes form a related set, wrap them in <fieldset> with a descriptive <legend>.")
                }
            }
            for element in elements where element.tag == "button"
                || (element.tag == "input" && ["submit", "button", "image"].contains(element.attributes["type"] ?? "")) {
                if !hasAccessibleName(element, elements: elements) {
                    add("SERIOUS", "button-name", "Button has no detectable accessible name.", element.target, "Give the button meaningful text or an aria-label that describes its action. Icon-only buttons need an accessible name.")
                }
            }
        case "keyboard-navigation":
            for element in elements {
                if let tab = Int(element.attributes["tabindex"] ?? ""), tab > 0 { add("MODERATE", "tabindex", "Positive tabindex can create a confusing focus order.", element.target, "Use natural DOM order and avoid tabindex values above zero.") }
                let role = element.attributes["role"]?.lowercased()
                let hasClick = element.attributes["onclick"] != nil || !matches(element.source, pattern: #"onClick\s*="#, options: [.caseInsensitive]).isEmpty
                let hasKeyboard = !matches(element.source, pattern: #"on(?:key(?:down|up|press))\s*="#, options: [.caseInsensitive]).isEmpty
                if ["div", "span", "li"].contains(element.tag) && hasClick && role != "button" && role != "link" && !hasKeyboard { add("SERIOUS", "keyboard-operable", element.attributes["tabindex"] != nil ? "Focusable custom content has a click handler but no detectable keyboard activation handler." : "Click handler on a non-interactive element may not be focusable or keyboard operable.", element.target, "Prefer a native button/link. If custom behavior is essential, expose the correct role, provide sequential focus, and implement expected Enter/Space activation.") }
                if (role == "button" || role == "link") && !["a", "button", "input", "select", "textarea", "summary"].contains(element.tag) && element.attributes["tabindex"] == nil { add("SERIOUS", "custom-control-focus", "Custom role=\(role ?? "unknown") is not in the sequential keyboard order.", element.target, "Use a native button/link, or add tabindex=0 and implement expected keyboard behavior.") }
                if ["button", "link", "checkbox", "radio", "switch", "tab"].contains(role ?? "") && !["a", "button", "input", "select", "textarea", "summary"].contains(element.tag) && hasClick && !hasKeyboard { add("SERIOUS", role == "button" ? "custom-button-keyboard-activation" : "custom-control-keyboard-activation", "Custom role=\(role ?? "unknown") has a click handler but no detectable keyboard handler in its opening tag.", element.target, "Prefer a native semantic control. Otherwise, implement the role's expected keyboard interaction and test with keyboard and assistive technology.") }

                let nativeInteractive = ["a", "button", "input", "select", "textarea", "summary"].contains(element.tag) && (element.tag != "a" || element.attributes["href"] != nil)
                let customInteractive = ["button", "link", "checkbox", "radio", "switch", "tab", "slider", "combobox"].contains(role ?? "")
                if nativeInteractive || customInteractive {
                    let classes = Set((element.attributes["class"] ?? "").split(whereSeparator: { $0.isWhitespace }).map(String.init))
                    var declarations = element.attributes["style"] ?? ""
                    for rule in matches(input, pattern: #"([^{}]+)\{([^{}]*)\}"#) {
                        let parts = rule.components(separatedBy: "{")
                        guard parts.count >= 2 else { continue }
                        let selectors = parts[0].split(separator: ",").map { String($0).trimmingCharacters(in: .whitespacesAndNewlines).components(separatedBy: .whitespacesAndNewlines).last ?? "" }
                        let matchesElement = selectors.contains { raw in
                            let selector = raw.components(separatedBy: ":").first ?? raw
                            let tag = matches(selector, pattern: #"^[a-z][\w-]*"#, options: [.caseInsensitive]).first
                            let id = matches(selector, pattern: #"#([\w-]+)"#).first?.dropFirst()
                            let ruleClasses = matches(selector, pattern: #"\.([\w-]+)"#).map { String($0.dropFirst()) }
                            return (tag == nil || tag?.lowercased() == element.tag) && (id == nil || String(id!) == element.attributes["id"]) && ruleClasses.allSatisfy(classes.contains) && !selector.contains("[") && !selector.contains("*")
                        }
                        if matchesElement { declarations += ";" + parts.dropFirst().joined(separator: "{").components(separatedBy: "}").first! }
                    }
                    func dimension(_ names: [String]) -> Double? {
                        for name in names {
                            if let numberText = capture(declarations, pattern: #"(?:^|[;{\s])"# + NSRegularExpression.escapedPattern(for: name) + #"\s*:\s*(\d+(?:\.\d+)?)px\b"#, group: 1, options: [.caseInsensitive]),
                               let number = Double(numberText) { return number }
                        }
                        return nil
                    }
                    let width = dimension(["width", "inline-size"])
                    let height = dimension(["height", "block-size"])
                    let minWidth = dimension(["min-width", "min-inline-size"])
                    let minHeight = dimension(["min-height", "min-block-size"])
                    if (width != nil && width! < 24 && (minWidth == nil || minWidth! < 24)) || (height != nil && height! < 24 && (minHeight == nil || minHeight! < 24)) {
                        add("MODERATE", "target-size-risk", "Explicit target dimensions (\(width.map { String($0) } ?? "auto") × \(height.map { String($0) } ?? "auto") CSS px) may fall below 24 × 24 CSS px. Spacing or other WCAG exceptions may apply.", element.target, "Check rendered size and spacing. Meet 24 × 24 CSS px or document an applicable WCAG 2.2 SC 2.5.8 exception; test touch and pointer use.")
                    }
                }
            }
            if matches(input, pattern: #":focus(?:-visible)?"#, options: [.caseInsensitive]).isEmpty { add("MODERATE", "visible-focus", "No focus indicator rule was found.", "CSS", "Provide a clearly visible :focus-visible indicator and test in context.") }
        case "focus-state":
            let rules = matches(input, pattern: #"[^{}]*:focus(?:-visible)?[^{}]*\{[^}]*\}"#, options: [.caseInsensitive])
            if rules.isEmpty { add("SERIOUS", "focus-visible", "No :focus or :focus-visible rule was found.", "CSS", "Add a visible :focus-visible indicator with sufficient contrast and offset.") }
            for rule in rules where matches(rule, pattern: #"outline\s*:\s*(none|0)"#, options: [.caseInsensitive]).isEmpty == false && matches(rule, pattern: #"(box-shadow|border)\s*:\s*(?!none|0)"#, options: [.caseInsensitive]).isEmpty { add("SERIOUS", "focus-not-hidden", "Focus outline is removed without a replacement.", rule.components(separatedBy: "{").first ?? "CSS", "Keep the outline or add a clearly visible replacement indicator.") }
        case "motion":
            findings.append(contentsOf: inspectMotion(input))
            if !matches(input, pattern: #"<marquee\b|blink\s*\("#, options: [.caseInsensitive]).isEmpty { add("SERIOUS", "flashing-motion", "Legacy marquee/blink content was detected; its visual and timing behavior needs manual review.", "animated content", "Remove legacy marquee/blink behavior, or provide user controls and verify the actual flash rate/area.") }
        default:
            add("MINOR", "scope", "Use a focused checker for markup findings.", kind, "Choose the corresponding checker and paste the relevant source snippet.")
        }

        findings.sort { severityRank($0.severity) == severityRank($1.severity) ? $0.rule < $1.rule : severityRank($0.severity) < severityRank($1.severity) }
        var identityCounts: [String: Int] = [:]
        let enriched = findings.map { original -> Finding in
            var finding = original
            let targetSlug = finding.target.lowercased().replacingOccurrences(of: #"[^a-z0-9._#@-]+"#, with: "-", options: .regularExpression).trimmingCharacters(in: CharacterSet(charactersIn: "-")).prefix(64)
            let identity = "\(kind)/\(finding.rule)/\(targetSlug.isEmpty ? "snippet" : String(targetSlug))"
            let occurrence = (identityCounts[identity] ?? 0) + 1
            identityCounts[identity] = occurrence
            let location = sourceLocation(input, target: finding.target, rule: finding.rule)
            finding.id = "env-a11y:\(identity)\(occurrence > 1 ? ":\(occurrence)" : "")"
            finding.line = location.line
            finding.evidence = location.evidence
            finding.relatedCriteria = relatedCriteria(finding.rule)
            finding.review = ["image-alt", "aria-valid-role", "duplicate-id", "label-reference", "aria-value-expanded", "aria-value-live", "aria-value-invalid"].contains(finding.rule) ? "verify-in-context" : "manual-review"
            return finding
        }
        let details = enriched.isEmpty ? "No matching issues were detected in the supplied snippet. A clean snippet is not proof of conformance." : enriched.enumerated().map {
            "\($0.offset + 1). [\($0.element.severity)] \($0.element.rule): \($0.element.message)\n   Finding ID: \($0.element.id)\n   Target: \($0.element.target) · Source line: \($0.element.line.map(String.init) ?? "unresolved")\n   Evidence: \($0.element.evidence)\n   Related WCAG criteria (review hints, not a failure verdict): \($0.element.relatedCriteria.isEmpty ? "No specific mapping assigned" : $0.element.relatedCriteria.joined(separator: ", "))\n   Review: \($0.element.review)\n   Fix: \($0.element.fix)"
        }.joined(separator: "\n")
        return "\(kind.uppercased()) LOCAL REVIEW\nElements inspected: \(elements.count)\nFindings: \(enriched.count) (critical: 0 · serious: \(enriched.filter { $0.severity == "SERIOUS" }.count) · moderate: \(enriched.filter { $0.severity == "MODERATE" }.count) · minor: \(enriched.filter { $0.severity == "MINOR" }.count))\n\n\(details)\n\nScope: Static snippet checks only. This does not inspect a live page or accessibility tree, test assistive technology, or certify WCAG conformance. Related criteria are review guidance, not proof of failure. Manually verify keyboard and screen-reader behavior."
    }

    private static func relatedCriteria(_ rule: String) -> [String] {
        if ["image-alt", "decorative-image", "filename-alt"].contains(rule) { return ["1.1.1 Non-text Content"] }
        if rule == "svg-name" { return ["1.1.1 Non-text Content", "4.1.2 Name, Role, Value"] }
        if rule.hasPrefix("aria-") || ["duplicate-id", "button-name", "custom-control-name"].contains(rule) { return ["4.1.2 Name, Role, Value"] }
        if rule == "link-name" { return ["2.4.4 Link Purpose (In Context)", "4.1.2 Name, Role, Value"] }
        if ["label", "label-reference"].contains(rule) { return ["3.3.2 Labels or Instructions", "4.1.2 Name, Role, Value"] }
        if rule.hasPrefix("error-description") { return ["3.3.1 Error Identification", "3.3.3 Error Suggestion"] }
        if rule.contains("keyboard") || rule == "custom-control-focus" { return ["2.1.1 Keyboard", "4.1.2 Name, Role, Value"] }
        if rule == "tabindex" { return ["2.4.3 Focus Order"] }
        if rule == "target-size-risk" { return ["2.5.8 Target Size (Minimum)"] }
        if rule == "document-language" { return ["3.1.1 Language of Page"] }
        if rule == "document-title" { return ["2.4.2 Page Titled"] }
        if rule == "heading-order" { return ["1.3.1 Info and Relationships"] }
        if rule.contains("focus") { return ["2.4.7 Focus Visible"] }
        if ["reduced-motion", "reduced-motion-incomplete", "script-driven-motion", "script-motion-not-preference-aware"].contains(rule) { return ["2.3.3 Animation from Interactions", "2.2.2 Pause, Stop, Hide"] }
        if rule == "smooth-scroll-not-reduced" { return ["2.3.3 Animation from Interactions"] }
        if ["rapid-contrast-flash", "flashing-motion"].contains(rule) { return ["2.3.1 Three Flashes or Below Threshold"] }
        if ["auto-moving-content", "loop-without-pause"].contains(rule) { return ["2.2.2 Pause, Stop, Hide"] }
        return []
    }

    private static func sourceLocation(_ source: String, target: String, rule: String) -> (line: Int?, evidence: String) {
        let lines = source.components(separatedBy: .newlines)
        var index: Int? = nil
        if let range = target.range(of: #"^<[^>]+#([^>]+)>$"#, options: .regularExpression) {
            let fragment = String(target[range])
            if let id = fragment.split(separator: "#").last?.dropLast(), !id.isEmpty {
                let escaped = NSRegularExpression.escapedPattern(for: String(id))
                index = lines.firstIndex { !matches($0, pattern: #"\bid\s*=\s*['\"]"# + escaped + #"['\"]"#, options: [.caseInsensitive]).isEmpty }
            }
        }
        if index == nil, target.hasPrefix("@keyframes") { index = lines.firstIndex { $0.localizedCaseInsensitiveContains(target) } }
        if index == nil, target.count < 100, !target.hasPrefix("<"), target != "CSS" { index = lines.firstIndex { $0.contains(target) } }
        if index == nil, let tag = capture(target, pattern: #"^<([a-z][\w:-]*)"#, group: 1, options: [.caseInsensitive]) { index = lines.firstIndex { !matches($0, pattern: #"<"# + NSRegularExpression.escapedPattern(for: tag) + #"(?:\s|>|/)"#, options: [.caseInsensitive]).isEmpty } }
        if index == nil {
            let pattern: String
            switch rule {
            case "rapid-contrast-flash": pattern = #"@(?:-webkit-)?keyframes|background(?:-color)?\s*:"#
            case "auto-moving-content": pattern = #"@(?:-webkit-)?keyframes|translateX\s*\("#
            case "loop-without-pause": pattern = #"animation(?:-iteration-count)?\s*:[^;]*infinite"#
            case "smooth-scroll-not-reduced": pattern = #"scroll-behavior\s*:\s*smooth"#
            case "script-driven-motion", "script-motion-not-preference-aware": pattern = #"addEventListener|requestAnimationFrame|setInterval|\.style\.(?:transform|translate|rotate|scale)\s*=|\.animate\s*\("#
            case "reduced-motion": pattern = #"animation\s*:|transition\s*:|@(?:-webkit-)?keyframes"#
            case "reduced-motion-incomplete": pattern = #"@media[^\n]*prefers-reduced-motion"#
            case "transition-all": pattern = #"transition\s*:\s*all"#
            default: pattern = ""
            }
            if !pattern.isEmpty { index = lines.firstIndex { !matches($0, pattern: pattern, options: [.caseInsensitive]).isEmpty } }
        }
        guard let index else { return (nil, "Source location could not be resolved; inspect the target manually.") }
        let evidence = lines[index..<min(lines.count, index + 3)].joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        return (index + 1, String(evidence.prefix(500)))
    }

    private static func cssBlock(_ source: String, pattern: String) -> (name: String, body: String)? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let match = regex.firstMatch(in: source, range: NSRange(source.startIndex..., in: source)),
              let matchRange = Range(match.range, in: source),
              let open = source[matchRange.upperBound...].firstIndex(of: "{") else { return nil }
        let name: String
        if match.numberOfRanges > 1, let group = Range(match.range(at: 1), in: source) { name = String(source[group]) }
        else { name = String(source[matchRange]) }
        var depth = 0
        var quote: Character?
        var escaped = false
        var index = open
        while index < source.endIndex {
            let ch = source[index]
            if escaped { escaped = false; index = source.index(after: index); continue }
            if ch == "\\" { escaped = true; index = source.index(after: index); continue }
            if let currentQuote = quote { if ch == currentQuote { quote = nil }; index = source.index(after: index); continue }
            if ch == "'" || ch == "\"" { quote = ch; index = source.index(after: index); continue }
            if ch == "{" { depth += 1 }
            if ch == "}" {
                depth -= 1
                if depth == 0 {
                    let bodyStart = source.index(after: open)
                    return (name, String(source[bodyStart..<index]))
                }
            }
            index = source.index(after: index)
        }
        return nil
    }

    /// Deterministic native motion checks. Findings are heuristic review leads, not certification.
    private static func inspectMotion(_ input: String) -> [Finding] {
        var findings: [Finding] = []
        func add(_ severity: String, _ rule: String, _ message: String, _ target: String, _ fix: String) {
            findings.append(Finding(severity: severity, rule: rule, message: message, target: target, fix: fix))
        }
        let css = input.replacingOccurrences(of: #"/\*[\s\S]*?\*/"#, with: "", options: .regularExpression)
        let animated = !matches(css, pattern: #"animation(?:-name)?\s*:|@(?:-webkit-)?keyframes|transition(?:-property)?\s*:"#, options: [.caseInsensitive]).isEmpty
        let reducedBlock = cssBlock(css, pattern: #"@media\s*\([^)]*prefers-reduced-motion\s*:\s*reduce[^)]*\)"#)?.body ?? ""
        let hasReducedBlock = !reducedBlock.isEmpty || !matches(css, pattern: #"@media\s*\([^)]*prefers-reduced-motion\s*:\s*reduce"#, options: [.caseInsensitive]).isEmpty
        let jsMotion = !matches(input, pattern: #"(?:addEventListener\s*\(\s*['\"](?:scroll|wheel|pointermove|mousemove|touchmove)['\"]|requestAnimationFrame\s*\(|setInterval\s*\()[\s\S]{0,500}(?:transform|translate|rotate|scale|animation|style\.)"#, options: [.caseInsensitive]).isEmpty ||
            !matches(input, pattern: #"\.style\.(?:transform|translate|rotate|scale)\s*=|\.animate\s*\("#, options: [.caseInsensitive]).isEmpty

        if animated && !hasReducedBlock {
            add("SERIOUS", "reduced-motion", "Motion CSS is present but no prefers-reduced-motion: reduce block was found.", "CSS animation/transition", "Provide a reduced-motion alternative that removes non-essential movement, disables smooth scrolling, and preserves essential information.")
        } else if animated && hasReducedBlock {
            let animationOverride = !matches(reducedBlock, pattern: #"animation\s*:\s*none\b|animation-name\s*:\s*none\b|animation-duration\s*:\s*(?:0(?:\.0+)?(?:ms|s)|0?\.0*1ms|1ms)\b|animation-iteration-count\s*:\s*1\b"#, options: [.caseInsensitive]).isEmpty
            let transitionOverride = !matches(reducedBlock, pattern: #"transition\s*:\s*none\b|transition-property\s*:\s*none\b|transition-duration\s*:\s*(?:0(?:\.0+)?(?:ms|s)|0?\.0*1ms|1ms)\b"#, options: [.caseInsensitive]).isEmpty
            let hasAnimation = !matches(css, pattern: #"animation(?:-name)?\s*:|@(?:-webkit-)?keyframes"#, options: [.caseInsensitive]).isEmpty
            let hasTransition = !matches(css, pattern: #"transition(?:-property)?\s*:"#, options: [.caseInsensitive]).isEmpty
            if (hasAnimation && !animationOverride) || (hasTransition && !transitionOverride) { add("MODERATE", "reduced-motion-incomplete", "A reduced-motion media query exists, but it does not visibly override every animation/transition type used by this snippet.", "@media (prefers-reduced-motion: reduce)", "Inspect the media block and disable or materially reduce the motion types actually used.") }
        }
        if !matches(css, pattern: #"scroll-behavior\s*:\s*smooth\b"#, options: [.caseInsensitive]).isEmpty && matches(reducedBlock, pattern: #"scroll-behavior\s*:\s*auto\b"#, options: [.caseInsensitive]).isEmpty {
            add("MODERATE", "smooth-scroll-not-reduced", "Smooth scrolling is enabled but the reduced-motion block does not switch it to auto.", "CSS scroll behavior", "Set scroll-behavior: auto in the reduced-motion block and also verify script-driven scrolling.")
        }
        if !matches(css, pattern: #"transition\s*:\s*all\b"#, options: [.caseInsensitive]).isEmpty { add("MINOR", "transition-all", "A broad transition: all declaration may animate properties that were not intended to move.", "CSS transition declaration", "List only properties that need transitions and respect reduced-motion preferences.") }

        // Walk source offsets so each named keyframe is analyzed independently.
        var namedKeyframes: [(name: String, body: String)] = []
        let keyframeRegex = try? NSRegularExpression(pattern: #"@(?:-webkit-)?keyframes\s+([\w-]+)"#, options: [.caseInsensitive])
        if let keyframeRegex {
            let ranges = keyframeRegex.matches(in: css, range: NSRange(css.startIndex..., in: css))
            for range in ranges {
                guard let swiftRange = Range(range.range, in: css) else { continue }
                let tail = String(css[swiftRange.lowerBound...])
                if let block = cssBlock(tail, pattern: #"^@(?:-webkit-)?keyframes\s+([\w-]+)"#) { namedKeyframes.append((block.name, block.body)) }
            }
        }
        for frame in namedKeyframes {
            let name = frame.name
            let escapedName = NSRegularExpression.escapedPattern(for: name)
            let namePattern = #"\b"# + escapedName + #"\b"#
            let ruleMatches = matches(css, pattern: #"([^{}]+)\{([^{}]*)\}"#)
            var matchingRule: String? = nil
            for rule in ruleMatches {
                let declarations = capture(rule, pattern: #"([^{}]+)\{([^{}]*)\}"#, group: 2) ?? ""
                var values: [String] = []
                if let animationValue = capture(declarations, pattern: #"animation\s*:\s*([^;]+)"#, group: 1, options: [.caseInsensitive]) { values.append(animationValue) }
                if let nameValue = capture(declarations, pattern: #"animation-name\s*:\s*([^;]+)"#, group: 1, options: [.caseInsensitive]) { values.append(nameValue) }
                var referencesThisAnimation = false
                for value in values {
                    for part in value.components(separatedBy: ",") {
                        if !matches(part, pattern: namePattern, options: [.caseInsensitive]).isEmpty {
                            referencesThisAnimation = true
                            break
                        }
                    }
                    if referencesThisAnimation { break }
                }
                if referencesThisAnimation {
                    matchingRule = rule
                    break
                }
            }
            let animationDecl: String
            if let matchingRule {
                animationDecl = capture(matchingRule, pattern: #"([^{}]+)\{([^{}]*)\}"#, group: 2) ?? ""
            } else {
                animationDecl = ""
            }
            let shorthand = capture(animationDecl, pattern: #"animation\s*:\s*([^;]+)"#, group: 1, options: [.caseInsensitive]) ?? ""
            var animationItem: String? = nil
            for part in shorthand.components(separatedBy: ",") {
                if !matches(part, pattern: namePattern, options: [.caseInsensitive]).isEmpty {
                    animationItem = part
                    break
                }
            }
            let durationSource = animationItem ?? animationDecl
            let durationPattern = #"(?:^|\s)(\d*\.?\d+)(ms|s)\b"#
            let durationText: String?
            let durationUnit: String?
            if let localDuration = capture(durationSource, pattern: durationPattern, group: 1, options: [.caseInsensitive]), let localUnit = capture(durationSource, pattern: durationPattern, group: 2, options: [.caseInsensitive]) {
                durationText = localDuration
                durationUnit = localUnit
            } else {
                durationText = capture(animationDecl, pattern: #"animation-duration\s*:\s*(\d*\.?\d+)(ms|s)\b"#, group: 1, options: [.caseInsensitive])
                durationUnit = capture(animationDecl, pattern: #"animation-duration\s*:\s*(\d*\.?\d+)(ms|s)\b"#, group: 2, options: [.caseInsensitive])
            }
            let milliseconds: Double?
            if let durationText, let durationValue = Double(durationText) {
                milliseconds = durationValue * ((durationUnit ?? "ms").lowercased() == "s" ? 1000 : 1)
            } else {
                milliseconds = nil
            }
            let repeatsInShorthand = !matches(animationItem ?? "", pattern: #"\binfinite\b"#, options: [.caseInsensitive]).isEmpty
            let repeatsByCount = !matches(animationDecl, pattern: #"animation-iteration-count\s*:\s*(?:infinite|[2-9]|[1-9]\d+)\b"#, options: [.caseInsensitive]).isEmpty
            let repeats = repeatsInShorthand || repeatsByCount
            let backgroundCount = matches(frame.body, pattern: #"background(?:-color)?\s*:"#, options: [.caseInsensitive]).count
            let highContrast = !matches(frame.body, pattern: #"\b(red|black|white|yellow|lime|fuchsia)\b"#, options: [.caseInsensitive]).isEmpty || !matches(frame.body, pattern: #"#(?:f00|000|fff|ff0|0f0|f0f|ff0000|000000|ffffff|ffff00|00ff00|ff00ff)\b"#, options: [.caseInsensitive]).isEmpty
            if backgroundCount >= 2 && highContrast && repeats, let milliseconds, milliseconds <= 500 { add("SERIOUS", "rapid-contrast-flash", "Keyframes '\(name)' rapidly alternate high-contrast background colors (\(Int(milliseconds))ms per cycle). This is a risk signal, not a measured WCAG flash test.", "@keyframes \(name)", "Remove the flashing effect or measure it against WCAG flash thresholds; reduced duration alone does not prove safety.") }
            if !matches(frame.body, pattern: #"translateX\s*\("#, options: [.caseInsensitive]).isEmpty && repeats { add("MODERATE", "auto-moving-content", "Keyframes '\(name)' move content horizontally in a repeating animation.", "@keyframes \(name)", "Provide a user-operable pause/stop mechanism and disable non-essential movement for reduced-motion users.") }
        }
        if !matches(css, pattern: #"(?:animation\s*:[^;{}]*\binfinite\b|animation-iteration-count\s*:\s*infinite\b)"#, options: [.caseInsensitive]).isEmpty && matches(css, pattern: #"animation-play-state\s*:\s*paused"#, options: [.caseInsensitive]).isEmpty && matches(input, pattern: #"classList\.(add|remove|toggle)\s*\([^)]*(pause|paused|motion-off|animation-off)"#, options: [.caseInsensitive]).isEmpty {
            add("MODERATE", "loop-without-pause", "One or more animations loop indefinitely, and no clear animation pause/resume mechanism was detected.", "CSS infinite animation", "Add a user-operable pause/stop control that actually stops each affected animation.")
        }
        if jsMotion {
            add("MODERATE", "script-driven-motion", "JavaScript appears to change transform/animation state; CSS media-query overrides do not automatically stop this code path.", "JavaScript motion handler", "Guard non-essential script-driven movement with matchMedia('(prefers-reduced-motion: reduce)') and listen for preference changes.")
            if matches(input, pattern: #"matchMedia\s*\([^)]*prefers-reduced-motion"#, options: [.caseInsensitive]).isEmpty { add("MODERATE", "script-motion-not-preference-aware", "No JavaScript check for prefers-reduced-motion was detected alongside script-driven movement.", "JavaScript motion handler", "Check matchMedia('(prefers-reduced-motion: reduce)') before starting script-driven motion and respond when the preference changes.") }
        }
        for rule in matches(css, pattern: #"([^{}]+)\{([^{}]*)\}"#) {
            guard let animation = capture(rule, pattern: #"animation\s*:\s*([^;]+)"#, group: 1, options: [.caseInsensitive]) else { continue }
            let writers = namedKeyframes.filter { frame in !matches(animation, pattern: #"\b"# + NSRegularExpression.escapedPattern(for: frame.name) + #"\b"#, options: [.caseInsensitive]).isEmpty && !matches(frame.body, pattern: #"transform\s*:"#, options: [.caseInsensitive]).isEmpty }.map(\.name)
            if writers.count > 1 { add("MODERATE", "competing-transform-animations", "Concurrent keyframes (\(writers.joined(separator: ", "))) both write to transform and may override each other.", String(rule.components(separatedBy: "{").first ?? "CSS").trimmingCharacters(in: .whitespacesAndNewlines), "Combine transform operations into one keyframe animation or use separate nested elements.") }
        }
        return findings
    }

    private static func helperGuide(_ kind: String) -> String {
        switch kind {
        case "alt-text": return "WRITING COACH · Describe the image's purpose in context. Keep essential meaning, omit decorative detail, and use alt=\"\" only for decorative images."
        case "aria": return "ARIA MISTAKE FIXER · Prefer native HTML. Give controls a name, keep referenced IDs unique, expose accurate state, and avoid redundant roles."
        case "form": return "FORM FIXER · Pair each field with a visible label, associate errors with their field, explain corrections, and preserve keyboard focus."
        case "keyboard-navigation": return "KEYBOARD FIXER · Use native controls, natural order, visible focus, and avoid positive tabindex and keyboard traps."
        case "focus-state": return "FOCUS FIXER · Keep a high-contrast, unclipped keyboard focus indicator; check sticky content and forced-colors modes."
        case "motion": return "MOTION FIXER · Respect reduced-motion preference, remove non-essential movement, and preserve essential feedback."
        case "contrast", "accessible-color": return "GUIDED COLOR FIXER · Change one color at a time, retain intended hue where possible, then recheck the actual text/UI context."
        case "font-size", "line-height": return "TYPE FIXER · Prefer scalable units; verify 200% text resize, 400% zoom/reflow, and text-spacing overrides without clipping."
        case "text-readability": return "READABILITY COACH · Split long sentences, explain specialist terms, use descriptive headings, and test with intended readers."
        default: return "ACCESSIBILITY FIXER · Apply one change at a time and verify with keyboard and assistive technology."
        }
    }

    private static func preview(kind: String, input: String, foreground: String, background: String, fontSize: String, lineHeight: String) -> String {
        switch kind {
        case "alt-text":
            let announcements = matches(input, pattern: #"<img\b[^>]*>"#, options: [.caseInsensitive]).map { tag -> String in
                if let alt = capture(tag, pattern: #"\balt\s*=\s*['\"]([^'\"]*)['\"]"#, group: 1, options: [.caseInsensitive]) { return alt.isEmpty ? "Decorative image (not announced)" : "Image: \(alt)" }
                return "Image (missing alternative)"
            }.joined(separator: "\n")
            return "SCREEN-READER ANNOUNCEMENT PREVIEW\n\(announcements.isEmpty ? "Paste image markup to preview announcements." : announcements)\n\nIllustrative text only; actual announcements vary by screen reader and context."
        case "aria": return "ACCESSIBILITY TREE PREVIEW\n\(analyze(toolID: "aria-checker", input: input))\n\nInspect the platform accessibility tree and test with a screen reader; static markup cannot resolve every computed name or state."
        case "contrast", "accessible-color": return contrast(kind, foreground, background)
        case "color-blindness": return colorVisionReport(foreground, background)
        case "font-size": return "TEXT PREVIEW · 200% RESIZE\nInput size: \(fontSize)\nCompare wrapping, clipping, and overlap at 200% and 400% zoom."
        case "line-height": return "TEXT SPACING PREVIEW\nFont size: \(fontSize) · line-height: \(lineHeight)\nAlso test WCAG text-spacing overrides: 1.5× line height, 2× paragraph spacing, 0.12× letter spacing, and 0.16× word spacing."
        case "text-readability": return "BEFORE / REVIEW\n\(readability(input))\n\nEstimates only; this preview does not automatically rewrite the text."
        default: return "INTERACTIVE PREVIEW\n\(analyze(toolID: "\(kind)-checker", input: input, foreground: foreground, background: background, fontSize: fontSize, lineHeight: lineHeight))"
        }
    }

    private static func simulator(kind: String, input: String, foreground: String, background: String, fontSize: String, lineHeight: String) -> String {
        switch kind {
        case "alt-text": return bulkAltText(input)
        case "color-blindness": return colorVisionReport(foreground, background)
        case "contrast", "accessible-color": return contrast(kind, foreground, background, suggestions: true)
        case "keyboard-navigation", "focus-state", "aria", "form": return "KEYBOARD + ASSISTIVE-TECHNOLOGY WALKTHROUGH\n1. Tab forward and Shift+Tab backward through controls.\n2. Confirm visible focus and logical order.\n3. Activate with Enter/Space; dismiss with Escape where appropriate.\n4. Check names, roles, values, and errors with a screen reader.\n\n\(analyze(toolID: "\(kind)-checker", input: input, foreground: foreground, background: background, fontSize: fontSize, lineHeight: lineHeight))"
        case "font-size", "line-height": return "ZOOM SIMULATION CHECKLIST\nAt 200% text resize and 400% viewport zoom, inspect clipping, overlap, horizontal scrolling, and control reachability.\n\n\(preview(kind: kind, input: input, foreground: foreground, background: background, fontSize: fontSize, lineHeight: lineHeight))"
        case "motion": return "REDUCED-MOTION SIMULATION\nEnable the operating-system reduced-motion setting. Confirm non-essential transitions stop while essential feedback and meaning remain.\n\n\(analyze(toolID: "motion-checker", input: input))"
        default: return "SIMULATION GUIDE\nA static preview cannot reproduce an individual user's assistive technology. Test with real devices and users.\n\n\(analyze(toolID: "\(kind)-checker", input: input, foreground: foreground, background: background, fontSize: fontSize, lineHeight: lineHeight))"
        }
    }

    private static func altTextCoach(_ input: String) -> String {
        let description = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !description.isEmpty else { return "ALT-TEXT WRITING COACH\nDescribe the image and its purpose in the surrounding content. Drafts stay on this device.\n\nUse the shortest accurate wording; use alt=\"\" only when decorative." }
        let phrase = description.trimmingCharacters(in: CharacterSet(charactersIn: ".!? \n\t"))
        let options = ["\(phrase).", "\(phrase); it helps the reader understand the page content.", "\(phrase). The image adds relevant context for this section."]
        let labels = ["Short", "Medium", "Detailed"]
        let drafts = zip(labels, options).map { "\($0.0) (\($0.1.count) characters)\n\($0.1)" }.joined(separator: "\n\n")
        return "ALT-TEXT WRITING COACH · Drafts, not automatic truth\n\n\(drafts)\n\nChoose the shortest version that conveys the image's purpose. Verify it against the actual image and nearby content."
    }

    private static func bulkAltText(_ input: String) -> String {
        let images = parse(input).filter { $0.tag == "img" || ($0.tag == "input" && $0.attributes["type"]?.lowercased() == "image") }
        guard !images.isEmpty else { return "BULK ALT-TEXT TRIAGE\nPaste multiple <img> tags to scan. This static check cannot inspect image pixels or judge meaning." }
        let rows = images.enumerated().map { index, element -> String in
            guard let alt = element.attributes["alt"] else { return "\(index + 1). SERIOUS · Missing alt\n   \(element.target)\n   Fix: add concise contextual alt, or alt=\"\" if decorative." }
            if alt.range(of: #"(?i)\.(png|jpe?g|gif|webp|svg)$"#, options: .regularExpression) != nil { return "\(index + 1). MODERATE · Filename used as alt\n   \(element.target)\n   Fix: describe purpose, not the file name." }
            return "\(index + 1). \(alt.isEmpty ? "REVIEW · Empty alt (decorative)" : "REVIEW · Alt present")\n   \(element.target)"
        }.joined(separator: "\n\n")
        return "BULK ALT-TEXT TRIAGE · Local scan\nImages found: \(images.count)\n\n\(rows)\n\nReview every proposed fix in context; valid alternative text depends on the image and nearby content."
    }

    private static func parse(_ input: String) -> [Element] {
        let clean = input.replacingOccurrences(of: #"<!--[\s\S]*?-->"#, with: "", options: .regularExpression)
        let voidTags: Set<String> = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]
        let tagMatches = matches(clean, pattern: #"<[a-zA-Z][\w:-]*\b[^<>]*>"#)
        var cursor = clean.startIndex
        var output: [Element] = []
        for tag in tagMatches {
            guard let opening = clean.range(of: tag, range: cursor..<clean.endIndex) else { continue }
            cursor = opening.upperBound
            guard let name = capture(tag, pattern: #"^<([a-zA-Z][\w:-]*)\b"#, group: 1)?.lowercased() else { continue }
            var attrs = [String: String]()
            for attr in matches(tag, pattern: #"([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?"#) {
                guard let key = capture(attr, pattern: #"^([^\s=/>]+)"#, group: 1)?.lowercased() else { continue }
                let value = capture(attr, pattern: #"^[^\s=/>]+\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#, group: 1)
                    ?? capture(attr, pattern: #"^[^\s=/>]+\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#, group: 2)
                    ?? capture(attr, pattern: #"^[^\s=/>]+\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#, group: 3)
                    ?? ""
                attrs[key] = value
            }
            let inner: String
            if voidTags.contains(name) || tag.hasSuffix("/>") {
                inner = ""
            } else if let close = clean.range(of: #"</\s*\#(NSRegularExpression.escapedPattern(for: name))\s*>"#, options: .regularExpression.union(.caseInsensitive), range: cursor..<clean.endIndex) {
                inner = String(clean[cursor..<close.lowerBound])
            } else {
                inner = ""
            }
            let text = inner.replacingOccurrences(of: #"<[^>]*>"#, with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
            output.append(Element(tag: name, attributes: attrs, source: tag, innerMarkup: inner, textContent: text))
        }
        return output
    }

    private static func hasAccessibleName(_ element: Element, elements: [Element]) -> Bool {
        let attributes = element.attributes
        if !(attributes["aria-label"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return true }
        let byID = Dictionary(elements.compactMap { candidate -> (String, Element)? in
            guard let id = candidate.attributes["id"] else { return nil }
            return (id, candidate)
        }, uniquingKeysWith: { first, _ in first })
        let labelledBy = (attributes["aria-labelledby"] ?? "").split(whereSeparator: { $0.isWhitespace }).map(String.init)
        if !labelledBy.isEmpty && labelledBy.allSatisfy({ byID[$0] != nil }) {
            let referencedText = labelledBy.compactMap { byID[$0] }.map { candidate in
                let a = candidate.attributes
                return (candidate.textContent.isEmpty ? (a["aria-label"] ?? a["title"] ?? a["alt"] ?? a["value"] ?? "") : candidate.textContent).trimmingCharacters(in: .whitespacesAndNewlines)
            }.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
            if !referencedText.isEmpty { return true }
        }
        if !(attributes["title"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !(attributes["alt"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return true }
        let type = attributes["type"]?.lowercased() ?? ""
        if element.tag == "input" && ["button", "submit", "reset"].contains(type) && !(attributes["value"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return true }
        if ["button", "a"].contains(element.tag) && !element.textContent.isEmpty { return true }
        if matches(element.innerMarkup, pattern: #"<img\b[^>]*\balt\s*=\s*(['\"])[^'\"]+['\"]"#, options: [.caseInsensitive]).isEmpty == false { return true }
        if matches(element.innerMarkup, pattern: #"<svg\b[\s\S]*?<title\b[^>]*>[^<]+</title>"#, options: [.caseInsensitive]).isEmpty == false { return true }
        return attributes["role"] != nil && !element.textContent.isEmpty
    }

    private static func matches(_ input: String, pattern: String, options: NSRegularExpression.Options = []) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: options) else { return [] }
        return regex.matches(in: input, range: NSRange(input.startIndex..., in: input)).compactMap { Range($0.range, in: input).map { String(input[$0]) } }
    }
    private static func capture(_ input: String, pattern: String, group: Int, options: NSRegularExpression.Options = []) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: options),
              let match = regex.firstMatch(in: input, range: NSRange(input.startIndex..., in: input)),
              group < match.numberOfRanges,
              let range = Range(match.range(at: group), in: input) else { return nil }
        return String(input[range])
    }
    private static func severityRank(_ value: String) -> Int { ["CRITICAL": 0, "SERIOUS": 1, "MODERATE": 2, "MINOR": 3][value] ?? 4 }
    private static func cssPixels(_ value: String) -> Double? { let clean = value.trimmingCharacters(in: .whitespacesAndNewlines); if clean.hasSuffix("rem") { return Double(clean.dropLast(3)).map { $0 * 16 } }; if clean.hasSuffix("px") { return Double(clean.dropLast(2)) }; return Double(clean) }

    private static func contrast(_ kind: String, _ fg: String, _ bg: String, suggestions: Bool = false) -> String {
        guard let a = rgb(fg), let b = rgb(bg) else { return "Enter valid #RRGGBB foreground and background colors." }
        let la = luminance(a), lb = luminance(b), ratio = (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
        let aaNormal = ratio >= 4.5, aaLarge = ratio >= 3.0, aaaNormal = ratio >= 7.0, uiAA = ratio >= 3.0
        let alternatives = suggestions ? ["#000000", "#ffffff", "#1f2937", "#334155", "#0f766e", "#7f1d1d", "#1d4ed8", "#111827", "#f8fafc"].compactMap { color -> String? in
            guard let candidate = rgb(color) else { return nil }
            let l = luminance(candidate), candidateRatio = (max(l, lb) + 0.05) / (min(l, lb) + 0.05)
            return candidateRatio >= 4.5 ? "\(color) — \(String(format: "%.2f:1", candidateRatio)) · AA normal" : nil
        }.prefix(6).joined(separator: "\n") : ""
        var report = """
        \(kind.uppercased()) CONTRAST REVIEW · on-device
        Foreground: \(fg)
        Background: \(bg)
        WCAG 2.2 ratio: \(String(format: "%.2f:1", ratio))

        Normal text AA (4.5:1): \(aaNormal ? "PASS" : "FAIL")
        Large text AA (3:1): \(aaLarge ? "PASS" : "FAIL")
        Normal text AAA (7:1): \(aaaNormal ? "PASS" : "FAIL")
        UI / graphics AA (3:1): \(uiAA ? "PASS" : "FAIL")
        """
        if suggestions {
            report += "\n\nSuggested foreground alternatives on this background (AA normal):\n"
            report += alternatives.isEmpty ? "No built-in palette candidate reached 4.5:1. Adjust hue or lightness and recheck." : alternatives
            report += "\n\nApply one alternative at a time, then recheck in the real product surface."
        }
        if !aaNormal {
            report += "\n\nONE-CLICK PATH: switch to Coach / fix mode or try a suggested alternative above. Recheck large text and UI components separately."
        }
        report += "\n\nScope: a two-color pair cannot prove full-page WCAG conformance or WCAG 1.4.1 Use of Color. Processing stays on this device."
        return report
    }

    public static func passingForegroundColors(background: String, minimumRatio: Double = 4.5) -> [String] {
        guard let base = rgb(background) else { return [] }
        let baseLuminance = luminance(base)
        return ["#000000", "#ffffff", "#1f2937", "#334155", "#0f766e", "#7f1d1d", "#1d4ed8"].filter { color in
            guard let candidate = rgb(color) else { return false }
            return (max(luminance(candidate), baseLuminance) + 0.05) / (min(luminance(candidate), baseLuminance) + 0.05) >= minimumRatio
        }.prefix(5).map { $0 }
    }

    private static func rgb(_ value: String) -> [Double]? {
        let clean = value.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard clean.range(of: #"^[0-9a-fA-F]{6}$"#, options: .regularExpression) != nil else { return nil }
        return stride(from: 0, to: 6, by: 2).compactMap { start in Int(clean.dropFirst(start).prefix(2), radix: 16).map { Double($0) } }
    }
    private static func luminance(_ rgb: [Double]) -> Double {
        let red = linearChannel(rgb[0])
        let green = linearChannel(rgb[1])
        let blue = linearChannel(rgb[2])
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue
    }

    private static func linearChannel(_ value: Double) -> Double {
        let channel = value / 255.0
        if channel <= 0.04045 { return channel / 12.92 }
        return pow((channel + 0.055) / 1.055, 2.4)
    }

    public static func colorVisionPreviewPairs(_ foreground: String, _ background: String) -> [ColorVisionPreview] {
        let cases: [(String, [[Double]])] = [
            ("Protanopia approximation", [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]]),
            ("Deuteranopia approximation", [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]]),
            ("Tritanopia approximation", [[0.95, 0.05, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]]),
            ("Achromatopsia · grayscale approximation", [[0.2126, 0.7152, 0.0722], [0.2126, 0.7152, 0.0722], [0.2126, 0.7152, 0.0722]])
        ]
        return cases.map { name, matrix in ColorVisionPreview(label: name, foreground: transformColor(foreground, matrix), background: transformColor(background, matrix)) }
    }

    private static func colorVisionReport(_ foreground: String, _ background: String) -> String {
        let details = colorVisionPreviewPairs(foreground, background).map { "\($0.label)\nForeground: \($0.foreground) · Background: \($0.background)" }.joined(separator: "\n\n")
        return "COLOR-VISION PREVIEW (approximate)\nOriginal foreground: \(foreground) · background: \(background)\n\n\(details)\n\nThis matrix preview is illustrative only, not a clinical simulation or substitute for testing with users. Never rely on color alone to communicate meaning."
    }

    private static func transformColor(_ color: String, _ matrix: [[Double]]) -> String {
        guard let channels = rgb(color), matrix.count == 3 else { return "invalid color" }
        let transformed = matrix.map { row in min(255, max(0, Int(zip(row, channels).reduce(0.0) { $0 + $1.0 * $1.1 }.rounded()))) }
        return "#" + transformed.map { String(format: "%02X", $0) }.joined()
    }

    private static func plainLanguageDraft(_ text: String) -> String {
        let changes = [("at this point in time", "now"), ("in order to", "to"), ("in the event that", "if"), ("is able to", "can"), ("make a decision", "decide"), ("approximately", "about"), ("utilize", "use"), ("assistance", "help"), ("commence", "start"), ("demonstrate", "show"), ("purchase", "buy"), ("prior to", "before"), ("subsequently", "then"), ("determine", "decide"), ("requirement", "need"), ("sufficient", "enough"), ("numerous", "many"), ("obtain", "get"), ("regarding", "about"), ("additional", "more")]
        var result = text
        for (wordy, simple) in changes { result = result.replacingOccurrences(of: #"\b\#(NSRegularExpression.escapedPattern(for: wordy))\b"#, with: simple, options: [.regularExpression, .caseInsensitive]) }
        return result
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
    private static func template(kind: String, foreground: String, background: String, focusWidth: String, focusOffset: String, pattern: String) -> String {
        switch kind {
        case "aria":
            let snippet: String
            switch pattern.lowercased() {
            case "dialog": snippet = "<button type=\"button\" aria-haspopup=\"dialog\" aria-controls=\"settings\">Settings</button>\n<dialog id=\"settings\" aria-labelledby=\"settings-title\">\n  <h2 id=\"settings-title\">Settings</h2>\n  <button type=\"button\">Close</button>\n</dialog>"
            case "disclosure": snippet = "<button type=\"button\" aria-expanded=\"false\" aria-controls=\"details\">More details</button>\n<div id=\"details\" hidden>Additional details</div>"
            case "tabs": snippet = "<div role=\"tablist\" aria-label=\"Account sections\">\n  <button role=\"tab\" id=\"profile-tab\" aria-selected=\"true\" aria-controls=\"profile-panel\" tabindex=\"0\">Profile</button>\n</div>\n<section role=\"tabpanel\" id=\"profile-panel\" aria-labelledby=\"profile-tab\">Profile settings</section>"
            case "checkbox": snippet = "<label><input type=\"checkbox\" name=\"updates\"> Email me updates</label>"
            case "link": snippet = "<a href=\"/account/settings\">Account settings</a>"
            default: snippet = "<button type=\"button\">Save changes</button>"
            }
            return "ARIA PATTERN STARTER · \(pattern.isEmpty ? "button" : pattern)\n\n\(snippet)\n\nPrefer native semantics. Custom widgets also need full keyboard behavior and accurate state updates; test the completed component."
        case "alt-text": return "ALT TEXT GUIDE\n\nDescribe an informative image's purpose in context. Use alt=\"\" only when it is decorative. Do not repeat nearby text or use filenames."
        case "form": return "ACCESSIBLE FORM STARTER\n\n<label for=\"email\">Email address</label>\n<input id=\"email\" name=\"email\" autocomplete=\"email\">\n\nAssociate errors with aria-describedby; do not communicate error state by color alone."
        case "focus-state":
            let width = matches(focusWidth, pattern: #"^[2-8](?:\.\d+)?px$"#).first ?? "3px"
            let offset = matches(focusOffset, pattern: #"^(?:[1-9]|10)(?:\.\d+)?px$"#).first ?? "3px"
            let ring = matches(foreground, pattern: #"^#[0-9a-fA-F]{6}$"#).first ?? "currentColor"
            let darkRing = matches(background, pattern: #"^#[0-9a-fA-F]{6}$"#).first ?? "#ffd54f"
            return """
            FOCUS-VISIBLE CSS · production-ready (on-device)
            /* Prefer :focus-visible so mouse users are not forced to see the ring */
            :focus-visible {
              outline: \(width) solid \(ring);
              outline-offset: \(offset);
            }
            :focus:not(:focus-visible) {
              outline: none;
            }
            @media (prefers-color-scheme: dark) {
              :focus-visible { outline-color: \(darkRing); }
            }
            @media (forced-colors: active) {
              :focus-visible {
                outline: 3px solid Highlight;
                outline-offset: 3px;
              }
            }
            .button-large:focus-visible,
            [data-size="lg"]:focus-visible {
              outline-width: \(width);
            }

            Verification checklist
            1. Tab through every interactive control
            2. Confirm the ring is not clipped by overflow:hidden
            3. Check ring contrast against adjacent surfaces
            4. Test forced-colors / Windows High Contrast
            5. Confirm mouse click does not leave a persistent ring
            """
        case "keyboard-navigation": return "KEYBOARD REVIEW\n\nTab / Shift+Tab: logical order\nEnter / Space: expected activation\nEscape: closes dismissible overlays\nNo keyboard trap; visible focus remains present."
        case "motion": return "REDUCED MOTION CSS\n@media (prefers-reduced-motion: reduce) {\n  *, *::before, *::after {\n    scroll-behavior: auto !important;\n    animation-duration: 0.01ms !important;\n    animation-iteration-count: 1 !important;\n    transition-duration: 0.01ms !important;\n  }\n}\n\nUse only when appropriate to the component; preserve essential feedback."
        case "color-blindness": return colorVisionReport(foreground, background)
        case "font-size": return "FLUID TYPE SCALE CSS STARTER\n\n:root {\n  --type-body: clamp(1rem, 0.95rem + 0.25vw, 1.125rem);\n  --type-lead: clamp(1.125rem, 1rem + 0.6vw, 1.375rem);\n  --type-heading: clamp(1.75rem, 1.35rem + 1.8vw, 2.5rem);\n}\n\nTest 200% text resizing, 400% zoom, and narrow screens. These are starting values, not conformance thresholds."
        case "line-height": return "LINE-HEIGHT SCALE CSS STARTER\n\n:root {\n  --leading-tight: 1.2;\n  --leading-heading: 1.3;\n  --leading-body: 1.5;\n  --leading-relaxed: 1.75;\n}\nbody { line-height: var(--leading-body); }\n\nVerify user text-spacing overrides and ensure content is not clipped."
        case "text-readability": return pattern.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "READABILITY STARTER\nPaste English text to create a reviewable plain-language draft. The local substitutions are limited and do not certify a reading level.\n\nUse clear headings, short sentences, concrete words, and one idea per paragraph." : "PLAIN-LANGUAGE DRAFT · Heuristic, not an automatic rewrite\n\nOriginal:\n\(pattern)\n\nSuggested wording:\n\(plainLanguageDraft(pattern))\n\nReview carefully: substitutions can change nuance or technical meaning. Test with intended readers."
        case "contrast", "accessible-color": return contrast(kind, foreground, background, suggestions: true)
        default: return "ACCESSIBILITY CHECKLIST\n\nUse semantic HTML, provide meaningful names, preserve keyboard operation and visible focus, support zoom and user text spacing, and test with assistive technology."
        }
    }
}
