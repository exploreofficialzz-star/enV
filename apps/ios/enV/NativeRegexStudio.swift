import Foundation
import CoreFoundation

/// Native iOS Regex Studio. Uses Foundation's ICU-backed NSRegularExpression, not JavaScript RegExp.
/// ICU work is synchronous: no in-process hard cancellation is promised for one in-progress match.
/// Bounds and conservative risk screening reduce exposure but are not a general ReDoS proof.
enum NativeRegexStudio {
    private static let maxPattern = 2_048
    private static let maxSamples = 100
    private static let maxSampleLength = 32_768
    private static let maxTotalBytes = 1_000_000
    private static let maxMatches = 250
    private static let maxPipelineInput = 100_000
    private static let maxPipelineOutput = 250_000
    private static let maxBenchmarkSample = 4_096
    private static let benchmarkBudgetMs = 750.0
    private static let riskPattern = try! NSRegularExpression(pattern: #"(?:\([^)]*[+*][^)]*\)[+*{]|(?:\.\*|\.\+).*(?:\.\*|\.\+)|\([^)]*\|[^)]*\)[+*{]|\\[1-9][+*{])"#)

    private struct Sample {
        let label: String
        let text: String
        let expectMatch: Bool?
        let expectMatches: Int?
    }

    private static func fail(_ message: String) -> NSError {
        NSError(domain: "enV.NativeRegexStudio", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }

    static func run(pattern: String, rawSamples: String, flags rawFlags: String, replacement: String, mode rawMode: String) throws -> String {
        guard pattern.count <= maxPattern else { throw fail("Regex pattern exceeds \(maxPattern) characters on iOS; shorten it before execution.") }
        let mode = rawMode.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().isEmpty ? "test" : rawMode.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard ["test", "benchmark", "pipeline", "format", "flavors"].contains(mode) else { throw fail("Unknown Regex Studio mode '\(mode)'.") }
        if mode == "format" { return try formatPattern(pattern) }
        if mode == "flavors" { return try analyzeFlavors(pattern) }
        let flags = try normalizeFlags(rawFlags)
        if mode == "pipeline" { return try runPipeline(defaultPattern: pattern, raw: rawSamples, flags: flags, replacement: replacement) }

        let parsed = try parseSamples(rawSamples)
        guard !parsed.rows.isEmpty else { throw fail("Enter at least one test sample.") }
        let totalBytes = parsed.rows.reduce(0) { $0 + $1.text.lengthOfBytes(using: .utf8) }
        guard totalBytes <= maxTotalBytes else { throw fail("Regex sample inputs exceed the local 1 MB processing limit.") }
        for (index, sample) in parsed.rows.enumerated() where sample.text.count > maxSampleLength {
            throw fail("Sample \(index + 1) exceeds \(maxSampleLength) characters on iOS.")
        }
        let expression = try compile(pattern, flags: flags)
        let namedCaptures = namedCaptureGroups(pattern)
        if mode == "benchmark" { return try benchmark(expression, source: pattern, samples: parsed.rows, config: parsed.config) }

        var reports = [[String: Any]]()
        var totalMatches = 0
        var assertionsPassed = 0
        var assertionFailures = [String]()
        for sample in parsed.rows {
            if isRisky(pattern) && sample.text.count > 24 {
                reports.append(["label": sample.label, "matched": NSNull(), "matchCount": NSNull(), "executionSkipped": true,
                               "performanceRisk": "Pattern resembles catastrophic backtracking; native execution was skipped for this sample longer than 24 characters.",
                               "samplePreview": preview(sample.text)])
                continue
            }
            let began = CFAbsoluteTimeGetCurrent()
            let sourceRange = NSRange(sample.text.startIndex..<sample.text.endIndex, in: sample.text)
            var matches = [[String: Any]]()
            var count = 0
            expression.enumerateMatches(in: sample.text, range: sourceRange) { match, _, stop in
                guard let match else { return }
                count += 1
                if matches.count < maxMatches {
                    var groups = [Any]()
                    if match.numberOfRanges > 1 {
                        for group in 1..<match.numberOfRanges {
                            let range = match.range(at: group)
                            groups.append(range.location == NSNotFound ? NSNull() : (self.capture(sample.text, range).map { self.preview($0) } as Any? ?? NSNull()))
                        }
                    }
                    var named = [String: Any]()
                    var captures = [[String: Any]]()
                    for (groupIndex, name) in namedCaptures where groupIndex < match.numberOfRanges {
                        let range = match.range(at: groupIndex)
                        let value: Any = range.location == NSNotFound ? NSNull() : (self.capture(sample.text, range).map { self.preview($0) } as Any? ?? NSNull())
                        named[name] = value
                        captures.append(["name": name, "group": groupIndex, "value": value])
                    }
                    matches.append(["match": self.preview(self.capture(sample.text, match.range(at: 0)) ?? "", max: 500),
                                    "start": match.range.location, "end": NSMaxRange(match.range), "groups": groups,
                                    "namedGroups": named, "captures": captures])
                }
                if count > maxMatches { stop.pointee = true }
            }
            totalMatches += count
            let matched = count > 0
            var row: [String: Any] = ["label": sample.label, "matched": matched, "matchCount": count,
                                      "matches": matches, "truncated": count > maxMatches,
                                      "samplePreview": preview(sample.text),
                                      "elapsedMs": max(0, (CFAbsoluteTimeGetCurrent() - began) * 1000), "executionSkipped": false]
            if sample.expectMatch != nil || sample.expectMatches != nil {
                let passed = (sample.expectMatch == nil || sample.expectMatch == matched) && (sample.expectMatches == nil || sample.expectMatches == count)
                row["assertionPassed"] = passed
                if passed { assertionsPassed += 1 } else { assertionFailures.append(sample.label) }
            }
            if !replacement.isEmpty {
                guard sample.text.count <= maxBenchmarkSample else { throw fail("Replacement previews are limited to \(maxBenchmarkSample) characters per sample.") }
                row["replacementPreview"] = preview(expression.stringByReplacingMatches(in: sample.text, range: sourceRange, withTemplate: replacement), max: 1_000)
            }
            reports.append(row)
        }
        return try jsonString(["mode": "test", "engine": "iOS Foundation NSRegularExpression (ICU)", "sampleCount": parsed.rows.count,
                               "matchCount": totalMatches, "assertionCount": assertionsPassed + assertionFailures.count,
                               "assertionsPassed": assertionsPassed, "assertionFailures": assertionFailures, "results": reports,
                               "performanceRisk": isRisky(pattern) ? "Static high-backtracking-risk heuristic matched. This is not a full ReDoS detector." : "No covered high-risk shape detected; this does not prove the expression safe.",
                               "executionBudget": "No hard killable timeout: NSRegularExpression matching is synchronous and cannot be reliably interrupted. Risk heuristics and strict input bounds are applied.",
                               "privacy": "No input history is persisted by this engine. Results show bounded previews rather than complete source samples."])
    }

    private static func parseSamples(_ raw: String) throws -> (rows: [Sample], config: [String: Any]?) {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.hasPrefix("[") && !trimmed.hasPrefix("{") {
            guard !raw.isEmpty else { throw fail("Enter a sample string, or a JSON array of strings/sample objects.") }
            return ([Sample(label: "Sample 1", text: raw, expectMatch: nil, expectMatches: nil)], nil)
        }
        let decoded: Any
        do { decoded = try JSONSerialization.jsonObject(with: Data(trimmed.utf8), options: [.fragmentsAllowed]) }
        catch { throw fail("Input begins like JSON but is invalid: \(error.localizedDescription)") }
        var config: [String: Any]?
        let items: [Any]
        if let array = decoded as? [Any] { items = array }
        else if let object = decoded as? [String: Any] {
            config = object
            guard let samples = object["samples"] as? [Any] else { throw fail("JSON object needs a 'samples' array.") }
            items = samples
        } else { throw fail("Use a JSON array or an object containing 'samples'.") }
        guard !items.isEmpty && items.count <= maxSamples else { throw fail("Regex Studio accepts 1–\(maxSamples) samples per run.") }
        let rows: [Sample] = try items.enumerated().map { index, item in
            if let text = item as? String { return Sample(label: "Sample \(index + 1)", text: text, expectMatch: nil, expectMatches: nil) }
            guard let object = item as? [String: Any], let text = (object["text"] as? String) ?? (object["sample"] as? String) else {
                throw fail("Sample \(index + 1) must be a string or an object with a string 'text' field.")
            }
            let label = (object["label"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).prefix(120)
            var expected: Bool?
            if let rawExpected = object["expectMatch"] {
                guard let value = rawExpected as? Bool else { throw fail("Sample \(index + 1) expectMatch must be true or false.") }
                expected = value
            }
            var expectedCount: Int?
            if let rawCount = object["expectMatches"] {
                guard let value = rawCount as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(), value.doubleValue >= 0, value.doubleValue.rounded() == value.doubleValue, value.doubleValue <= Double(Int.max) else {
                    throw fail("Sample \(index + 1) expectMatches must be a non-negative integer.")
                }
                expectedCount = value.intValue
            }
            return Sample(label: label.map(String.init).flatMap { $0.isEmpty ? nil : $0 } ?? "Sample \(index + 1)", text: text, expectMatch: expected, expectMatches: expectedCount)
        }
        return (rows, config)
    }

    private static func normalizeFlags(_ raw: String) throws -> NSRegularExpression.Options {
        let allowed = Set("gimsu")
        let unknown = Set(raw).subtracting(allowed).sorted()
        guard unknown.isEmpty else { throw fail("iOS uses Foundation ICU; unsupported flag(s): \(String(unknown)). Supported UI flags: g, i, m, s, u.") }
        guard Set(raw).count == raw.count else { throw fail("Duplicate regex flags are not allowed.") }
        var options: NSRegularExpression.Options = []
        if raw.contains("i") { options.insert(.caseInsensitive) }
        if raw.contains("m") { options.insert(.anchorsMatchLines) }
        if raw.contains("s") { options.insert(.dotMatchesLineSeparators) }
        // ICU's Unicode behavior is enabled by default. 'g' is handled by enumerating all matches.
        return options
    }

    private static func compile(_ pattern: String, flags: NSRegularExpression.Options) throws -> NSRegularExpression {
        do { return try NSRegularExpression(pattern: pattern, options: flags) }
        catch { throw fail("Invalid iOS Foundation ICU regex: \(error.localizedDescription)") }
    }

    private static func runPipeline(defaultPattern: String, raw: String, flags: NSRegularExpression.Options, replacement: String) throws -> String {
        guard raw.utf8.count <= maxPipelineInput + 100_000 else { throw fail("Pipeline configuration exceeds the JSON/input size limit.") }
        let config: [String: Any]
        do {
            guard let object = try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any] else { throw fail("Pipeline input must be a JSON object.") }
            config = object
        } catch let error as NSError where error.domain == "enV.NativeRegexStudio" { throw error }
        catch { throw fail("Pipeline JSON is invalid: \(error.localizedDescription)") }
        guard let layers = config["layers"] as? [[String: Any]], !layers.isEmpty, layers.count <= 12 else { throw fail("A substitution pipeline must contain 1–12 ordered layers.") }
        var current = config["input"] as? String ?? ""
        guard current.count <= maxPipelineInput else { throw fail("Pipeline input exceeds \(maxPipelineInput) characters.") }
        var reports = [[String: Any]](), totalReplacements = 0
        var blocked = false
        for (index, layer) in layers.enumerated() {
            let name = (layer["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).prefix(120)
            guard let layerPattern = layer["pattern"] as? String, layerPattern.count <= 5_000,
                  let layerReplacement = layer["replacement"] as? String, layerReplacement.count <= 10_000 else {
                throw fail("Pipeline layer \(index + 1) needs a pattern (up to 5,000 chars) and replacement (up to 10,000 chars).")
            }
            let layerFlags = try normalizeFlags(layer["flags"] as? String ?? "g")
            if blocked {
                reports.append(["index": index + 1, "name": name.map(String.init) ?? "Layer \(index + 1)", "status": "blocked", "note": "A previous layer was blocked; this layer was not executed."])
                continue
            }
            if isRisky(layerPattern) && current.count > 24 {
                blocked = true
                reports.append(["index": index + 1, "name": name.map(String.init) ?? "Layer \(index + 1)", "status": "blocked-risk", "inputLength": current.count,
                                "note": "Risk heuristic blocked this backtracking-prone pattern on a non-trivial input."])
                continue
            }
            let expression = try compile(layerPattern, flags: layerFlags)
            let began = CFAbsoluteTimeGetCurrent()
            let range = NSRange(current.startIndex..<current.endIndex, in: current)
            let matches = expression.numberOfMatches(in: current, range: range)
            guard matches <= 100_000 else { throw fail("Pipeline layer \(index + 1) exceeds 100,000 matches.") }
            let output = expression.stringByReplacingMatches(in: current, range: range, withTemplate: layerReplacement)
            guard output.count <= maxPipelineOutput else { throw fail("Pipeline layer \(index + 1) exceeds \(maxPipelineOutput) output characters; execution stopped.") }
            reports.append(["index": index + 1, "name": name.map(String.init) ?? "Layer \(index + 1)", "status": "ok", "replacements": matches,
                            "inputLength": current.count, "outputLength": output.count,
                            "elapsedMs": max(0, (CFAbsoluteTimeGetCurrent() - began) * 1000), "outputPreview": preview(output, max: 2_000)])
            totalReplacements += matches
            current = output
        }
        return try jsonString(["mode": "pipeline", "engine": "iOS Foundation NSRegularExpression (ICU)", "layers": reports, "blocked": blocked,
                               "totalReplacements": totalReplacements, "finalOutputPreview": preview(current, max: 8_000), "finalOutputLength": current.count,
                               "executionBudget": "No in-process hard interrupt exists for an individual ICU match; high-risk patterns are refused on non-trivial inputs.",
                               "privacy": "Pipeline input is transient and is not persisted by this engine."])
    }

    private static func benchmark(_ expression: NSRegularExpression, source: String, samples: [Sample], config: [String: Any]?) throws -> String {
        if isRisky(source) { return try jsonString(["mode": "benchmark", "engine": "iOS Foundation NSRegularExpression (ICU)", "executionSkipped": true,
                                                   "performanceRisk": "Benchmark skipped: static scan found a likely catastrophic-backtracking pattern.", "note": "No benchmark iterations executed; a static heuristic cannot prove other patterns safe."]) }
        guard samples.allSatisfy({ $0.text.count <= maxBenchmarkSample }) && samples.reduce(0, { $0 + $1.text.count }) <= 16_384 else {
            throw fail("Native benchmark inputs are limited to 4,096 characters per sample and 16,384 characters combined.")
        }
        let requested = max(5, min(30, config?["iterations"] as? Int ?? 15))
        var timings = [Double]()
        let began = CFAbsoluteTimeGetCurrent()
        for _ in 0..<requested {
            let iterationStart = CFAbsoluteTimeGetCurrent()
            for sample in samples {
                let range = NSRange(sample.text.startIndex..<sample.text.endIndex, in: sample.text)
                _ = expression.firstMatch(in: sample.text, range: range)
            }
            timings.append(max(0, (CFAbsoluteTimeGetCurrent() - iterationStart) * 1000))
            if (CFAbsoluteTimeGetCurrent() - began) * 1000 > benchmarkBudgetMs { break }
        }
        let sorted = timings.sorted()
        guard !sorted.isEmpty else { throw fail("Benchmark did not complete any iterations.") }
        func percentile(_ p: Double) -> Double { sorted[max(0, min(sorted.count - 1, Int(ceil(p * Double(sorted.count))) - 1))] }
        let mean = timings.reduce(0, +) / Double(timings.count)
        let jitter = sqrt(timings.reduce(0) { $0 + ($1 - mean) * ($1 - mean) } / Double(timings.count))
        return try jsonString(["mode": "benchmark", "engine": "iOS Foundation NSRegularExpression (ICU)", "completedIterations": timings.count,
                               "requestedIterations": requested, "medianMs": percentile(0.5), "p95Ms": percentile(0.95),
                               "minMs": sorted[0], "maxMs": sorted[sorted.count - 1], "jitterStdDevMs": jitter,
                               "samples": samples.count, "sampleCharacters": samples.reduce(0) { $0 + $1.text.count },
                               "budgetMs": benchmarkBudgetMs, "budgetStoppedBetweenIterations": timings.count < requested,
                               "note": "Native microbenchmark only; timing is device-dependent and a single regex call cannot be forcefully interrupted."])
    }

    private static func formatPattern(_ pattern: String) throws -> String {
        let tokens = tokenize(pattern)
        return try jsonString(["mode": "format", "engine": "iOS Foundation NSRegularExpression (ICU)", "original": pattern,
                               "tokens": tokens, "roundTripExact": tokens.joined() == pattern,
                               "formattedDisplay": tokens.map { "  \($0)" }.joined(separator: "\n"),
                               "note": "Readable token display only; no free-spacing syntax is inserted. Concatenating tokens reconstructs the exact pattern."])
    }

    private static func analyzeFlavors(_ pattern: String) throws -> String {
        var findings = [[String: Any]]()
        func add(_ feature: String, _ detail: String, _ severity: String = "warning") { findings.append(["feature": feature, "detail": detail, "severity": severity]) }
        if pattern.contains("(?P<") { add("Python named capture", "Python uses (?P<name>...), while ICU/JavaScript use different named-capture conventions.", "error") }
        if pattern.range(of: #"\\[AKzZ]"#, options: .regularExpression) != nil { add("Absolute anchors", "\\A, \\Z and \\z have flavor-specific semantics and are not uniformly portable.") }
        if pattern.contains("\\K") { add("Match reset", "PCRE2 \\K is not supported by Foundation NSRegularExpression.", "error") }
        if pattern.contains("(?<=") || pattern.contains("(?<!") { add("Lookbehind", "Lookbehind length and accepted syntax vary across ICU, JavaScript, PCRE2, Python and other flavors.") }
        if pattern.range(of: #"\([^)]*[+*][^)]*\)[+*{]"#, options: .regularExpression) != nil { add("Nested repetition", "Nested repetition may cause excessive backtracking; this is a risk signal, not proof of ReDoS.") }
        if findings.isEmpty { add("No covered portability marker", "Static hints only; no cross-engine compile or equivalence proof was performed.", "info") }
        return try jsonString(["mode": "flavors", "nativeEngine": "iOS Foundation NSRegularExpression (ICU)",
                               "coveredComparisons": ["JavaScript RegExp", "PCRE2", "Python", "Java/.NET", "Go RE2"], "findings": findings,
                               "note": "Static compatibility hints only. No automatic flavor conversion or cross-engine equivalence is claimed."])
    }

    private static func tokenize(_ pattern: String) -> [String] {
        let characters = Array(pattern)
        var tokens = [String](), index = 0
        while index < characters.count {
            let start = index
            switch characters[index] {
            case "\\":
                index += 1
                if index < characters.count && characters[index] == "k" && index + 1 < characters.count && characters[index + 1] == "<" {
                    index += 2; while index < characters.count && characters[index] != ">" { index += 1 }; if index < characters.count { index += 1 }
                } else if index < characters.count { index += 1 }
            case "[":
                index += 1; var escaped = false
                while index < characters.count { let character = characters[index]; index += 1; if escaped { escaped = false } else if character == "\\" { escaped = true } else if character == "]" { break } }
            case "(":
                index += 1
                if index < characters.count && characters[index] == "?" {
                    index += 1
                    if index < characters.count && [":", "=", "!"].contains(String(characters[index])) { index += 1 }
                    else if index < characters.count && characters[index] == "<" { index += 1; while index < characters.count && characters[index] != ">" { index += 1 }; if index < characters.count { index += 1 } }
                }
            case "{":
                index += 1; while index < characters.count && characters[index].isNumber { index += 1 }
                if index < characters.count && characters[index] == "," { index += 1; while index < characters.count && characters[index].isNumber { index += 1 } }
                if index < characters.count && characters[index] == "}" { index += 1 }
            default: index += 1
            }
            tokens.append(String(characters[start..<index]))
        }
        return tokens
    }

    /// One-based capture group indexes for `(?<name>...)`; escaped parentheses, character classes,
    /// lookbehind and non-capturing headers do not count as capture groups.
    private static func namedCaptureGroups(_ pattern: String) -> [(Int, String)] {
        let characters = Array(pattern)
        var result = [(Int, String)](), groupNumber = 0, index = 0
        var escaped = false, inClass = false
        while index < characters.count {
            let character = characters[index]
            if escaped { escaped = false; index += 1; continue }
            if character == "\\" { escaped = true; index += 1; continue }
            if inClass { if character == "]" { inClass = false }; index += 1; continue }
            if character == "[" { inClass = true; index += 1; continue }
            guard character == "(" else { index += 1; continue }
            guard index + 1 < characters.count, characters[index + 1] == "?" else {
                groupNumber += 1; index += 1; continue
            }
            if index + 3 < characters.count, characters[index + 2] == "<", characters[index + 3] != "=", characters[index + 3] != "!" {
                var end = index + 3
                while end < characters.count && characters[end] != ">" { end += 1 }
                if end < characters.count {
                    groupNumber += 1
                    result.append((groupNumber, String(characters[(index + 3)..<end])))
                    index = end + 1
                    continue
                }
            }
            index += 1
        }
        return result
    }

    private static func capture(_ text: String, _ range: NSRange) -> String? {
        guard range.location != NSNotFound, let swiftRange = Range(range, in: text) else { return nil }
        return String(text[swiftRange])
    }

    private static func isRisky(_ pattern: String) -> Bool {
        riskPattern.firstMatch(in: pattern, range: NSRange(pattern.startIndex..<pattern.endIndex, in: pattern)) != nil
    }

    private static func preview(_ value: String, max: Int = 500) -> String {
        guard value.count > max else { return value }
        return String(value.prefix(max)) + "… [truncated; \(value.count) total chars]"
    }

    private static func jsonString(_ value: Any) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys, .fragmentsAllowed])
        return String(data: data, encoding: .utf8) ?? "{}"
    }
}
