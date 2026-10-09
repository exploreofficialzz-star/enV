import Foundation
import UIKit
import ImageIO
import UniformTypeIdentifiers

enum NativeFileConverterEngine {
    struct Result { let text:String?; let data:Data?; let mime:String; let ext:String }
    private static let imageOps:Set<String> = ["jpg-to-png","png-to-jpg","png-to-webp","webp-to-png","jpg-to-webp","webp-to-jpg","png-to-svg"]
    static func operation(_ tool:Tool)->String { tool.engine.configuration["op"].flatMap { if case .string(let v) = $0 { return v }; return nil } ?? tool.engine.op ?? tool.id }
    static func supports(_ tool:Tool)->Bool { tool.engine.type == "file-converter" && (imageOps.contains(operation(tool)) || ["csv-to-json","json-to-csv","csv-to-tsv","tsv-to-csv","xml-to-json","json-to-xml","yaml-to-json","json-to-yaml","txt-to-csv","csv-to-txt","markdown-to-html","html-to-markdown"].contains(operation(tool))) }
    static func run(_ tool:Tool,file:NativeBackendFile)throws->Result {
        let op=operation(tool); if imageOps.contains(op) { return try image(op,file.data) }
        let input=String(decoding:file.data,as:UTF8.self)
        switch op {
        case "csv-to-json": return Result(try csvToJson(input),nil,"application/json","json")
        case "json-to-csv": return Result(rowsToCsv(try jsonRows(input)),nil,"text/csv","csv")
        case "csv-to-tsv": return Result(rowsToCsv(parseCsv(input),separator:"\t"),nil,"text/tab-separated-values","tsv")
        case "tsv-to-csv": return Result(rowsToCsv(parseCsv(input,separator:"\t")),nil,"text/csv","csv")
        case "xml-to-json": return Result(try xmlToJson(input),nil,"application/json","json")
        case "json-to-xml": return Result("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"+try objectToXml(JSONSerialization.jsonObject(with:Data(input.utf8))),nil,"application/xml","xml")
        case "yaml-to-json": return Result(try JSONSerialization.data(withJSONObject:simpleYaml(input),options:.prettyPrinted).utf8String,nil,"application/json","json")
        case "json-to-yaml": return Result(jsonToYaml(try JSONSerialization.jsonObject(with:Data(input.utf8)))+"\n",nil,"text/yaml","yaml")
        case "txt-to-csv": return Result(rowsToCsv(input.split(whereSeparator:\.isNewline).map{[String($0)]}),nil,"text/csv","csv")
        case "csv-to-txt": return Result(parseCsv(input).map{$0.joined(separator:" ")}.joined(separator:"\n")+"\n",nil,"text/plain","txt")
        case "markdown-to-html": return Result(markdownToHtml(input),nil,"text/html","html")
        case "html-to-markdown": return Result(htmlToMarkdown(input)+"\n",nil,"text/markdown","md")
        default: throw NativeNativeError.message("Unsupported file conversion: \(op)")
        }
    }
    private static func image(_ op:String,_ data:Data)throws->Result {
        if op == "png-to-svg" { guard let image=UIImage(data:data) else{throw NativeNativeError.message("Selected file is not a supported PNG image.")}; let b64=data.base64EncodedString(); let w=Int(image.size.width),h=Int(image.size.height); return Result("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"\(w)\" height=\"\(h)\" viewBox=\"0 0 \(w) \(h)\"><image href=\"data:image/png;base64,\(b64)\" width=\"100%\" height=\"100%\"/></svg>",nil,"image/svg+xml","svg") }
        guard let image=UIImage(data:data) else{throw NativeNativeError.message("Selected file is not a supported image.")}
        if op.hasSuffix("png") { guard let d=image.pngData() else{throw NativeNativeError.message("Could not encode PNG.")}; return Result(nil,d,"image/png","png") }
        if op.hasSuffix("webp") { guard let cg=image.cgImage,let d=webpData(cg) else{throw NativeNativeError.message("Could not encode WebP on this iOS version.")}; return Result(nil,d,"image/webp","webp") }
        guard let d=image.jpegData(compressionQuality:0.92) else{throw NativeNativeError.message("Could not encode JPEG.")}; return Result(nil,d,"image/jpeg","jpg")
    }
    private static func parseCsv(_ text:String,separator:Character=",")->[[String]] { var rows=[[String]](),row=[String](),cell="",quoted=false;var chars=Array(text);var i=0;while i<chars.count{let c=chars[i];if c=="\""{if quoted&&i+1<chars.count&&chars[i+1]=="\""{cell.append("\"");i+=1}else{quoted.toggle()}}else if c==separator&&!quoted{row.append(cell);cell=""}else if (c=="\n"||c=="\r")&&!quoted{if c=="\r"&&i+1<chars.count&&chars[i+1]=="\n"{i+=1};row.append(cell);cell="";if row.contains(where:{$0.trimmingCharacters(in:.whitespaces).isEmpty==false}){rows.append(row)};row=[]}else{cell.append(c)};i+=1};if !cell.isEmpty||!row.isEmpty{row.append(cell);if row.contains(where:{$0.trimmingCharacters(in:.whitespaces).isEmpty==false}){rows.append(row)}};return rows }
    private static func csvEscape(_ v:String)->String { v.contains(where:{[",","\n","\r","\""].contains($0)}) ? "\"\(v.replacingOccurrences(of:"\"",with:"\"\""))\"" : v }
    private static func rowsToCsv(_ rows:[[String]],separator:String=",")->String { rows.map{$0.map(csvEscape).joined(separator:separator)}.joined(separator:"\r\n")+"\r\n" }
    private static func csvToJson(_ text:String)throws->String { let rows=parseCsv(text);guard !rows.isEmpty else{return "[]"};let heads=rows[0].enumerated().map{$0.element.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty ? "column_\($0.offset+1)" : $0.element};let objects=rows.dropFirst().map{r in Dictionary(uniqueKeysWithValues:heads.enumerated().map{($0.element,r.indices.contains($0.offset) ? r[$0.offset] : "")})};let d=try JSONSerialization.data(withJSONObject:objects,options:.prettyPrinted);return String(decoding:d,as:UTF8.self) }
    private static func jsonRows(_ text:String)throws->[[String]] { let value=try JSONSerialization.jsonObject(with:Data(text.utf8));let arr=value as? [[String:Any]] ?? [value as? [String:Any] ?? [:]];let keys=arr.flatMap{$0.keys}.reduce(into:[String]()){if !$0.contains($1){$0.append($1)}};return [keys]+arr.map{keys.map{key in let v=$0[key];if let d=v as? [String:Any],let data=try? JSONSerialization.data(withJSONObject:d),let s=String(data:data,encoding:.utf8){return s};return v.map(String.init(describing:)) ?? ""}}
    }
    private static func xmlToJson(_ text:String)throws->String { guard let m=text.range(of:#"<([A-Za-z_][\w.-]*)[^>]*>([\s\S]*)</\1>"#,options:.regularExpression) else{throw NativeNativeError.message("Invalid XML.")};let raw=String(text[m]);let tag=raw.replacingOccurrences(of:#"^<([^ >]+).*$"#,with:"$1",options:.regularExpression);let body=raw.replacingOccurrences(of:#"^<[^>]+>|</[^>]+>$"#,with:"",options:.regularExpression).replacingOccurrences(of:#"<[^>]+>"#,with:"",options:.regularExpression).trimmingCharacters(in:.whitespacesAndNewlines);let d=try JSONSerialization.data(withJSONObject:[tag:body],options:.prettyPrinted);return String(decoding:d,as:UTF8.self) }
    private static func objectToXml(_ v:Any,tag:String="root")->String { if let o=v as? [String:Any]{return "<\(tag)>"+o.map{objectToXml($0.value,tag:$0.key.replacingOccurrences(of:#"[^A-Za-z0-9_.-]"#,with:"_",options:.regularExpression))}.joined()+"</\(tag)>"};return "<\(tag)>\(xmlEscape(String(describing:v)))</\(tag)>" }
    private static func xmlEscape(_ s:String)->String{s.replacingOccurrences(of:"&",with:"&amp;").replacingOccurrences(of:"<",with:"&lt;").replacingOccurrences(of:">",with:"&gt;").replacingOccurrences(of:"\"",with:"&quot;")}
    private static func simpleYaml(_ text:String)->[String:Any]{Dictionary(uniqueKeysWithValues:text.split(separator:"\n").compactMap{line in let p=line.split(separator:":",maxSplits:1).map(String.init);guard p.count==2 else{return nil};let v=p[1].trimmingCharacters(in:.whitespaces);if v=="true"{return(p[0],true)};if v=="false"{return(p[0],false)};if let n=Double(v){return(p[0],n)};return(p[0],v.trimmingCharacters(in:"\""))})}
    private static func jsonToYaml(_ v:Any,indent:String="")->String { if let o=v as? [String:Any]{return o.map{ "\(indent)\($0.key): \(jsonToYaml($0.value,indent:indent+"  ").trimmingCharacters(in:.newlines))"}.joined(separator:"\n")};if let s=v as? String{return "\"\(s)\""};return String(describing:v) }
    private static func markdownToHtml(_ text:String)->String { var out="<!doctype html>\n<html><head><meta charset=\"utf-8\"><title>Converted document</title></head><body>\n";for l in text.split(separator:"\n",omittingEmptySubsequences:false){let s=String(l);if s.hasPrefix("### "){out += "<h3>\(htmlEscape(String(s.dropFirst(4))))</h3>\n"}else if s.hasPrefix("## "){out += "<h2>\(htmlEscape(String(s.dropFirst(3))))</h2>\n"}else if s.hasPrefix("# "){out += "<h1>\(htmlEscape(String(s.dropFirst(2))))</h1>\n"}else if s.hasPrefix("- "){out += "<li>\(htmlEscape(String(s.dropFirst(2))))</li>\n"}else if s.isEmpty{out += "\n"}else{out += "<p>\(htmlEscape(s))</p>\n"}};return out+"</body></html>\n" }
    private static func htmlToMarkdown(_ text:String)->String{text.replacingOccurrences(of:#"<script[\s\S]*?</script>"#,with:"",options:.regularExpression).replacingOccurrences(of:#"<style[\s\S]*?</style>"#,with:"",options:.regularExpression).replacingOccurrences(of:#"<h1[^>]*>(.*?)</h1>"#,with:"# $1\n\n",options:[.regularExpression,.caseInsensitive]).replacingOccurrences(of:#"<h2[^>]*>(.*?)</h2>"#,with:"## $1\n\n",options:[.regularExpression,.caseInsensitive]).replacingOccurrences(of:#"<h3[^>]*>(.*?)</h3>"#,with:"### $1\n\n",options:[.regularExpression,.caseInsensitive]).replacingOccurrences(of:#"<strong[^>]*>(.*?)</strong>"#,with:"**$1**",options:[.regularExpression,.caseInsensitive]).replacingOccurrences(of:#"<li[^>]*>(.*?)</li>"#,with:"- $1\n",options:[.regularExpression,.caseInsensitive]).replacingOccurrences(of:#"<p[^>]*>(.*?)</p>"#,with:"$1\n\n",options:[.regularExpression,.caseInsensitive]).replacingOccurrences(of:#"<[^>]+>"#,with:"",options:.regularExpression).trimmingCharacters(in:.whitespacesAndNewlines)}
    private static func htmlEscape(_ s:String)->String{s.replacingOccurrences(of:"&",with:"&amp;").replacingOccurrences(of:"<",with:"&lt;").replacingOccurrences(of:">",with:"&gt;")}
    private static func webpData(_ image:CGImage)->Data? { guard #available(iOS 14.0, *),let data=CFDataCreateMutable(nil,0),let destination=CGImageDestinationCreateWithData(data,UTType.webP.identifier as CFString,1,nil) else{return nil};CGImageDestinationAddImage(destination,image,[kCGImageDestinationLossyCompressionQuality:0.92] as CFDictionary);guard CGImageDestinationFinalize(destination) else{return nil};return data as Data }
}
private extension Data { var utf8String:String { String(decoding:self,as:UTF8.self) } }
