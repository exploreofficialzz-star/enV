import Foundation
import NaturalLanguage

public struct TextStatistics: Equatable {
    public let words: Int, characters: Int, charactersWithoutSpaces: Int, sentences: Int, paragraphs: Int, lines: Int, readingMinutes: Int
}
public struct NativeTextResult: Equatable {
    public let output: String, statistics: TextStatistics?, added: Int, removed: Int, unchanged: Int
    public init(output: String, statistics: TextStatistics? = nil, added: Int = 0, removed: Int = 0, unchanged: Int = 0) { self.output=output; self.statistics=statistics; self.added=added; self.removed=removed; self.unchanged=unchanged }
}
public enum NativeTextError: LocalizedError {
    case unknownOperation, invalidJSON, invalidYAML, emptyCSV, invalidXML
    public var errorDescription: String? { switch self { case .unknownOperation: return "Unknown text operation."; case .invalidJSON: return "Invalid JSON"; case .invalidYAML: return "Invalid YAML"; case .emptyCSV: return "Empty CSV"; case .invalidXML: return "Invalid XML" } }
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
        case "sql-format": return sqlFormat(input); case "html-format","xml-format": return markup(input); case "css-format": return cssFormat(input); case "js-format": return jsFormat(input); case "yaml-format": return yamlFormat(input)
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

    private static func sqlFormat(_ input:String)->String { let compact=regexReplace(input,"\\s+"," ").trimmingCharacters(in:.whitespacesAndNewlines);guard !compact.isEmpty else{return ""}; let p="\\b(SELECT|FROM|WHERE|AND|OR|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|INSERT INTO|VALUES|UPDATE|SET|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE|UNION ALL|UNION)\\b"; var s=replaceMatches(compact,p){$0.uppercased()}; s=replaceMatches(s,p){"\n"+$0}; return s.replacingOccurrences(of:", ",with:",\n  ").trimmingCharacters(in:.whitespacesAndNewlines) }
    private static func markup(_ input:String)->String { let compact=regexReplace(input,">\\s+<", "><"); let tokens=regexReplace(compact,"(<[^>]+>)","\n$1\n").components(separatedBy:"\n").map{$0.trimmingCharacters(in:.whitespacesAndNewlines)}.filter{!$0.isEmpty}; let voids=Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);var d=0,out=[String]();for t in tokens{let close=t.hasPrefix("</");let open=t.hasPrefix("<") && !close && !t.hasPrefix("<?") && !t.hasPrefix("<!") && !t.hasSuffix("/>");let name=regexReplace(t,"^</?([^\\s>/]+).*","$1").lowercased();if close{d=max(0,d-1)};out.append(String(repeating:"  ",count:d)+t);if open && !voids.contains(name){d += 1}};return out.joined(separator:"\n") }
    private static func cssFormat(_ input:String)->String { var d=0,out=[String](),buf="";let src=regexReplace(regexReplace(input,"/\\*[\\s\\S]*?\\*/",""),"\\s+"," ").trimmingCharacters(in:.whitespacesAndNewlines);func flush(_ x:String){let t=x.trimmingCharacters(in:.whitespaces);if !t.isEmpty{out.append(String(repeating:"  ",count:max(0,d))+t)}};for ch in src{if ch=="{"{flush(buf+" {");buf="";d+=1}else if ch=="}"{if !buf.trimmingCharacters(in:.whitespaces).isEmpty{flush(buf.hasSuffix(";") ? buf : buf+";")};buf="";d=max(0,d-1);out.append(String(repeating:"  ",count:d)+"}")}else if ch==";"{flush(buf.trimmingCharacters(in:.whitespaces)+";");buf=""}else{buf.append(ch)}};if !buf.trimmingCharacters(in:.whitespaces).isEmpty{flush(buf)};return out.joined(separator:"\n") }
    private static func jsFormat(_ input:String)->String { var d=0,out="",quote:Character?=nil,line=false,block=false;var i=input.startIndex;while i<input.endIndex{let c=input[i],n=input.index(after:i)<input.endIndex ? input[input.index(after:i)] : "\0";if line{out.append(c);if c=="\n"{line=false};i=input.index(after:i);continue};if block{out.append(c);if c=="*" && n=="/"{out.append(n);i=input.index(i,offsetBy:2);block=false}else{i=input.index(after:i)};continue};if let q=quote{out.append(c);if c=="\\" && i != input.index(before:input.endIndex){let j=input.index(after:i);out.append(input[j]);i=input.index(after:j);continue};if c==q{quote=nil};i=input.index(after:i);continue};if c=="/" && n=="/"{line=true;out.append(c);i=input.index(after:i);continue};if c=="/" && n=="*"{block=true;out.append(c);i=input.index(after:i);continue};if c=="'" || c=="\"" || c=="`"{quote=c;out.append(c)}else if c=="{"{out += " {\n";d+=1;out += String(repeating:"  ",count:d)}else if c=="}"{d=max(0,d-1);out=out.trimmingCharacters(in:.whitespacesAndNewlines);out += "\n"+String(repeating:"  ",count:d)+"}";if n==";"{out.append(";");i=input.index(after:i)}}else if c==";"{out += ";\n"+String(repeating:"  ",count:d)}else{out.append(c)};i=input.index(after:i)};return regexReplace(regexReplace(out,"[ \\t]+\\n","\n"),"\\n{3,}","\n\n").trimmingCharacters(in:.whitespacesAndNewlines) }
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
