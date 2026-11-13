import Foundation
import UIKit
import ImageIO
import UniformTypeIdentifiers
import PDFKit
import ZIPFoundation

private final class NativeWordTextCollector: NSObject, XMLParserDelegate {
    private(set) var text = ""
    private var collectingText = false

    private func localName(_ elementName: String, qualifiedName: String?) -> String {
        let name = qualifiedName ?? elementName
        return name.split(separator: ":").last.map(String.init) ?? name
    }

    func parser(
        _ parser: XMLParser,
        didStartElement elementName: String,
        namespaceURI: String?,
        qualifiedName: String?,
        attributes attributeDict: [String: String] = [:]
    ) {
        switch localName(elementName, qualifiedName: qualifiedName) {
        case "p":
            if !text.isEmpty && !text.hasSuffix("\n") { text += "\n" }
        case "t":
            collectingText = true
        case "tab":
            text += "\t"
        case "br", "cr":
            text += "\n"
        default:
            break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if collectingText { text += string }
    }

    func parser(
        _ parser: XMLParser,
        didEndElement elementName: String,
        namespaceURI: String?,
        qualifiedName: String?
    ) {
        switch localName(elementName, qualifiedName: qualifiedName) {
        case "t":
            collectingText = false
        case "p":
            if !text.hasSuffix("\n") { text += "\n" }
        default:
            break
        }
    }
}

enum NativeFileConverterEngine {
    struct Result {
        let text: String?
        let data: Data?
        let mime: String
        let ext: String
        init(_ text: String?, _ data: Data?, _ mime: String, _ ext: String) {
            self.text = text
            self.data = data
            self.mime = mime
            self.ext = ext
        }
    }
    private static let imageOps:Set<String> = ["jpg-to-png","png-to-jpg","png-to-webp","webp-to-png","jpg-to-webp","webp-to-jpg","png-to-svg"]
    static func operation(_ tool:Tool)->String { tool.engine.configuration["op"].flatMap { if case .string(let v) = $0 { return v }; return nil } ?? tool.engine.op ?? tool.id }
    private static let documentOps:Set<String> = ["pdf-metadata-viewer","pdf-metadata-tool","pdf-page-extractor","pdf-splitter","pdf-rotator","pdf-merger","pdf-text-extractor","docx-text-extractor"]
    static func supports(_ tool:Tool)->Bool { (tool.engine.type == "file-converter" && (imageOps.contains(operation(tool)) || ["file-to-txt","csv-to-json","json-to-csv","csv-to-tsv","tsv-to-csv","xml-to-json","json-to-xml","yaml-to-json","json-to-yaml","txt-to-csv","csv-to-txt","markdown-to-html","html-to-markdown"].contains(operation(tool)))) || (tool.engine.type == "document-backend" && documentOps.contains(operation(tool))) }
    static func run(_ tool:Tool,file:NativeBackendFile)throws->Result {
        let op=operation(tool); if op == "file-to-txt" { return try convertFileToText(name: file.name, data: file.data, mime: (UTType(filenameExtension: URL(fileURLWithPath: file.name).pathExtension)?.preferredMIMEType ?? "application/octet-stream")) }; if documentOps.contains(op) { return try document(op,file:file) }; if imageOps.contains(op) { return try image(op,file.data) }
        let input=String(decoding:file.data,as:UTF8.self)
        switch op {
        case "csv-to-json": return Result(try csvToJson(input),nil,"application/json","json")
        case "json-to-csv": return Result(rowsToCsv(try jsonRows(input)),nil,"text/csv","csv")
        case "csv-to-tsv": return Result(rowsToCsv(parseCsv(input),separator:"\t"),nil,"text/tab-separated-values","tsv")
        case "tsv-to-csv": return Result(rowsToCsv(parseCsv(input,separator:"\t")),nil,"text/csv","csv")
        case "xml-to-json": return Result(try xmlToJson(input),nil,"application/json","json")
        case "json-to-xml":
            let value = try JSONSerialization.jsonObject(with: Data(input.utf8))
            return Result("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" + objectToXml(value), nil, "application/xml", "xml")
        case "yaml-to-json": return Result(try JSONSerialization.data(withJSONObject:simpleYaml(input),options:.prettyPrinted).utf8String,nil,"application/json","json")
        case "json-to-yaml": return Result(jsonToYaml(try JSONSerialization.jsonObject(with:Data(input.utf8)))+"\n",nil,"text/yaml","yaml")
        case "txt-to-csv": return Result(rowsToCsv(input.split(whereSeparator:\.isNewline).map{[String($0)]}),nil,"text/csv","csv")
        case "csv-to-txt": return Result(parseCsv(input).map{$0.joined(separator:" ")}.joined(separator:"\n")+"\n",nil,"text/plain","txt")
        case "markdown-to-html": return Result(markdownToHtml(input),nil,"text/html","html")
        case "html-to-markdown": return Result(htmlToMarkdown(input)+"\n",nil,"text/markdown","md")
        default: throw NativeNativeError.message("Unsupported file conversion: \(op)")
        }
    }
    static func convertFileToText(name: String, data: Data, mime: String) throws -> Result {
        guard !data.isEmpty else { throw NativeNativeError.message("The selected file is empty.") }
        guard data.count <= 200 * 1024 * 1024 else {
            throw NativeNativeError.message("The selected file exceeds the 200 MB local text extraction limit.")
        }
        let ext = URL(fileURLWithPath: name).pathExtension.lowercased()
        let text: String
        if ext == "docx" {
            text = try extractDocxText(data)
        } else if ext == "pdf" {
            guard data.count <= 200 * 1024 * 1024,
                  let pdf = PDFDocument(data: data),
                  pdf.pageCount <= 250 else {
                throw NativeNativeError.message("This PDF is unreadable or exceeds the local 200 MB or 250-page extraction limit.")
            }
            text = (0..<pdf.pageCount).compactMap { pdf.page(at: $0)?.string }.joined(separator: "\n\n")
            guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                throw NativeNativeError.message("No selectable text was found. Scanned image-only PDFs need OCR and cannot be converted by this tool.")
            }
        } else if ["html", "htm", "xhtml"].contains(ext) {
            let markup = String(decoding: data, as: UTF8.self)
            text = markup
                .replacingOccurrences(of: #"(?is)<(script|style|noscript)[^>]*>.*?</\1>"#, with: " ", options: .regularExpression)
                .replacingOccurrences(of: #"(?s)<[^>]+>"#, with: " ", options: .regularExpression)
                .replacingOccurrences(of: "&nbsp;", with: " ")
                .replacingOccurrences(of: "&amp;", with: "&")
                .replacingOccurrences(of: "&lt;", with: "<")
                .replacingOccurrences(of: "&gt;", with: ">")
                .replacingOccurrences(of: "&quot;", with: "\"")
                .replacingOccurrences(of: "&apos;", with: "'")
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)
        } else {
            let supported: Set<String> = [
                "txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml",
                "css", "js", "mjs", "cjs", "ts", "tsx", "jsx", "sql", "log", "ini",
                "toml", "sh", "properties", "conf", "cfg", "srt", "vtt", "ics"
            ]
            guard supported.contains(ext) || mime.lowercased().hasPrefix("text/") else {
                throw NativeNativeError.message("Choose a supported text, Markdown, CSV, JSON, XML, YAML, HTML, DOCX or selectable-text PDF file.")
            }
            guard let decoded = String(data: data, encoding: .utf8) else {
                throw NativeNativeError.message("This file is not valid UTF-8 text.")
            }
            text = decoded.replacingOccurrences(of: "\u{FEFF}", with: "")
        }
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw NativeNativeError.message("The selected file contains no readable text.")
        }
        return Result(text.trimmingCharacters(in: .newlines) + "\n", nil, "text/plain", "txt")
    }

    private static let maxFileToTextBytes = 200 * 1024 * 1024
    private static let maxDocxXmlBytes = 32 * 1024 * 1024
    private static let maxDocxExpandedBytes: UInt64 = 128 * 1024 * 1024
    private static let maxDocxEntries = 10_000

    private static func extractDocxText(_ data: Data) throws -> String {
        guard !data.isEmpty else {
            throw NativeNativeError.message("The selected file is empty.")
        }
        guard data.count <= maxFileToTextBytes else {
            throw NativeNativeError.message("The selected DOCX file exceeds the 200 MB local extraction limit.")
        }

        let archive = try Archive(data: data, accessMode: .read)
        var entryCount = 0
        var expandedBytes: UInt64 = 0
        var documentEntry: Entry?

        for entry in archive {
            entryCount += 1
            guard entryCount <= maxDocxEntries else {
                throw NativeNativeError.message("This DOCX archive contains too many entries to inspect safely.")
            }
            guard entry.type == .file || entry.type == .directory else {
                throw NativeNativeError.message("This DOCX archive contains a link or unsupported entry type.")
            }

            let nextExpanded = expandedBytes.addingReportingOverflow(entry.uncompressedSize)
            guard !nextExpanded.overflow, nextExpanded.partialValue <= maxDocxExpandedBytes else {
                throw NativeNativeError.message("This DOCX archive expands beyond the 128 MB local safety limit.")
            }
            expandedBytes = nextExpanded.partialValue

            if entry.path == "word/document.xml" {
                guard entry.type == .file, documentEntry == nil else {
                    throw NativeNativeError.message("This DOCX archive contains an invalid or duplicate document body.")
                }
                guard entry.uncompressedSize <= UInt64(maxDocxXmlBytes) else {
                    throw NativeNativeError.message("The DOCX document XML exceeds the 32 MB local extraction limit.")
                }
                documentEntry = entry
            }
        }

        guard let documentEntry else {
            throw NativeNativeError.message("This DOCX file does not contain word/document.xml.")
        }

        var xmlData = Data()
        xmlData.reserveCapacity(Int(documentEntry.uncompressedSize))
        let checksum = try archive.extract(
            documentEntry,
            bufferSize: 64 * 1024,
            consumer: { chunk in
                guard chunk.count <= Self.maxDocxXmlBytes,
                      xmlData.count <= Self.maxDocxXmlBytes - chunk.count else {
                    throw NativeNativeError.message("The DOCX document XML exceeds the 32 MB local extraction limit.")
                }
                xmlData.append(chunk)
            }
        )
        guard checksum == documentEntry.checksum else {
            throw NativeNativeError.message("The DOCX document body failed its archive integrity check.")
        }

        // Office Open XML does not need external entities. Reject DTDs and keep
        // Foundation's XML parser from resolving any external resources.
        guard let xml = String(data: xmlData, encoding: .utf8),
              !xml.range(of: "<!DOCTYPE", options: .caseInsensitive).map({ _ in true }, default: false),
              !xml.range(of: "<!ENTITY", options: .caseInsensitive).map({ _ in true }, default: false) else {
            throw NativeNativeError.message("The DOCX document body is invalid or uses unsupported XML declarations.")
        }

        let collector = NativeWordTextCollector()
        let parser = XMLParser(data: xmlData)
        parser.shouldResolveExternalEntities = false
        parser.delegate = collector
        guard parser.parse(), parser.parserError == nil else {
            throw NativeNativeError.message("The DOCX document body contains invalid XML.")
        }
        let output = collector.text.trimmingCharacters(in: .newlines)
        guard !output.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw NativeNativeError.message("The DOCX document contains no readable text.")
        }
        return output + "\n"
    }

    private static func document(_ op:String,file:NativeBackendFile)throws->Result {
        guard file.data.count <= 200 * 1024 * 1024 else {
            throw NativeNativeError.message("The selected document exceeds the 200 MB local processing limit.")
        }
        if op == "docx-text-extractor" {
            return Result(try extractDocxText(file.data), nil, "text/plain", "txt")
        }
        guard let pdf=PDFDocument(data:file.data) else { throw NativeNativeError.message("Selected file is not a readable PDF.") }
        guard pdf.pageCount <= 500 else {
            throw NativeNativeError.message("This PDF exceeds the 500-page local processing limit.")
        }
        if op == "pdf-metadata-viewer" || op == "pdf-metadata-tool" { let info:[String:Any] = ["pages":pdf.pageCount,"title":pdf.documentAttributes?[PDFDocumentAttribute.titleAttribute] as? String ?? "","author":pdf.documentAttributes?[PDFDocumentAttribute.authorAttribute] as? String ?? ""]; let data=try JSONSerialization.data(withJSONObject:info,options:.prettyPrinted); return Result(String(decoding:data,as:UTF8.self),nil,"application/json","json") }
        if op == "pdf-text-extractor" { return Result((0..<pdf.pageCount).compactMap{pdf.page(at:$0)?.string}.joined(separator:"\n\n")+"\n",nil,"text/plain","txt") }
        if op == "pdf-rotator" { for i in 0..<pdf.pageCount { if let page = pdf.page(at: i) { page.rotation = (page.rotation + 90) % 360 } }; return Result(nil,pdf.dataRepresentation(),"application/pdf","pdf") }
        let out=PDFDocument(); let indexes = op == "pdf-page-extractor" || op == "pdf-splitter" ? [0] : Array(0..<pdf.pageCount); for i in indexes { if let page=pdf.page(at:i) { out.insert(page,at:out.pageCount) } }; return Result(nil,out.dataRepresentation(),"application/pdf","pdf")
    }
    private static func image(_ op: String, _ data: Data) throws -> Result {
        if op == "png-to-svg" {
            guard let image = UIImage(data: data), let cgImage = image.cgImage else {
                throw NativeNativeError.message("Selected file is not a supported PNG image.")
            }
            let base64 = data.base64EncodedString()
            let width = String(cgImage.width)
            let height = String(cgImage.height)
            let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + width + "\" height=\"" + height + "\" viewBox=\"0 0 " + width + " " + height + "\"><image href=\"data:image/png;base64," + base64 + "\" width=\"100%\" height=\"100%\"/></svg>"
            return Result(svg, nil, "image/svg+xml", "svg")
        }
        guard let image = UIImage(data: data) else {
            throw NativeNativeError.message("Selected file is not a supported image.")
        }
        if op.hasSuffix("png") {
            guard let encoded = image.pngData() else { throw NativeNativeError.message("Could not encode PNG.") }
            return Result(nil, encoded, "image/png", "png")
        }
        if op.hasSuffix("webp") {
            guard let cgImage = image.cgImage, let encoded = webpData(cgImage) else {
                throw NativeNativeError.message("Could not encode WebP on this iOS version.")
            }
            return Result(nil, encoded, "image/webp", "webp")
        }
        guard let encoded = image.jpegData(compressionQuality: 0.92) else {
            throw NativeNativeError.message("Could not encode JPEG.")
        }
        return Result(nil, encoded, "image/jpeg", "jpg")
    }
    private static func parseCsv(_ text: String, separator: Character = ",") -> [[String]] {
        var rows = [[String]]()
        var row = [String]()
        var cell = ""
        var quoted = false
        let chars = Array(text)
        let quote = Character(UnicodeScalar(34)!)
        let lineFeed = Character(UnicodeScalar(10)!)
        let carriageReturn = Character(UnicodeScalar(13)!)
        var i = 0
        while i < chars.count {
            let character = chars[i]
            if character == quote {
                if quoted && i + 1 < chars.count && chars[i + 1] == quote {
                    cell.append(quote)
                    i += 1
                } else {
                    quoted.toggle()
                }
            } else if character == separator && !quoted {
                row.append(cell)
                cell = ""
            } else if (character == lineFeed || character == carriageReturn) && !quoted {
                if character == carriageReturn && i + 1 < chars.count && chars[i + 1] == lineFeed { i += 1 }
                row.append(cell)
                cell = ""
                if row.contains(where: { !$0.trimmingCharacters(in: .whitespaces).isEmpty }) { rows.append(row) }
                row = []
            } else {
                cell.append(character)
            }
            i += 1
        }
        if !cell.isEmpty || !row.isEmpty {
            row.append(cell)
            if row.contains(where: { !$0.trimmingCharacters(in: .whitespaces).isEmpty }) { rows.append(row) }
        }
        return rows
    }
    private static func csvEscape(_ v:String)->String { v.contains(where:{[",","\n","\r","\""].contains($0)}) ? "\"\(v.replacingOccurrences(of:"\"",with:"\"\""))\"" : v }
    private static func rowsToCsv(_ rows:[[String]],separator:String=",")->String { rows.map{$0.map(csvEscape).joined(separator:separator)}.joined(separator:"\r\n")+"\r\n" }
    private static func csvToJson(_ text:String)throws->String { let rows=parseCsv(text);guard !rows.isEmpty else{return "[]"};let heads=rows[0].enumerated().map{$0.element.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty ? "column_\($0.offset+1)" : $0.element};let objects=rows.dropFirst().map{r in Dictionary(uniqueKeysWithValues:heads.enumerated().map{($0.element,r.indices.contains($0.offset) ? r[$0.offset] : "")})};let d=try JSONSerialization.data(withJSONObject:objects,options:.prettyPrinted);return String(decoding:d,as:UTF8.self) }
    private static func jsonRows(_ text: String) throws -> [[String]] {
        let value = try JSONSerialization.jsonObject(with: Data(text.utf8))
        let objects = value as? [[String: Any]] ?? [value as? [String: Any] ?? [:]]
        var keys = [String]()
        for object in objects {
            for key in object.keys where !keys.contains(key) { keys.append(key) }
        }
        let rows = objects.map { object in
            keys.map { key -> String in
                guard let value = object[key], !(value is NSNull) else { return "" }
                if value is [String: Any] || value is [Any],
                   let data = try? JSONSerialization.data(withJSONObject: value),
                   let nested = String(data: data, encoding: .utf8) { return nested }
                return String(describing: value)
            }
        }
        return [keys] + rows
    }
    private static func xmlToJson(_ text:String)throws->String { guard let m=text.range(of:#"<([A-Za-z_][\w.-]*)[^>]*>([\s\S]*)</\1>"#,options:.regularExpression) else{throw NativeNativeError.message("Invalid XML.")};let raw=String(text[m]);let tag=raw.replacingOccurrences(of:#"^<([^ >]+).*$"#,with:"$1",options:.regularExpression);let body=raw.replacingOccurrences(of:#"^<[^>]+>|</[^>]+>$"#,with:"",options:.regularExpression).replacingOccurrences(of:#"<[^>]+>"#,with:"",options:.regularExpression).trimmingCharacters(in:.whitespacesAndNewlines);let d=try JSONSerialization.data(withJSONObject:[tag:body],options:.prettyPrinted);return String(decoding:d,as:UTF8.self) }
    private static func objectToXml(_ v:Any,tag:String="root")->String { if let o=v as? [String:Any]{return "<\(tag)>"+o.map{objectToXml($0.value,tag:$0.key.replacingOccurrences(of:#"[^A-Za-z0-9_.-]"#,with:"_",options:.regularExpression))}.joined()+"</\(tag)>"};return "<\(tag)>\(xmlEscape(String(describing:v)))</\(tag)>" }
    private static func xmlEscape(_ s:String)->String{s.replacingOccurrences(of:"&",with:"&amp;").replacingOccurrences(of:"<",with:"&lt;").replacingOccurrences(of:">",with:"&gt;").replacingOccurrences(of:"\"",with:"&quot;")}
    private static func simpleYaml(_ text: String) -> [String: Any] {
        var result = [String: Any]()
        let quotes = CharacterSet(charactersIn: String(UnicodeScalar(34)!) + "'")
        for line in text.split(whereSeparator: \.isNewline) {
            let parts = line.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
            guard parts.count == 2 else { continue }
            let key = String(parts[0]).trimmingCharacters(in: .whitespaces)
            let value = String(parts[1]).trimmingCharacters(in: .whitespaces)
            if value == "true" { result[key] = true }
            else if value == "false" { result[key] = false }
            else if value == "null" { result[key] = NSNull() }
            else if let number = Double(value) { result[key] = number }
            else { result[key] = value.trimmingCharacters(in: quotes) }
        }
        return result
    }
    private static func jsonToYaml(_ v:Any,indent:String="")->String { if let o=v as? [String:Any]{return o.map{ "\(indent)\($0.key): \(jsonToYaml($0.value,indent:indent+"  ").trimmingCharacters(in:.newlines))"}.joined(separator:"\n")};if let s=v as? String{return "\"\(s)\""};return String(describing:v) }
    private static func markdownToHtml(_ text:String)->String { var out="<!doctype html>\n<html><head><meta charset=\"utf-8\"><title>Converted document</title></head><body>\n";for l in text.split(separator:"\n",omittingEmptySubsequences:false){let s=String(l);if s.hasPrefix("### "){out += "<h3>\(htmlEscape(String(s.dropFirst(4))))</h3>\n"}else if s.hasPrefix("## "){out += "<h2>\(htmlEscape(String(s.dropFirst(3))))</h2>\n"}else if s.hasPrefix("# "){out += "<h1>\(htmlEscape(String(s.dropFirst(2))))</h1>\n"}else if s.hasPrefix("- "){out += "<li>\(htmlEscape(String(s.dropFirst(2))))</li>\n"}else if s.isEmpty{out += "\n"}else{out += "<p>\(htmlEscape(s))</p>\n"}};return out+"</body></html>\n" }
    private static func htmlToMarkdown(_ text:String)->String{text.replacingOccurrences(of:#"<script[\s\S]*?</script>"#,with:"",options:.regularExpression).replacingOccurrences(of:#"<style[\s\S]*?</style>"#,with:"",options:.regularExpression).replacingOccurrences(of:#"<h1[^>]*>(.*?)</h1>"#,with:"# $1\n\n",options:[.regularExpression,.caseInsensitive]).replacingOccurrences(of:#"<h2[^>]*>(.*?)</h2>"#,with:"## $1\n\n",options:[.regularExpression,.caseInsensitive]).replacingOccurrences(of:#"<h3[^>]*>(.*?)</h3>"#,with:"### $1\n\n",options:[.regularExpression,.caseInsensitive]).replacingOccurrences(of:#"<strong[^>]*>(.*?)</strong>"#,with:"**$1**",options:[.regularExpression,.caseInsensitive]).replacingOccurrences(of:#"<li[^>]*>(.*?)</li>"#,with:"- $1\n",options:[.regularExpression,.caseInsensitive]).replacingOccurrences(of:#"<p[^>]*>(.*?)</p>"#,with:"$1\n\n",options:[.regularExpression,.caseInsensitive]).replacingOccurrences(of:#"<[^>]+>"#,with:"",options:.regularExpression).trimmingCharacters(in:.whitespacesAndNewlines)}
    private static func htmlEscape(_ s:String)->String{s.replacingOccurrences(of:"&",with:"&amp;").replacingOccurrences(of:"<",with:"&lt;").replacingOccurrences(of:">",with:"&gt;")}
    private static func webpData(_ image:CGImage)->Data? { guard #available(iOS 14.0, *),let data=CFDataCreateMutable(nil,0),let destination=CGImageDestinationCreateWithData(data,UTType.webP.identifier as CFString,1,nil) else{return nil};CGImageDestinationAddImage(destination,image,[kCGImageDestinationLossyCompressionQuality:0.92] as CFDictionary);guard CGImageDestinationFinalize(destination) else{return nil};return data as Data }
}
private extension Data { var utf8String:String { String(decoding:self,as:UTF8.self) } }
