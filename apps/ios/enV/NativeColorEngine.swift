import Foundation

public struct NativeColorRGB: Equatable {
    public let r: Int, g: Int, b: Int
}

public struct NativeColorHSL: Equatable {
    public let h: Double, s: Double, l: Double
}

public struct NativeColorCMYK: Equatable {
    public let c: Double, m: Double, y: Double, k: Double
}

public struct NativeColorResult: Equatable {
    public let output: String
    public let hex: String?
    public let rgb: NativeColorRGB?
    public let hsl: NativeColorHSL?
    public let hsv: NativeColorHSL?
    public let cmyk: NativeColorCMYK?
    public let palette: [String]
    public let contrastRatio: Double?
    public let passesAA: Bool?
    public let passesAAA: Bool?

    public init(output: String, hex: String? = nil, rgb: NativeColorRGB? = nil, hsl: NativeColorHSL? = nil, hsv: NativeColorHSL? = nil, cmyk: NativeColorCMYK? = nil, palette: [String] = [], contrastRatio: Double? = nil, passesAA: Bool? = nil, passesAAA: Bool? = nil) {
        self.output = output; self.hex = hex; self.rgb = rgb; self.hsl = hsl; self.hsv = hsv; self.cmyk = cmyk; self.palette = palette; self.contrastRatio = contrastRatio; self.passesAA = passesAA; self.passesAAA = passesAAA
    }
}

public enum NativeColorError: LocalizedError {
    case unknownTool
    case invalidHex
    public var errorDescription: String? {
        switch self {
        case .unknownTool: return "Unknown color tool."
        case .invalidHex: return "Enter a 3- or 6-digit hex color."
        }
    }
}

/** Pure Swift implementation of the canonical color engine operations. */
public enum NativeColorEngine {
    private static let operations: [String: String] = [
        "cmyk-converter": "picker", "color-blindness-simulator": "picker", "color-builder": "palette", "color-css-generator": "picker",
        "color-generator": "palette", "palette-generator": "palette", "color-picker": "picker", "color-preset-maker": "picker",
        "color-preview": "picker", "color-svg-generator": "picker", "color-token-generator": "picker", "contrast-checker": "contrast",
        "hsl-converter": "picker", "hsv-converter": "picker", "rgb-converter": "picker", "wcag-checker": "contrast"
    ]

    public static let supportedToolIDs = [
        "cmyk-converter", "color-blindness-simulator", "color-builder", "color-css-generator", "color-generator", "palette-generator",
        "color-picker", "color-preset-maker", "color-preview", "color-svg-generator", "color-token-generator", "contrast-checker",
        "hsl-converter", "hsv-converter", "rgb-converter", "wcag-checker"
    ]

    public static func operation(forToolID id: String) -> String? { operations[id] }

    public static func run(toolID: String, input: String = "#0d9f8a", foreground: String = "#16181d", background: String = "#ffffff") throws -> NativeColorResult {
        guard let operation = operations[toolID] else { throw NativeColorError.unknownTool }
        switch operation {
        case "contrast": return try contrastResult(foreground, background)
        case "picker": return try pickerResult(input, includePalette: false)
        case "palette": return try pickerResult(input, includePalette: true)
        default: throw NativeColorError.unknownTool
        }
    }

    public static func parseHex(_ value: String) throws -> NativeColorRGB {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = normalized.hasPrefix("#") ? String(normalized.dropFirst()) : normalized
        let expanded: String
        if body.count == 3 { expanded = body.map { "\($0)\($0)" }.joined() }
        else if body.count == 6 { expanded = body }
        else { throw NativeColorError.invalidHex }
        guard expanded.allSatisfy({ $0.isASCII && $0.isHexDigit }), let r = Int(expanded.prefix(2), radix: 16), let g = Int(expanded.dropFirst(2).prefix(2), radix: 16), let b = Int(expanded.dropFirst(4).prefix(2), radix: 16) else { throw NativeColorError.invalidHex }
        return NativeColorRGB(r: r, g: g, b: b)
    }

    public static func toHex(_ rgb: NativeColorRGB) -> String { String(format: "#%02x%02x%02x", rgb.r, rgb.g, rgb.b) }

    public static func rgbToHSL(_ rgb: NativeColorRGB) -> NativeColorHSL {
        let r = Double(rgb.r) / 255, g = Double(rgb.g) / 255, b = Double(rgb.b) / 255
        let hi = max(r, max(g, b)), lo = min(r, min(g, b)), d = hi - lo, l = (hi + lo) / 2
        if d == 0 { return NativeColorHSL(h: 0, s: 0, l: l * 100) }
        let s = d / (l > 0.5 ? 2 - hi - lo : hi + lo)
        let h: Double
        if hi == r { h = ((g - b) / d + (g < b ? 6 : 0)) / 6 }
        else if hi == g { h = ((b - r) / d + 2) / 6 }
        else { h = ((r - g) / d + 4) / 6 }
        return NativeColorHSL(h: h * 360, s: s * 100, l: l * 100)
    }

    public static func hslToRGB(_ hsl: NativeColorHSL) -> NativeColorRGB {
        var h = hsl.h.truncatingRemainder(dividingBy: 360) / 360; if h < 0 { h += 1 }
        let s = hsl.s / 100, l = hsl.l / 100
        if s == 0 { let value = roundedByte(l * 255); return NativeColorRGB(r: value, g: value, b: value) }
        let q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
        func hue(_ initial: Double) -> Double {
            var t = initial; if t < 0 { t += 1 }; if t > 1 { t -= 1 }
            if t < 1.0 / 6 { return p + (q - p) * 6 * t }
            if t < 1.0 / 2 { return q }
            if t < 2.0 / 3 { return p + (q - p) * (2.0 / 3 - t) * 6 }
            return p
        }
        return NativeColorRGB(r: roundedByte(hue(h + 1.0 / 3) * 255), g: roundedByte(hue(h) * 255), b: roundedByte(hue(h - 1.0 / 3) * 255))
    }

    public static func cmyk(_ rgb: NativeColorRGB) -> NativeColorCMYK {
        let r = Double(rgb.r) / 255, g = Double(rgb.g) / 255, b = Double(rgb.b) / 255, k = 1 - max(r, max(g, b))
        if k == 1 { return NativeColorCMYK(c: 0, m: 0, y: 0, k: 100) }
        return NativeColorCMYK(c: (1 - r - k) / (1 - k) * 100, m: (1 - g - k) / (1 - k) * 100, y: (1 - b - k) / (1 - k) * 100, k: k * 100)
    }

    public static func contrastRatio(_ foreground: NativeColorRGB, _ background: NativeColorRGB) -> Double {
        let a = luminance(foreground), b = luminance(background); return (max(a, b) + 0.05) / (min(a, b) + 0.05)
    }

    private static func pickerResult(_ value: String, includePalette: Bool) throws -> NativeColorResult {
        let rgb = try parseHex(value), hsl = rgbToHSL(rgb), hsv = NativeColorHSL(h: hsl.h, s: hsl.s, l: Double(max(rgb.r, max(rgb.g, rgb.b))) / 255 * 100), cmykValue = cmyk(rgb)
        let paletteValue = includePalette ? palette(hsl) : []
        var lines = ["HEX: \(toHex(rgb))", "RGB: \(rgb.r), \(rgb.g), \(rgb.b)", "HSL: \(rounded(hsl.h))°, \(rounded(hsl.s))%, \(rounded(hsl.l))%", "HSV/HSB: \(rounded(hsv.h))°, \(rounded(hsv.s))%, \(rounded(hsv.l))%", "CMYK: \(rounded(cmykValue.c)) / \(rounded(cmykValue.m)) / \(rounded(cmykValue.y)) / \(rounded(cmykValue.k))"]
        if includePalette { lines.append("PALETTE: \(paletteValue.joined(separator: ", "))") }
        return NativeColorResult(output: lines.joined(separator: "\n"), hex: toHex(rgb), rgb: rgb, hsl: hsl, hsv: hsv, cmyk: cmykValue, palette: paletteValue)
    }

    private static func contrastResult(_ foreground: String, _ background: String) throws -> NativeColorResult {
        let fg = try parseHex(foreground), bg = try parseHex(background), ratio = contrastRatio(fg, bg), aa = ratio >= 4.5, aaa = ratio >= 7
        let number = String(format: "%.2f", ratio)
        return NativeColorResult(output: "Contrast ratio \(number):1\nAA \(aa ? "pass" : "fail") · AAA \(aaa ? "pass" : "fail")", contrastRatio: ratio, passesAA: aa, passesAAA: aaa)
    }

    private static func palette(_ base: NativeColorHSL) -> [String] { [0, 30, 60, 120, 180, 210, 240, 300].map { toHex(hslToRGB(NativeColorHSL(h: (base.h + Double($0)).truncatingRemainder(dividingBy: 360), s: base.s, l: base.l))) } }
    private static func luminance(_ rgb: NativeColorRGB) -> Double {
        func linear(_ value: Int) -> Double { let x = Double(value) / 255; return x <= 0.03928 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4) }
        return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b)
    }
    private static func roundedByte(_ value: Double) -> Int { min(255, max(0, Int(floor(value + 0.5)))) }
    private static func rounded(_ value: Double) -> String { String(Int(floor(value + 0.5))) }
}
