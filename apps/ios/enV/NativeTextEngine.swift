import Foundation
#if canImport(FoundationXML)
import FoundationXML
#endif
import NaturalLanguage

public struct TextStatistics: Equatable {
    public let words: Int, characters: Int, charactersWithoutSpaces: Int, sentences: Int, paragraphs: Int, lines: Int, readingMinutes: Int
}
public struct NativeTextResult: Equatable {
    public let output: String, statistics: TextStatistics?, added: Int, removed: Int, unchanged: Int
    public init(output: String, statistics: TextStatistics? = nil, added: Int = 0, removed: Int = 0, unchanged: Int = 0) { self.output=output; self.statistics=statistics; self.added=added; self.removed=removed; self.unchanged=unchanged }
}
public enum NativeTextError: LocalizedError {
    case unknownOperation, invalidJSON, invalidYAML, emptyCSV, invalidXML, xmlInputTooLarge, unsafeXMLDoctype
    public var errorDescription: String? { switch self { case .unknownOperation: return "Unknown text operation."; case .invalidJSON: return "Invalid JSON"; case .invalidYAML: return "Invalid YAML"; case .emptyCSV: return "Empty CSV"; case .invalidXML: return "Invalid XML"; case .xmlInputTooLarge: return "XML input exceeds the 1 MB local formatting limit."; case .unsafeXMLDoctype: return "XML DOCTYPE declarations are disabled in the local formatter to prevent external entity access." } }
}


private final class NativeXMLNode {
    enum Kind { case document, element, text, cdata, comment, instruction }
    let kind: Kind
    var name = ""
    var data = ""
    var attributes: [String:String] = [:]
    var children: [NativeXMLNode] = []
    init(_ kind: Kind) { self.kind = kind }
}

/** Native Foundation XMLParser delegate. It builds a bounded, local document tree for serialization. */
private final class NativeXMLFormattingDelegate: NSObject, XMLParserDelegate {
    let document = NativeXMLNode(.document)
    var parseError: Error?
    private var stack: [NativeXMLNode] = []
    override init() { stack = [document]; super.init() }
    private func addText(_ value: String, kind: NativeXMLNode.Kind = .text) {
        guard !value.isEmpty, let parent = stack.last else { return }
        if kind == .text, let last = parent.children.last, last.kind == .text { last.data += value; return }
        let node = NativeXMLNode(kind); node.data = value; parent.children.append(node)
    }
    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String:String]) {
        let node = NativeXMLNode(.element); node.name = qName ?? elementName; node.attributes = attributeDict
        stack.last?.children.append(node); stack.append(node)
    }
    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        if stack.count > 1 { stack.removeLast() }
    }
    func parser(_ parser: XMLParser, foundCharacters string: String) { addText(string) }
    func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) {
        addText(String(data: CDATABlock, encoding: .utf8) ?? String(decoding: CDATABlock, as: UTF8.self), kind: .cdata)
    }
    func parser(_ parser: XMLParser, foundComment comment: String) { addText(comment, kind: .comment) }
    func parser(_ parser: XMLParser, foundProcessingInstructionWithTarget target: String, data: String?) {
        let node = NativeXMLNode(.instruction); node.name = target; node.data = data ?? ""; stack.last?.children.append(node)
    }
    func parser(_ parser: XMLParser, parseErrorOccurred parseError: Error) { self.parseError = parseError }
    func parser(_ parser: XMLParser, validationErrorOccurred validationError: Error) { /* Validation is intentionally off; well-formedness is enforced by XMLParser. */ }
}

public enum NativeTextEngine {
    public static let supportedToolIDs = ["css-formatter","css-minifier","html-formatter","html-minifier","javascript-formatter","javascript-minifier","sql-formatter","xml-formatter","yaml-formatter","css-minifier-advanced","json-to-xml","json-to-yaml","xml-to-json","yaml-to-json","keyword-density-calculator","camel-case-converter","character-counter","extract-emails","extract-urls","find-and-replace","kebab-case-converter","list-generator","lowercase-converter","paragraph-counter","reading-time-calculator","remove-duplicate-lines","remove-spaces","remove-line-breaks","reverse-text","sentence-case-converter","sentence-counter","slug-generator","snake-case-converter","sort-lines","text-diff","title-case-converter","uppercase-converter","word-counter","word-frequency","wrap-text"]
    private static let operations: [String:String] = ["css-formatter":"css-format","css-minifier":"css-minify","html-formatter":"html-format","html-minifier":"html-minify","javascript-formatter":"js-format","javascript-minifier":"js-minify","sql-formatter":"sql-format","xml-formatter":"xml-format","yaml-formatter":"yaml-format","css-minifier-advanced":"json-to-csv","json-to-xml":"json-to-xml","json-to-yaml":"json-to-yaml","xml-to-json":"xml-to-json","yaml-to-json":"yaml-to-json","keyword-density-calculator":"keyword-density","camel-case-converter":"camel-case","character-counter":"word-counter","extract-emails":"extract-emails","extract-urls":"extract-urls","find-and-replace":"find-replace","kebab-case-converter":"kebab-case","list-generator":"list","lowercase-converter":"lowercase","paragraph-counter":"word-counter","reading-time-calculator":"word-counter","remove-duplicate-lines":"dedupe-lines","remove-spaces":"trim-spaces","remove-line-breaks":"unwrap","reverse-text":"reverse","sentence-case-converter":"sentence-case","sentence-counter":"word-counter","slug-generator":"slug","snake-case-converter":"snake-case","sort-lines":"sort-lines","text-diff":"text-diff","title-case-converter":"title-case","uppercase-converter":"uppercase","word-counter":"word-counter","word-frequency":"word-freq","wrap-text":"wrap"]
    private static let smallWords = Set(["a","an","the","and","or","of","in","on","to"])
    public static func operation(forToolID id: String) -> String? { operations[id] }

    public static func statistics(_ input: String, wpm: String = "200") -> TextStatistics {
        let words = wordTokens(input).count
        let chars = input.unicodeScalars.count
        let noSpaces = regexReplace(input, "\\s", "").unicodeScalars.count
        let sentences = sentenceCount(input)
        let paragraphs = regexReplace(input, "\\r?\\n", "\n").components(separatedBy: "\n\n").filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.count
        let lines = input.isEmpty ? 0 : input.components(separatedBy: "\n").count
        let speed = max(1, Int(Double(wpm) ?? 200)); let seconds = words == 0 ? 0 : Int(ceil(Double(words) / Double(speed) * 60))
        return TextStatistics(words: words, characters: chars, charactersWithoutSpaces: noSpaces, sentences: sentences, paragraphs: paragraphs, lines: lines, readingMinutes: seconds == 0 ? 0 : max(1, Int(ceil(Double(seconds) / 60))))
    }
    public static func run(toolID: String, input: String, compare: String = "", options: [String:String] = [:]) throws -> NativeTextResult {
        guard let op=operations[toolID] else { throw NativeTextError.unknownOperation }
        if ["word-counter","character-counter","sentence-counter","paragraph-counter","reading-time-calculator"].contains(toolID) {
            let s=statistics(input,wpm:options["wpm"] ?? "200"); let out=input.isEmpty ? "" : "Words: \(s.words)\nCharacters: \(s.characters)\nCharacters without spaces: \(s.charactersWithoutSpaces)\nSentences: \(s.sentences)\nParagraphs: \(s.paragraphs)\nLines: \(s.lines)\nReading time: \(s.readingMinutes == 0 ? "0 min" : "\(s.readingMinutes) min")"; return NativeTextResult(output:out,statistics:s)
        }
        if op == "text-diff" { return diff(input,compare) }
        return NativeTextResult(output: try transform(op,input,options))
    }
    private static func wordTokens(_ input:String)->[String] {
        let tokenizer = NLTokenizer(unit: .word)
        tokenizer.string = input
        return tokenizer.tokens(for: input.startIndex..<input.endIndex).compactMap { range in
            let token = String(input[range])
            return token.contains(where: { $0.isLetter || $0.isNumber }) ? token : nil
        }
    }
    private static func sentenceCount(_ input:String)->Int { let m=regexMatches(input,"[^.!?。！？]+[.!?。！？]+(?=\\s|$)|[^.!?。！？]+$"); return m.filter{!$0.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty}.count }
    private static func splitWords(_ input:String)->[String] { input.replacingOccurrences(of:"['’]",with:"",options:.regularExpression).split{ !$0.isASCII || !($0.isLetter || $0.isNumber) }.map(String.init).filter{!$0.isEmpty} }
    private static func regexMatches(_ input:String,_ pattern:String,options:NSRegularExpression.Options=[])->[String] { guard let r=try? NSRegularExpression(pattern:pattern,options:options) else{return []}; return r.matches(in:input,range:NSRange(input.startIndex...,in:input)).compactMap{Range($0.range,in:input).map{String(input[$0])}} }
    private static func regexReplace(_ input:String,_ pattern:String,_ replacement:String,options:NSRegularExpression.Options=[])->String { guard let r=try? NSRegularExpression(pattern:pattern,options:options) else{return input}; return r.stringByReplacingMatches(in:input,range:NSRange(input.startIndex...,in:input),withTemplate:replacement) }
    private static func capitalize(_ w:String)->String { w.isEmpty ? w : String(w.prefix(1)).uppercased()+String(w.dropFirst()).lowercased() }
    private static func titleCase(_ input:String)->String { var n=0; let tokens=regexMatches(input,"[A-Za-z0-9]+"); let last=tokens.count-1; return replaceMatches(input,"[A-Za-z0-9]+") { m in defer{n+=1}; let bare=m.lowercased(); if n != 0 && n != last && smallWords.contains(bare) { return m.lowercased() }; return capitalize(m) } }
    private static func sentenceCase(_ input:String)->String { let lower=input.lowercased(); return replaceMatches(lower,"(^\\s*[a-z])|([.!?]\\s+[a-z])"){$0.uppercased()} }
    private static func replaceMatches(_ input:String,_ pattern:String,_ body:(String)->String)->String { guard let r=try? NSRegularExpression(pattern:pattern) else{return input}; let ms=r.matches(in:input,range:NSRange(input.startIndex...,in:input)); var out="", pos=input.startIndex; for m in ms { guard let rr=Range(m.range,in:input) else{continue}; out += input[pos..<rr.lowerBound] + body(String(input[rr])); pos=rr.upperBound }; return out+input[pos...] }
    private static func caseWords(_ input:String,_ sep:String,_ camel:Bool=false)->String { splitWords(input).enumerated().map{camel && $0.offset>0 ? capitalize($0.element) : $0.element.lowercased()}.joined(separator:sep) }
    private static func slug(_ input:String)->String { let s=input.folding(options:[.diacriticInsensitive,.widthInsensitive],locale:Locale(identifier:"en_US")).lowercased(); return String(regexReplace(s,"[^a-z0-9]+","-").trimmingCharacters(in:CharacterSet(charactersIn:"-")).prefix(120)) }

    private static func transform(_ op:String,_ input:String,_ o:[String:String]) throws -> String {
        switch op {
        case "uppercase": return input.uppercased(); case "lowercase": return input.lowercased(); case "title-case": return titleCase(input); case "sentence-case": return sentenceCase(input)
        case "camel-case": return caseWords(input,"",true); case "snake-case": return caseWords(input,"_"); case "kebab-case": return caseWords(input,"-"); case "slug": return slug(input); case "reverse": return String(input.reversed())
        case "trim-spaces": return regexReplace(regexReplace(input,"[ \\t]+"," ")," *\\n *","\n").trimmingCharacters(in:.whitespacesAndNewlines)
        case "unwrap": return regexReplace(regexReplace(input,"[ \\t]*\\n[ \\t]*"," ")," +"," ").trimmingCharacters(in:.whitespacesAndNewlines)
        case "sort-lines": var a=input.components(separatedBy:"\n"); let t=a.last==""; if t{a.removeLast()}; a.sort{$0.localizedStandardCompare($1) == .orderedAscending}; return a.joined(separator:"\n")+(t ? "\n":"")
        case "dedupe-lines": var seen=Set<String>(); return input.components(separatedBy:"\n").filter{seen.insert($0).inserted}.joined(separator:"\n")
        case "find-replace": return findReplace(input,o); case "wrap": return wrap(input,max(8,Int(Double(o["width"] ?? "80") ?? 80))); case "word-freq": return wordFrequency(input)
        case "extract-emails": return uniqueMatches(input,"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"); case "extract-urls": return uniqueMatches(input,"https?://[^\\s<>\"'`]+",options:[.caseInsensitive]); case "list": return listify(input,o["style"] ?? "bullets")
        case "sql-format": return formatSQL(input, dialectRaw: o["dialect"] ?? "postgresql"); case "html-format": return markup(input); case "xml-format": return try xmlFormat(input); case "css-format": return cssFormat(input); case "js-format": return jsFormat(input); case "yaml-format": return yamlFormat(input)
        case "html-minify": return regexReplace(regexReplace(regexReplace(input,"<!--[\\s\\S]*?-->",""),">\\s+<"," ><"),"\\s+"," ").replacingOccurrences(of:" ><",with:"><").trimmingCharacters(in:.whitespacesAndNewlines)
        case "css-minify": return regexReplace(regexReplace(regexReplace(regexReplace(input,"/\\*[\\s\\S]*?\\*/",""),"\\s+"," "),"\\s*([{};:,>~+])\\s*","$1"),";}","}").trimmingCharacters(in:.whitespacesAndNewlines)
        case "js-minify": return jsMinify(input); case "json-to-csv": return try jsonToCSV(input); case "json-to-yaml": return try jsonToYAML(input); case "yaml-to-json": return try yamlToJSON(input); case "json-to-xml": return try jsonToXML(input); case "xml-to-json": return try xmlToJSON(input); case "keyword-density": return keywordDensity(input,o["keyword"] ?? "")
        default: throw NativeTextError.unknownOperation
        }
    }
    private static func findReplace(_ input:String,_ o:[String:String])->String { let f=o["find"] ?? ""; guard !f.isEmpty else{return input}; var flags:NSRegularExpression.Options=[]; if (o["flags"] ?? "g").contains("i"){flags.insert(.caseInsensitive)}; if let r=try? NSRegularExpression(pattern:f,options:flags){return r.stringByReplacingMatches(in:input,range:NSRange(input.startIndex...,in:input),withTemplate:o["replace"] ?? "")}; return input.replacingOccurrences(of:f,with:o["replace"] ?? "") }
    private static func wrap(_ input:String,_ width:Int)->String { input.components(separatedBy:"\n").map{p in guard !p.trimmingCharacters(in:.whitespaces).isEmpty else{return p}; var lines=[String](),cur=""; for w in p.split(whereSeparator:{$0.isWhitespace}).map(String.init){if cur.isEmpty{cur=w}else if cur.count+1+w.count<=width{cur += " "+w}else{lines.append(cur);cur=w}}; if !cur.isEmpty{lines.append(cur)}; return lines.joined(separator:"\n")}.joined(separator:"\n") }
    private static func wordFrequency(_ input:String)->String { var c=[String:Int](); for w in regexMatches(input.lowercased(),"[a-z0-9]+(?:'[a-z0-9]+)?"){c[w,default:0]+=1}; return c.keys.sorted{c[$0]!>c[$1]! || (c[$0]==c[$1] && $0<$1)}.map{"\($0)\t\(c[$0]!)"}.joined(separator:"\n") }
    private static func uniqueMatches(_ input:String,_ pattern:String,options:NSRegularExpression.Options=[])->String { var seen=Set<String>(),out=[String](); for s in regexMatches(input,pattern,options:options){let v=regexReplace(s,"[),.;]+$","");if seen.insert(v).inserted{out.append(v)}};return out.joined(separator:"\n") }
    private static func listify(_ input:String,_ style:String)->String { let items=input.replacingOccurrences(of:"\r\n",with:"\n").split{ $0=="," || $0=="\n" }.map{$0.trimmingCharacters(in:.whitespacesAndNewlines)}.filter{!$0.isEmpty}; if style=="numbered"{return items.enumerated().map{"\($0.offset+1). \($0.element)"}.joined(separator:"\n")};if style=="comma"{return items.joined(separator:", ")};return items.map{"- \($0)"}.joined(separator:"\n") }

    /// Conservative dialect-aware lexical formatter shared by all native SQL routes.
    /// It protects literals, quoted identifiers and comments. It is not a complete SQL parser.
    static func formatSQL(_ input:String, dialectRaw:String = "postgresql")->String {
        let dialect = dialectRaw.lowercased().replacingOccurrences(of:"-", with:"_")
        let supported = Set(["sql","postgresql","postgres","mysql","mariadb","sqlite","transactsql","tsql","bigquery","snowflake","oracle","redshift","duckdb"])
        guard supported.contains(dialect) else { return "Unsupported SQL dialect '\(dialectRaw)'. Supported: \(supported.sorted().joined(separator: ", "))." }
        guard input.utf8.count <= 1_000_000 else { return "SQL input exceeds the local 1 MB formatting limit." }
        var protected:[String:String]=[:], masked="", chars=Array(input), i=0
        func key()->String { "\u{E000}SQL\(protected.count)\u{E001}" }
        while i < chars.count {
            let c=chars[i]
            let mysqlHashComment = (dialect == "mysql" || dialect == "mariadb") && c == "#"
            if (c=="-" && i+1<chars.count && chars[i+1]=="-") || (c=="/" && i+1<chars.count && chars[i+1]=="*") || mysqlHashComment {
                let start=i
                if c=="-" || mysqlHashComment { i += c == "-" ? 2 : 1; while i<chars.count && chars[i] != "\n" {i+=1}; if i<chars.count {i+=1} }
                else { i+=2; var closed=false; while i+1<chars.count {if chars[i]=="*" && chars[i+1]=="/" {i+=2;closed=true;break};i+=1};guard closed else{return "SQL formatter found an unterminated block comment."} }
                let token=key(); protected[token]=String(chars[start..<i]); masked+=token; continue
            }
            if (dialect == "postgresql" || dialect == "postgres" || dialect == "redshift" || dialect == "duckdb") && c == "$" {
                var tagEnd=i+1; while tagEnd<chars.count && (chars[tagEnd].isLetter || chars[tagEnd].isNumber || chars[tagEnd]=="_") {tagEnd+=1}
                if tagEnd<chars.count && chars[tagEnd]=="$" {
                    let tag=String(chars[i...tagEnd]), start=i; i=tagEnd+1; var close = -1, j=i
                    while j+tag.count<=chars.count { if String(chars[j..<j+tag.count]) == tag {close=j;break}; j+=1 }
                    guard close>=0 else{return "SQL formatter found an unterminated dollar-quoted string."}
                    i=close+tag.count; let token=key(); protected[token]=String(chars[start..<i]); masked+=token; continue
                }
            }
            if c=="'" || c=="\"" || c=="`" || c=="[" {
                let start=i, close:Character = c=="[" ? "]" : c; i+=1; var closed=false
                while i<chars.count { if chars[i]==close {if close != "]" && i+1<chars.count && chars[i+1]==close {i+=2;continue};i+=1;closed=true;break}; if c=="'" && chars[i]=="\\" && i+1<chars.count {i+=1};i+=1 }
                guard closed else{return "SQL formatter found an unterminated quoted value or identifier."}
                let token=key();protected[token]=String(chars[start..<i]);masked+=token;continue
            }
            masked.append(c);i+=1
        }
        let tokens = regexMatches(masked, #"\uE000SQL\d+\uE001|[A-Za-z_][A-Za-z0-9_$]*|(?:<=|>=|<>|!=|==|::|->>|->|\|\||&&|\?\?|:=)|[,.;()]|[^\s]"#)
        if tokens.isEmpty {return ""}
        let major=Set(["WITH","RECURSIVE","SELECT","FROM","WHERE","GROUP BY","ORDER BY","HAVING","LIMIT","OFFSET","FETCH FIRST","INSERT INTO","UPDATE","DELETE FROM","VALUES","UNION","UNION ALL","INTERSECT","EXCEPT","RETURNING","QUALIFY","WINDOW","PARTITION BY","CREATE TABLE","ALTER TABLE","DROP TABLE"])
        let joins=Set(["JOIN","LEFT JOIN","RIGHT JOIN","INNER JOIN","FULL JOIN","LEFT OUTER JOIN","RIGHT OUTER JOIN","FULL OUTER JOIN","CROSS JOIN"])
        var out=[String](), depth=0, line="", previous=""
        func emit(){let v=line.trimmingCharacters(in:.whitespacesAndNewlines);if !v.isEmpty {out.append(String(repeating:"  ",count:max(0,depth))+v)};line=""}
        func append(_ value:String,_ space:Bool=true){if space && !line.isEmpty && !line.last!.isWhitespace && !"(.".contains(line.last!) && !(value.first.map{",;).".contains($0)} ?? false) {line += " "};line += value}
        var index=0
        while index<tokens.count {
            let value=tokens[index], upper=value.uppercased(); var phrase=upper, consumed=1
            if index+1<tokens.count {let two="\(upper) \(tokens[index+1].uppercased())";if major.contains(two)||joins.contains(two){phrase=two;consumed=2}else if index+2<tokens.count && ["LEFT OUTER JOIN","RIGHT OUTER JOIN","FULL OUTER JOIN"].contains("\(two) \(tokens[index+2].uppercased())"){phrase="\(two) \(tokens[index+2].uppercased())";consumed=3}}
            let reservedToken=value.hasPrefix("\u{E000}SQL")
            if !reservedToken && (major.contains(phrase)||joins.contains(phrase)||["ON","AND","OR"].contains(upper)) {emit();depth = joins.contains(phrase)||["ON","AND","OR"].contains(upper) ? max(1,depth) : 0;line=phrase;index+=consumed;previous=phrase;continue}
            switch value {case "(":append(value,["IN","VALUES","EXISTS","NOT"].contains(previous.uppercased()));depth+=1
            case ")":depth=max(0,depth-1);line=line.trimmingCharacters(in:.whitespacesAndNewlines)+")"
            case ",":line=line.trimmingCharacters(in:.whitespacesAndNewlines)+","
            case ".":line=line.trimmingCharacters(in:.whitespacesAndNewlines)+"."
            case ";":line=line.trimmingCharacters(in:.whitespacesAndNewlines)+";";emit();depth=0
            default:append(value);if let original=protected[value],original.hasPrefix("--") || original.hasPrefix("#") {emit()}}
            previous=value;index+=1
        }
        emit()
        let formatted=out.joined(separator:"\n").replacingOccurrences(of:#",\s*"#,with:",\n  ",options:.regularExpression)
        var restored=formatted
        for (token,value) in protected {restored=restored.replacingOccurrences(of:token,with:value)}
        return restored.trimmingCharacters(in:.whitespacesAndNewlines)
    }

    /** Secure native XML parser + formatter. External DTDs are rejected; data never leaves the app. */
    private static func xmlFormat(_ input: String) throws -> String {
        guard !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw NativeTextError.invalidXML }
        guard input.utf8.count <= 1_000_000 else { throw NativeTextError.xmlInputTooLarge }
        guard input.range(of: "<!DOCTYPE", options: .caseInsensitive) == nil else { throw NativeTextError.unsafeXMLDoctype }
        let parser = XMLParser(data: Data(input.utf8))
        parser.shouldProcessNamespaces = false
        parser.shouldResolveExternalEntities = false
        let delegate = NativeXMLFormattingDelegate()
        parser.delegate = delegate
        let parsed = parser.parse()
        guard parsed, delegate.parseError == nil else { throw NativeTextError.invalidXML }

        func escapeText(_ value: String) -> String {
            value.replacingOccurrences(of: "&", with: "&amp;")
                .replacingOccurrences(of: "<", with: "&lt;")
                .replacingOccurrences(of: ">", with: "&gt;")
        }
        func escapeAttribute(_ value: String) -> String {
            escapeText(value).replacingOccurrences(of: "\"", with: "&quot;")
                .replacingOccurrences(of: "\r", with: "&#13;").replacingOccurrences(of: "\n", with: "&#10;").replacingOccurrences(of: "\t", with: "&#9;")
        }
        func render(_ node: NativeXMLNode, depth: Int, inheritedSpace: Bool = false, inline: Bool = false) -> String {
            let indent = inline ? "" : String(repeating: "  ", count: max(0, depth))
            switch node.kind {
            case .document:
                return node.children.filter { !($0.kind == .text && $0.data.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
                    .map { render($0, depth: depth, inheritedSpace: inheritedSpace, inline: false) }.joined(separator: "\n")
            case .text: return indent + escapeText(node.data)
            case .cdata: return indent + "<![CDATA[\(node.data)]]>"
            case .comment: return indent + "<!--\(node.data)-->"
            case .instruction: return indent + "<?\(node.name)\(node.data.isEmpty ? "" : " \(node.data)")?>"
            case .element:
                let preserveSpace = inheritedSpace || node.attributes["xml:space"] == "preserve"
                let attrs = node.attributes.keys.sorted().map { " \($0)=\"\(escapeAttribute(node.attributes[$0] ?? ""))\"" }.joined()
                let start = "<\(node.name)\(attrs)"
                if node.children.isEmpty { return indent + start + "/>" }
                let hasElement = node.children.contains { $0.kind == .element }
                let hasMeaningfulText = node.children.contains { $0.kind == .text && !$0.data.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
                if hasElement && !hasMeaningfulText && !preserveSpace {
                    let blockChildren = node.children.filter { !($0.kind == .text && $0.data.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
                    let body = blockChildren.map { render($0, depth: depth + 1, inheritedSpace: preserveSpace, inline: false) }.joined(separator: "\n")
                    return indent + start + ">\n\(body)\n\(indent)</\(node.name)>"
                }
                let body = node.children.map { render($0, depth: depth + 1, inheritedSpace: preserveSpace, inline: true) }.joined()
                return indent + start + ">\(body)</\(node.name)>"
            }
        }
        let declaration = input.range(of: "^\\s*(<\\?xml\\s+[^?]*\\?>)", options: .regularExpression).map { String(input[$0]).trimmingCharacters(in: .whitespacesAndNewlines) }
        let body = render(delegate.document, depth: 0)
        let result = ([declaration].compactMap { $0 } + [body]).filter { !$0.isEmpty }.joined(separator: "\n")
        guard !result.isEmpty else { throw NativeTextError.invalidXML }
        return result
    }

    private static func markup(_ input:String)->String { let compact=regexReplace(input,">\\s+<", "><"); let tokens=regexReplace(compact,"(<[^>]+>)","\n$1\n").components(separatedBy:"\n").map{$0.trimmingCharacters(in:.whitespacesAndNewlines)}.filter{!$0.isEmpty}; let voids=Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);var d=0,out=[String]();for t in tokens{let close=t.hasPrefix("</");let open=t.hasPrefix("<") && !close && !t.hasPrefix("<?") && !t.hasPrefix("<!") && !t.hasSuffix("/>");let name=regexReplace(t,"^</?([^\\s>/]+).*","$1").lowercased();if close{d=max(0,d-1)};out.append(String(repeating:"  ",count:d)+t);if open && !voids.contains(name){d += 1}};return out.joined(separator:"\n") }
    private static func cssFormat(_ input:String)->String { var d=0,out=[String](),buf="";let src=regexReplace(regexReplace(input,"/\\*[\\s\\S]*?\\*/",""),"\\s+"," ").trimmingCharacters(in:.whitespacesAndNewlines);func flush(_ x:String){let t=x.trimmingCharacters(in:.whitespaces);if !t.isEmpty{out.append(String(repeating:"  ",count:max(0,d))+t)}};for ch in src{if ch=="{"{flush(buf+" {");buf="";d+=1}else if ch=="}"{if !buf.trimmingCharacters(in:.whitespaces).isEmpty{flush(buf.hasSuffix(";") ? buf : buf+";")};buf="";d=max(0,d-1);out.append(String(repeating:"  ",count:d)+"}")}else if ch==";"{flush(buf.trimmingCharacters(in:.whitespaces)+";");buf=""}else{buf.append(ch)}};if !buf.trimmingCharacters(in:.whitespaces).isEmpty{flush(buf)};return out.joined(separator:"\n") }
    private static func jsFormat(_ input:String)->String {
        typealias Token=(text:String,kind:String)
        var tokens:[Token]=[], chars=Array(input), i=0
        let operators=["===","!==",">>>","=>","??=","??","?.","&&","||","**","==","!=","<=",">=","++","--","+=","-=","*=","/=","...","**=","<<",">>"]
        func isWordStart(_ c:Character)->Bool { c.isLetter || c=="_" || c=="$" }
        func isWordPart(_ c:Character)->Bool { c.isLetter || c.isNumber || c=="_" || c=="$" }
        while i<chars.count {
            let c=chars[i]
            if c.isWhitespace {i+=1;continue}
            if c=="/" && i+1<chars.count && chars[i+1]=="/" {let start=i;i+=2;while i<chars.count && chars[i] != "\n" {i+=1};tokens.append((String(chars[start..<i]),"comment"));continue}
            if c=="/" && i+1<chars.count && chars[i+1]=="*" {let start=i;i+=2;var closed=false;while i+1<chars.count {if chars[i]=="*" && chars[i+1]=="/" {i+=2;closed=true;break};i+=1};guard closed else{return "JavaScript formatter found an unterminated block comment."};tokens.append((String(chars[start..<i]),"comment"));continue}
            if c=="'" || c=="\"" || c=="`" {let start=i;i+=1;var closed=false;while i<chars.count {if chars[i]=="\\" {i=min(chars.count,i+2);continue};if chars[i]==c {i+=1;closed=true;break};i+=1};guard closed else{return "JavaScript formatter found an unterminated string or template literal."};tokens.append((String(chars[start..<i]),"literal"));continue}
            if isWordStart(c) || c.isNumber {let start=i;i+=1;while i<chars.count && isWordPart(chars[i]) {i+=1};tokens.append((String(chars[start..<i]),"word"));continue}
            if let op=operators.first(where:{op in i+op.count<=chars.count && String(chars[i..<i+op.count])==op}) {tokens.append((op,"operator"));i+=op.count;continue}
            tokens.append((String(c),"punct"));i+=1
        }
        guard !tokens.isEmpty else{return "Paste JavaScript or TypeScript code to format."}
        var out:[String]=[], line="", depth=0, parenDepth=0, lineDepth=0
        func emit(){let value=line.trimmingCharacters(in:.whitespaces);if !value.isEmpty {out.append(String(repeating:"  ",count:max(0,lineDepth))+value)};line="";lineDepth=depth}
        func append(_ value:String,_ space:Bool=false){if line.isEmpty && !value.isEmpty {lineDepth=depth};if space && !line.isEmpty && !line.last!.isWhitespace && !".([".contains(line.last!) && (value.first.map{!",;)]}".contains($0)} ?? true) {line+=" "};line+=value}
        func prev(_ index:Int)->String { index>0 ? tokens[index-1].text : "" }
        func next(_ index:Int)->String { index+1<tokens.count ? tokens[index+1].text : "" }
        for index in tokens.indices {
            let token=tokens[index], value=token.text, before=prev(index), after=next(index)
            if token.kind=="comment" {if !line.trimmingCharacters(in:.whitespaces).isEmpty {emit()};append(value);emit();continue}
            switch value {
            case "{": append("{",!line.trimmingCharacters(in:.whitespaces).isEmpty && !".([".contains(line.last ?? " "));depth+=1;emit()
            case "}": if !line.trimmingCharacters(in:.whitespaces).isEmpty {emit()};depth=max(0,depth-1);append("}");if ![";",",",")","]",".","(","["].contains(after){emit()}
            case "(": append("(",["if","for","while","switch","catch","with","function"].contains(before));parenDepth+=1
            case ")": line=line.trimmingCharacters(in:.whitespaces)+")";parenDepth=max(0,parenDepth-1)
            case "[": append("[")
            case "]": line=line.trimmingCharacters(in:.whitespaces)+"]"
            case ".","?.": line=line.trimmingCharacters(in:.whitespaces)+value
            case ",": line=line.trimmingCharacters(in:.whitespaces)+",";emit()
            case ";": line=line.trimmingCharacters(in:.whitespaces)+";";if parenDepth==0 {emit()}
            case ":": line=line.trimmingCharacters(in:.whitespaces)+":";append("",true)
            default:
                if token.kind=="operator" || ["=","+","-","*","/","%","<",">","!","&","|","?"].contains(value) {if ["++","--","!","~","..."].contains(value){append(value)}else{append(value,true);append("",true)}}
                else {let prior=index>0 ? tokens[index-1] : nil;let previousWord=prior.map{$0.kind=="word" || $0.kind=="literal"} ?? false;let wordLike=token.kind=="word" || token.kind=="literal";append(value,!line.isEmpty && (previousWord || ["return","throw","new","await","yield","typeof","delete","void","instanceof","in","of","else","async"].contains(before) || (before==")" && wordLike)))}
            }
        }
        emit();let result=out.joined(separator:"\n").trimmingCharacters(in:.whitespacesAndNewlines);guard !result.isEmpty else{return "Formatter produced no output. Check that the source is not empty."}
        return result+"\n\nNote: conservative local formatter. It preserves strings/comments and formats common blocks, calls, literals, and operators; it is not a full ECMAScript parser."
    }
    private static func yamlFormat(_ input:String)->String { input.components(separatedBy:"\n").map{$0.replacingOccurrences(of:"\t",with:"  ").trimmingCharacters(in:.whitespaces)}.joined(separator:"\n").replacingOccurrences(of:"\n{3,}",with:"\n\n",options:.regularExpression).trimmingCharacters(in:.whitespacesAndNewlines) }
    private static func jsMinify(_ input:String)->String {
        var out="", i=input.startIndex, quote:Character?=nil, line=false, block=false
        while i<input.endIndex {
            let c=input[i], nextIndex=input.index(after:i), n=nextIndex<input.endIndex ? input[nextIndex] : "\0"
            if line { if c=="\n" { line=false }; i=nextIndex; continue }
            if block { if c=="*" && n=="/" { i=input.index(after:nextIndex); block=false } else { i=nextIndex }; continue }
            if let q=quote { out.append(c); if c=="\\" && nextIndex<input.endIndex { out.append(input[nextIndex]); i=input.index(after:nextIndex); continue }; if c==q { quote=nil }; i=nextIndex; continue }
            if c=="/" && n=="/" { line=true; i=input.index(after:nextIndex); continue }
            if c=="/" && n=="*" { block=true; i=input.index(after:nextIndex); continue }
            if c=="'" || c=="\"" || c=="`" { quote=c; out.append(c); i=nextIndex; continue }
            if c.isWhitespace { let prev=out.last ?? "\0"; if (prev.isLetter || prev.isNumber || prev=="_" || prev=="$") && (n.isLetter || n.isNumber || n=="_" || n=="$") { out.append(" ") }; i=nextIndex; continue }
            out.append(c); i=nextIndex
        }
        return out.trimmingCharacters(in:.whitespacesAndNewlines)
    }
    private static func jsonObject(_ input:String)throws->Any { guard let d=input.trimmingCharacters(in:.whitespacesAndNewlines).data(using:.utf8),let v=try? JSONSerialization.jsonObject(with:d,options:[.fragmentsAllowed]) else{throw NativeTextError.invalidJSON};return v }
    private static func jsonData(_ v:Any,_ pretty:Bool=true)throws->String { let options:JSONSerialization.WritingOptions = pretty ? [.prettyPrinted,.fragmentsAllowed] : [.fragmentsAllowed]; guard let d=try? JSONSerialization.data(withJSONObject:v,options:options),let s=String(data:d,encoding:.utf8) else{throw NativeTextError.invalidJSON};return s }
    private static func csvEscape(_ v:String)->String { (v.contains(",")||v.contains("\n")||v.contains("\r")||v.contains("\"")) ? "\""+v.replacingOccurrences(of:"\"",with:"\"\"")+"\"" : v }
    private static func jsonToCSV(_ input: String) throws -> String {
        let data = try jsonObject(input)
        let rows = (data as? [Any]) ?? [data]
        guard !rows.isEmpty else { throw NativeTextError.emptyCSV }

        var objects: [[String: Any]] = []
        for row in rows {
            if let object = row as? [String: Any] { objects.append(object) }
            else { objects.append(["value": row]) }
        }
        var keys: [String] = []
        for object in objects {
            for key in object.keys where !keys.contains(key) { keys.append(key) }
        }
        func csvValue(_ value: Any?) -> String {
            guard let value, !(value is NSNull) else { return "" }
            if let object = value as? [String: Any],
               let data = try? JSONSerialization.data(withJSONObject: object, options: [.fragmentsAllowed]),
               let string = String(data: data, encoding: .utf8) { return csvEscape(string) }
            if let array = value as? [Any],
               let data = try? JSONSerialization.data(withJSONObject: array, options: [.fragmentsAllowed]),
               let string = String(data: data, encoding: .utf8) { return csvEscape(string) }
            return csvEscape(String(describing: value))
        }
        let header = keys.map(csvEscape).joined(separator: ",")
        let records = objects.map { object in keys.map { csvValue(object[$0]) }.joined(separator: ",") }
        return ([header] + records).joined(separator: "\n")
    }
    private static func yamlScalar(_ x:Any)->String { if x is NSNull{return "null"};if let s=x as? String{if s.isEmpty || s.range(of:"[:#\n&*?|>!%@`'\"{},\\[\\]]",options:.regularExpression) != nil || s != s.trimmingCharacters(in:.whitespaces){return "\""+s.replacingOccurrences(of:"\"",with:"\\\"")+"\""};return s};return String(describing:x) }
    private static func toYAML(_ value: Any, _ depth: Int = 0) -> String {
        let indent = String(repeating: "  ", count: depth)
        if let array = value as? [Any] {
            if array.isEmpty { return "[]" }
            return array.map { item -> String in
                if item is [String: Any] || item is [Any] {
                    let nested = toYAML(item, depth + 1)
                    let parts = nested.components(separatedBy: "\n")
                    guard let first = parts.first else { return "\(indent)-" }
                    return "\(indent)- \(first)" + parts.dropFirst().map { "\n\($0)" }.joined()
                }
                return "\(indent)- \(yamlScalar(item))"
            }.joined(separator: "\n")
        }
        if let object = value as? [String: Any] {
            if object.isEmpty { return "{}" }
            return object.keys.sorted().map { key -> String in
                let safeKey = regexMatches(key, "^[A-Za-z_][\\w-]*$").isEmpty ? "\"\(key)\"" : key
                guard let child = object[key] else { return "\(indent)\(safeKey): null" }
                if child is [String: Any] || child is [Any] {
                    let nested = toYAML(child, depth + 1)
                    if nested == "{}" || nested == "[]" { return "\(indent)\(safeKey): \(nested)" }
                    return "\(indent)\(safeKey):\n\(nested)"
                }
                return "\(indent)\(safeKey): \(yamlScalar(child))"
            }.joined(separator: "\n")
        }
        return yamlScalar(value)
    }
    private static func jsonToYAML(_ input:String)throws->String { return toYAML(try jsonObject(input)).trimmingCharacters(in:.whitespacesAndNewlines) }
    private static func yamlValue(_ s:String)->Any { let t=s.trimmingCharacters(in:.whitespaces);if t.isEmpty || t=="~" || t=="null"{return NSNull()};if t=="true"{return true};if t=="false"{return false};if let n=Double(t){return n};if (t.hasPrefix("\"")&&t.hasSuffix("\""))||(t.hasPrefix("'")&&t.hasSuffix("'")){return String(t.dropFirst().dropLast())};return t }
    private static func yamlToJSON(_ input:String)throws->String { let lines=input.replacingOccurrences(of:"\t",with:"  ").components(separatedBy:"\n").filter{let t=$0.trimmingCharacters(in:.whitespaces);return !t.isEmpty && !t.hasPrefix("#")};var root=[String:Any]();for line in lines{let t=line.trimmingCharacters(in:.whitespaces);guard let i=t.firstIndex(of:":") else{continue};let k=String(t[..<i]).trimmingCharacters(in:.whitespaces);let v=String(t[t.index(after:i)...]).trimmingCharacters(in:.whitespaces);root[k]=yamlValue(v)};return try jsonData(root) }
    private static func xmlEscape(_ s:String)->String{s.replacingOccurrences(of:"&",with:"&amp;").replacingOccurrences(of:"<",with:"&lt;").replacingOccurrences(of:">",with:"&gt;")}
    private static func jsonToXML(_ input:String)throws->String { let data=try jsonObject(input);func emit(_ x:Any,_ tag:String="root")->String{if x is NSNull{return "<\(tag) />"};if let a=x as? [Any]{return a.map{emit($0,tag=="root" ? "item":tag)}.joined()};if let o=x as? [String:Any]{return "<\(tag)>"+o.map{emit($0.value,$0.key.replacingOccurrences(of:"[^\\w:-]",with:"_",options:.regularExpression))}.joined()+"</\(tag)>"};return "<\(tag)>\(xmlEscape(String(describing:x)))</\(tag)>"};return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"+markup(emit(data)) }
    private static func xmlToJSON(_ input:String)throws->String { let text=input.trimmingCharacters(in:.whitespacesAndNewlines);guard !text.isEmpty else{throw NativeTextError.invalidXML};func parse(_ s:String)->Any{var obj=[String:Any]();let pattern="<([A-Za-z_][\\w:.-]*)([^>]*)>([\\s\\S]*?)</\\1>|<([A-Za-z_][\\w:.-]*)[^>]*/>";for m in regexMatches(s,pattern){let key=regexReplace(m,"^<([A-Za-z_][\\w:.-]*).*$","$1");let inner=regexReplace(m,"^<[^>]+>|</[^>]+>$","");let value=inner==m ? NSNull() : (regexMatches(inner,"<").isEmpty ? inner : parse(inner));if let old=obj[key]{if var a=old as? [Any]{a.append(value);obj[key]=a}else{obj[key]=[old,value]}}else{obj[key]=value}};return obj};return try jsonData(parse(regexReplace(text,"<\\?[\\s\\S]*?\\?>",""))) }
    private static func keywordDensity(_ input:String,_ keyword:String)->String { let words=regexMatches(input.lowercased(),"[a-z0-9']+");if keyword.trimmingCharacters(in:.whitespaces).isEmpty{var c=[String:Int]();for w in words{c[w,default:0]+=1};return c.keys.sorted{c[$0]!>c[$1]!}.prefix(40).map{"\($0)\t\(c[$0]!)\t\(String(format:"%.2f",locale:Locale(identifier:"en_US_POSIX"),Double(c[$0]!)/Double(max(1,words.count))*100))%"}.joined(separator:"\n")};let k=keyword.lowercased().split(whereSeparator:{$0.isWhitespace}).joined(separator:" ");let count=words.joined(separator:" ").components(separatedBy:k).count-1;let d=Double(count)/Double(max(1,words.count))*100;return "keyword\t\(k)\ncount\t\(count)\nwords\t\(words.count)\ndensity\t\(String(format:"%.3f",locale:Locale(identifier:"en_US_POSIX"),d))%" }
    private static func diff(_ a:String,_ b:String)->NativeTextResult {let l=a.components(separatedBy:"\n"),r=b.components(separatedBy:"\n");var dp=Array(repeating:Array(repeating:0,count:r.count+1),count:l.count+1);if !l.isEmpty && !r.isEmpty{for i in stride(from:l.count-1,through:0,by:-1){for j in stride(from:r.count-1,through:0,by:-1){dp[i][j]=l[i]==r[j] ? dp[i+1][j+1]+1 : max(dp[i+1][j],dp[i][j+1])}}};var i=0,j=0,add=0,rem=0,same=0,out=[String]();while i<l.count && j<r.count{if l[i]==r[j]{out.append("  "+l[i]);same+=1;i+=1;j+=1}else if dp[i+1][j]>=dp[i][j+1]{out.append("- "+l[i]);rem+=1;i+=1}else{out.append("+ "+r[j]);add+=1;j+=1}};while i<l.count{out.append("- "+l[i]);rem+=1;i+=1};while j<r.count{out.append("+ "+r[j]);add+=1;j+=1};return NativeTextResult(output:out.joined(separator:"\n"),added:add,removed:rem,unchanged:same)}
}
