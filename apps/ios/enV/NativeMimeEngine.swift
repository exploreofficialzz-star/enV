import Foundation

/// Local-only implementation of the catalog's mime/lookup operation.
public struct NativeMimeEntry: Equatable {
    public let ext: String
    public let mime: String
    public let name: String
    public let group: String
    public let magic: [UInt8]?
    public init(ext: String, mime: String, name: String, group: String, magic: [UInt8]? = nil) {
        self.ext = ext; self.mime = mime; self.name = name; self.group = group; self.magic = magic
    }
}

public struct NativeMimeRow: Equatable {
    public let ext: String
    public let mime: String
    public let name: String
    public let group: String
}

public struct NativeMimeInspection: Equatable {
    public let fileName: String
    public let browserMime: String
    public let `extension`: String
    public let bytesHex: String
    public let entry: NativeMimeEntry?
    public let mismatch: Bool
}

public struct NativeMimeResult: Equatable {
    public let rows: [NativeMimeRow]
    public let inspection: NativeMimeInspection?
    public let output: String
}

public enum NativeMimeError: LocalizedError {
    case unknownTool(String)
    public var errorDescription: String? {
        switch self { case .unknownTool(let id): return "Unknown MIME tool: \(id)" }
    }
}

public enum NativeMimeEngine {
    private static let idToOperation = ["mime-lookup": "lookup", "mime-type-lookup": "lookup"]
    public static var supportedToolIDs: Set<String> { Set(idToOperation.keys) }
    public static func operation(forToolID toolID: String) -> String? { idToOperation[toolID] }

    private static let types: [NativeMimeEntry] = [
        .init(ext: "txt", mime: "text/plain", name: "Plain text", group: "text"), .init(ext: "html", mime: "text/html", name: "HTML", group: "text"),
        .init(ext: "css", mime: "text/css", name: "CSS", group: "text"), .init(ext: "csv", mime: "text/csv", name: "CSV", group: "text"),
        .init(ext: "xml", mime: "application/xml", name: "XML", group: "application"), .init(ext: "json", mime: "application/json", name: "JSON", group: "application"),
        .init(ext: "js", mime: "text/javascript", name: "JavaScript", group: "text"), .init(ext: "mjs", mime: "text/javascript", name: "JavaScript module", group: "text"),
        .init(ext: "ts", mime: "text/typescript", name: "TypeScript", group: "text"), .init(ext: "md", mime: "text/markdown", name: "Markdown", group: "text"),
        .init(ext: "pdf", mime: "application/pdf", name: "PDF", group: "application", magic: [0x25, 0x50, 0x44, 0x46]),
        .init(ext: "zip", mime: "application/zip", name: "ZIP archive", group: "application", magic: [0x50, 0x4b, 0x03, 0x04]),
        .init(ext: "gz", mime: "application/gzip", name: "GZIP archive", group: "application", magic: [0x1f, 0x8b]),
        .init(ext: "rar", mime: "application/vnd.rar", name: "RAR archive", group: "application", magic: [0x52, 0x61, 0x72, 0x21]),
        .init(ext: "7z", mime: "application/x-7z-compressed", name: "7-Zip archive", group: "application", magic: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]),
        .init(ext: "doc", mime: "application/msword", name: "Word document", group: "application", magic: [0xd0, 0xcf, 0x11, 0xe0]),
        .init(ext: "xls", mime: "application/vnd.ms-excel", name: "Excel workbook", group: "application", magic: [0xd0, 0xcf, 0x11, 0xe0]),
        .init(ext: "ppt", mime: "application/vnd.ms-powerpoint", name: "PowerPoint presentation", group: "application", magic: [0xd0, 0xcf, 0x11, 0xe0]),
        .init(ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", name: "Word document", group: "application", magic: [0x50, 0x4b, 0x03, 0x04]),
        .init(ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", name: "Excel workbook", group: "application", magic: [0x50, 0x4b, 0x03, 0x04]),
        .init(ext: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", name: "PowerPoint presentation", group: "application", magic: [0x50, 0x4b, 0x03, 0x04]),
        .init(ext: "epub", mime: "application/epub+zip", name: "EPUB ebook", group: "application", magic: [0x50, 0x4b, 0x03, 0x04]),
        .init(ext: "apk", mime: "application/vnd.android.package-archive", name: "Android package", group: "application", magic: [0x50, 0x4b, 0x03, 0x04]),
        .init(ext: "png", mime: "image/png", name: "PNG image", group: "image", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        .init(ext: "jpg", mime: "image/jpeg", name: "JPEG image", group: "image", magic: [0xff, 0xd8, 0xff]),
        .init(ext: "jpeg", mime: "image/jpeg", name: "JPEG image", group: "image", magic: [0xff, 0xd8, 0xff]),
        .init(ext: "gif", mime: "image/gif", name: "GIF image", group: "image", magic: [0x47, 0x49, 0x46, 0x38]),
        .init(ext: "webp", mime: "image/webp", name: "WebP image", group: "image", magic: [0x52, 0x49, 0x46, 0x46]),
        .init(ext: "bmp", mime: "image/bmp", name: "Bitmap image", group: "image", magic: [0x42, 0x4d]),
        .init(ext: "svg", mime: "image/svg+xml", name: "SVG image", group: "image"), .init(ext: "ico", mime: "image/x-icon", name: "Icon", group: "image", magic: [0, 0, 1, 0]),
        .init(ext: "avif", mime: "image/avif", name: "AVIF image", group: "image"), .init(ext: "mp3", mime: "audio/mpeg", name: "MP3 audio", group: "audio", magic: [0x49, 0x44, 0x33]),
        .init(ext: "wav", mime: "audio/wav", name: "WAV audio", group: "audio", magic: [0x52, 0x49, 0x46, 0x46]),
        .init(ext: "ogg", mime: "audio/ogg", name: "Ogg audio", group: "audio", magic: [0x4f, 0x67, 0x67, 0x53]),
        .init(ext: "flac", mime: "audio/flac", name: "FLAC audio", group: "audio", magic: [0x66, 0x4c, 0x61, 0x43]),
        .init(ext: "mp4", mime: "video/mp4", name: "MPEG-4 video", group: "video"), .init(ext: "webm", mime: "video/webm", name: "WebM video", group: "video", magic: [0x1a, 0x45, 0xdf, 0xa3]),
        .init(ext: "mov", mime: "video/quicktime", name: "QuickTime video", group: "video"), .init(ext: "woff", mime: "font/woff", name: "WOFF font", group: "font", magic: [0x77, 0x4f, 0x46, 0x46]),
        .init(ext: "woff2", mime: "font/woff2", name: "WOFF2 font", group: "font", magic: [0x77, 0x4f, 0x46, 0x32]), .init(ext: "ttf", mime: "font/ttf", name: "TrueType font", group: "font", magic: [0, 1, 0, 0]),
        .init(ext: "otf", mime: "font/otf", name: "OpenType font", group: "font", magic: [0x4f, 0x54, 0x54, 0x4f]), .init(ext: "wasm", mime: "application/wasm", name: "WebAssembly", group: "application", magic: [0, 0x61, 0x73, 0x6d]),
        .init(ext: "sqlite", mime: "application/vnd.sqlite3", name: "SQLite database", group: "application", magic: [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0]),
        .init(ext: "psd", mime: "image/vnd.adobe.photoshop", name: "Photoshop document", group: "image", magic: [0x38, 0x42, 0x50, 0x53]),
        .init(ext: "tar", mime: "application/x-tar", name: "TAR archive", group: "application")
    ]

    public static func run(toolID: String, input: String = "", options: [String: String] = [:]) throws -> NativeMimeResult {
        guard operation(forToolID: toolID) == "lookup" else { throw NativeMimeError.unknownTool(toolID) }
        let query = (options["query"] ?? input).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let rows = types.filter { query.isEmpty || $0.ext.contains(query) || $0.mime.contains(query) || $0.name.lowercased().contains(query) || $0.group.contains(query) }.prefix(80).map { NativeMimeRow(ext: $0.ext, mime: $0.mime, name: $0.name, group: $0.group) }
        let bytes = parseBytes(options["bytesHex"] ?? options["bytes"] ?? "")
        let inspection: NativeMimeInspection? = (options["fileName"] != nil || !bytes.isEmpty) ? inspect(fileName: options["fileName"] ?? "", browserMime: options["browserMime"] ?? "unknown", bytes: bytes) : nil
        var lines = rows.map { ".\($0.ext)\t\($0.mime)\t\($0.name)\t\($0.group)" }
        if let i = inspection {
            let extensionName = i.extension.isEmpty ? "none" : i.extension
            let signature = i.entry.map { "\($0.name) (\($0.mime))" } ?? "Unknown signature"
            lines += ["Filename: \(i.fileName)", "Declared MIME: \(i.browserMime)", "Extension: .\(extensionName)", "Signature match: \(signature)", "Bytes: \(i.bytesHex)"]
            if i.mismatch { lines.append("The detected signature does not match the filename extension.") }
        }
        return NativeMimeResult(rows: rows, inspection: inspection, output: lines.joined(separator: "\n"))
    }

    public static func inspect(fileName: String, browserMime: String = "unknown", bytes: [UInt8]) -> NativeMimeInspection {
        let limited = Array(bytes.prefix(64))
        let entry = types.first { candidate in
            guard let magic = candidate.magic, limited.count >= magic.count else { return false }
            return zip(magic, limited).allSatisfy { $0 == $1 }
        }
        let ext = fileName.split(separator: ".", omittingEmptySubsequences: false).last.map(String.init)?.lowercased() ?? ""
        let mismatch = entry != nil && !ext.isEmpty && entry!.ext != ext && !(entry!.ext == "jpg" && ext == "jpeg")
        let hex = limited.map { String(format: "%02x", $0) }.joined(separator: " ")
        return NativeMimeInspection(fileName: fileName, browserMime: browserMime, extension: ext, bytesHex: hex, entry: entry, mismatch: mismatch)
    }

    private static func parseBytes(_ value: String) -> [UInt8] {
        guard !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
        return value.split { $0 == " " || $0 == "\t" || $0 == "\n" || $0 == "\r" || $0 == "," }.compactMap { token in
            var text = String(token); if text.hasPrefix("0x") || text.hasPrefix("0X") { text.removeFirst(2) }
            guard let n = UInt8(text, radix: 16) else { return nil }; return n
        }
    }
}
