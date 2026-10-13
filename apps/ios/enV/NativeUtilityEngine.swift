import Foundation
import CryptoKit
import CoreFoundation

/// Native Swift counterpart of the web generator/network/SEO/CSS utility engines.
/// The catalog engine.op is the source of truth for dispatch.
enum NativeUtilityEngine {
    struct Output {
        let text: String
        let filename: String
    }

    private static let generatorOps: Set<String> = [
        "baby-generator","baby-list-generator","baby-name-generator","baby-picker","baby-randomizer","baby-wheel",
        "character-generator","character-list-generator","character-picker","character-randomizer","character-wheel",
        "city-generator","city-list-generator","city-picker","city-randomizer","city-wheel",
        "coin-flip","color-list-generator","color-randomizer","color-wheel","country-generator","country-list-generator","country-picker","country-randomizer","country-wheel",
        "date-generator","date-list-generator","date-picker","date-randomizer","date-wheel",
        "decision-generator","decision-list-generator","decision-picker","decision-randomizer","decision-wheel","dice-roller",
        "dummy-csv","dummy-json","dummy-products","dummy-sql","dummy-users","emoji-generator","emoji-list-generator","emoji-picker","emoji-randomizer","emoji-wheel",
        "fantasy-generator","fantasy-list-generator","fantasy-name-generator","fantasy-picker","fantasy-randomizer","fantasy-wheel",
        "gamer-generator","gamer-list-generator","gamer-name-generator","gamer-picker","gamer-randomizer","gamer-wheel",
        "group-generator","group-list-generator","group-picker","group-randomizer","group-wheel",
        "hashtags","lorem","name-generator","name-list-generator","name-picker","name-randomizer","name-wheel","nickname-generator",
        "number-generator","number-list-generator","number-picker","number-randomizer","number-wheel","passphrase",
        "pet-generator","pet-list-generator","pet-name-generator","pet-picker","pet-randomizer","pet-wheel","plot-generator",
        "random-city-generator","random-color-generator","random-country-generator","random-date-generator","random-decision","random-hex","random-name-generator","random-number-generator","random-string","random-username-generator","random-word-generator",
        "secret-santa-generator","secret-santa-list-generator","secret-santa-picker","secret-santa-randomizer","secret-santa-wheel","secure-token",
        "story-generator","story-list-generator","story-picker","story-prompt-generator","story-randomizer","story-wheel",
        "team-generator","team-list-generator","team-picker","team-randomizer","team-wheel",
        "test-address","test-email","test-names","test-phone",
        "time-generator","time-list-generator","time-picker","time-randomizer","time-wheel",
        "username","username-list-generator","username-picker","username-randomizer","username-wheel","uuid-list","wheel",
        "word-generator","word-list-generator","word-picker","word-randomizer","word-wheel","writing-prompt-generator","yes-no-generator"
    ]
    private static let networkOps: Set<String> = ["basic-auth-header","bearer-header","cidr-calculator","connection-info","content-type-reference","header-format","header-parser","http-method-reference","http-status-reference","ipv4-binary","ipv4-broadcast-address","ipv4-calculator","ipv4-decimal","ipv4-host-count","ipv4-host-range","ipv4-mask-from-prefix","ipv4-network-address","ipv4-prefix-from-mask","ipv4-split-subnets","ipv4-subnet-count","ipv4-wildcard-mask","ipv6-address-type","ipv6-binary","ipv6-compress","ipv6-expand","ipv6-subnet-calculator","localhost-url-builder","port-lookup","port-reference","subnet-calculator","url-decode","url-encode","url-origin","url-path-analyzer","url-query-builder","url-query-parser","websocket-url-builder"]
    private static let seoOps: Set<String> = ["canonical","description-length","headings","hreflang","jsonld-validator","llms-txt","manifest","meta","og","redirect","robots","robots-meta","robots-test","schema","serp","sitemap","sitemap-validator","title-length","twitter-card","utm"]
    private static let cssFamilies: Set<String> = ["avatar","badge","blob","border","button","card","glass","gradient","input","neomorph","noise","pattern","shadow","wave"]

    private static let adj = ["bright","calm","clever","crisp","fair","gentle","keen","lucky","noble","quick","rapid","silent","solar","steady","swift","vivid","wild","zen","amber","coral"]
    private static let noun = ["harbor","nexus","pebble","ridge","cedar","atlas","ember","willow","quartz","meadow","orbit","lantern","harbor","finch","cinder","grove","marble","pine","river","summit"]
    private static let first = ["Amina","Jonah","Priya","Luca","Mei","Omar","Sofia","Noah","Elena","Kai","Hana","Diego","Leila","Mateo","Iris","Samir","Freya","Arjun","Nora","Theo"]
    private static let last = ["Okoye","Berg","Nakamura","Silva","Kowalski","Hassan","Nguyen","Patel","Costa","Ibrahim","Novak","Andersen","Garcia","Rahman","Petrov"]
    private static let cities = ["Lisbon","Nairobi","Osaka","Recife","Bergen","Hanoi","Accra","Valparaíso","Kraków","Muscat","Durban","Tbilisi","Cusco","Tallinn","Busan"]
    private static let countries = ["Japan","Kenya","Portugal","Canada","Brazil","Norway","Ghana","Chile","Poland","Oman","Georgia","Peru","Estonia","South Korea","Morocco"]
    private static let words = ["anchor","bramble","canvas","drift","echo","fjord","glimmer","harvest","inlet","jasper","kettle","lagoon","mirror","nectar","olive","plover","quarry","ripple","saffron","timber"]
    private static let fantasy = ["Aerindel","Brynth","Caelora","Dravok","Elyndra","Faelith","Grommak","Hyral","Ithriel","Jorvask"]
    private static let pets = ["Miso","Pebble","Nimbus","Fig","Clover","Sable","Pip","Maple"]
    private static let roles = ["explorer","inventor","guardian","scholar","rogue"]
    private static let emojis = ["😀","😂","😍","🤔","🔥","🎉","🚀","❤️","⭐","🌍","🎵","🎮","🍕","☀️","🌈"]
    private static let suffixes = ["iel","or","eth","an","is"]
    private static let storyActions = ["return","protect","invent","abandon"]
    private static let storyDeadlines = ["dawn","winter","the tide","the trial"]
    private static let lorem = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus. Suspendisse lectus tortor, dignissim sit amet, adipiscing nec, ultricies sed, dolor."
    private static let ports: [Int:String] = [20:"FTP data",21:"FTP control",22:"SSH",23:"Telnet",25:"SMTP",53:"DNS",67:"DHCP server",68:"DHCP client",80:"HTTP",110:"POP3",123:"NTP",143:"IMAP",161:"SNMP",194:"IRC",389:"LDAP",443:"HTTPS",445:"SMB",465:"SMTPS",587:"SMTP submission",636:"LDAPS",993:"IMAPS",995:"POP3S",1433:"MS SQL Server",1521:"Oracle",2049:"NFS",2375:"Docker",2376:"Docker TLS",3000:"Development HTTP",3306:"MySQL",3389:"RDP",5432:"PostgreSQL",5672:"AMQP",6379:"Redis",8080:"HTTP alternate",8443:"HTTPS alternate",9200:"Elasticsearch"]

    static func supports(_ tool: Tool) -> Bool {
        guard !tool.isPlanned else { return false }
        let op = tool.engine.op ?? tool.engine.id ?? tool.id
        switch tool.engine.type {
        case "generator": return generatorOps.contains(op)
        case "network": return networkOps.contains(op)
        case "seo": return seoOps.contains(op)
        case "developer": return true
        case "cssgen":
            let family = op.split(separator: ":").first.map { $0 == "neumorphism" ? "neomorph" : String($0) } ?? ""
            return op.contains(":") && cssFamilies.contains(family)
        default: return false
        }
    }

    static func run(_ tool: Tool, input: String = "", optionsJSON: String = "{}") throws -> Output {
        let op = tool.engine.op ?? tool.engine.id ?? tool.id
        let options = try parseOptions(optionsJSON)
        switch tool.engine.type {
        case "generator": return Output(text: try runGenerator(op, options: options), filename: "env-\(op).txt")
        case "network": return Output(text: try runNetwork(op, input: input, options: options), filename: "env-network-\(op).txt")
        case "seo": return Output(text: try runSEO(op, options: options), filename: "env-seo-\(op).txt")
        case "developer": return Output(text: try runDeveloperParity(op, input: input, options: options), filename: "env-\(op).txt")
        case "cssgen": return runCSS(op, options: options)
        default: throw NativeSimpleError.message("No native utility engine for \(tool.engine.type).")
        }
    }

    private static func parseOptions(_ raw: String) throws -> [String:String] {
        guard let data = raw.data(using: .utf8), let object = try JSONSerialization.jsonObject(with: data) as? [String:Any] else {
            throw NativeSimpleError.message("Options must be valid JSON.")
        }
        var result: [String:String] = [:]
        for (key,value) in object { result[key] = String(describing: value) }
        return result
    }
    private static func n(_ opts:[String:String], _ key:String, _ defaultValue:Int) -> Int { Int(Double(opts[key] ?? "") ?? Double(defaultValue)) }
    private static func pick(_ a:[String]) -> String { a.randomElement()! }
    private static func rnd(_ max:Int) -> Int { max > 0 ? Int.random(in: 0..<max) : 0 }
    private static func lines(_ s:String) -> [String] { s.components(separatedBy: .newlines).map{ $0.trimmingCharacters(in:.whitespacesAndNewlines) }.filter{ !$0.isEmpty } }
    private static func token(_ length:Int) -> String { let chars=Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"); return String((0..<max(0,length)).map{ _ in chars[rnd(chars.count)] }) }
    private static func hex(_ length:Int) -> String { let chars=Array("0123456789abcdef"); return String((0..<max(0,length)).map{ _ in chars[rnd(chars.count)] }) }
    private static func prettyJSON(_ rows:[[String:Any]]) -> String { let data=try! JSONSerialization.data(withJSONObject: rows, options:[.prettyPrinted]); return String(data:data,encoding:.utf8)! }
    private static func trimNumber(_ x:Double) -> String { x.rounded() == x ? String(Int(x)) : String(format:"%.10g",x) }

    private static func runGenerator(_ op:String, options o:[String:String]) throws -> String {
        let count=n(o,"count",8); let seed=(o["seed"] ?? o["keyword"] ?? o["name"] ?? "nova").trimmingCharacters(in:.whitespacesAndNewlines); let seedValue=seed.isEmpty ? "nova" : seed
        switch op {
        case "lorem": let unit=o["unit"] ?? "paragraphs"; if unit=="words" { return (0..<count).map{_ in pick(words)}.joined(separator:" ") }; if unit=="sentences" { return (0..<count).map{_ in lorem.components(separatedBy:". ").first! + "."}.joined(separator:" ") }; return (0..<count).map{_ in lorem}.joined(separator:"\n\n")
        case "dummy-json","dummy-users": return prettyJSON((0..<count).map{ i in ["id":UUID().uuidString,"name":"\(pick(first)) \(pick(last))","email":"user\(i+1)@example.com","city":pick(cities)] })
        case "dummy-products": let prefix=(o["prefix"] ?? "SKU").uppercased(); return prettyJSON((0..<count).map{ i in ["sku":"\(prefix)-\(1000+i)","name":"\(pick(adj)) \(pick(noun))","price":9+rnd(90)] })
        case "dummy-csv": return (["name,email,city"] + (0..<count).map{ _ in "\(pick(first)) \(pick(last)),\(pick(first).lowercased())@example.com,\(pick(cities))" }).joined(separator:"\n")
        case "dummy-sql": return "-- Fictional test data generated by enV\n" + (0..<count).map{ i in "INSERT INTO users (id, name, email) VALUES (\(i+1), '\(pick(first)) \(pick(last))', 'user\(i+1)@example.com');" }.joined(separator:"\n")
        case "passphrase": return (0..<n(o,"words",6)).map{_ in pick(words)}.joined(separator:"-")
        case "random-string": return token(n(o,"length",16))
        case "random-hex": return hex(n(o,"length",16))
        case "secure-token": return token(n(o,"length",32))
        case "random-number-generator": let lo=min(Double(o["min"] ?? "1") ?? 1,Double(o["max"] ?? "100") ?? 100); let hi=max(Double(o["min"] ?? "1") ?? 1,Double(o["max"] ?? "100") ?? 100); return (0..<n(o,"count",1)).map{_ in trimNumber(lo+Double.random(in:0...(hi-lo+1)))}.joined(separator:"\n")
        case "random-name-generator","name-generator","name-picker","name-randomizer","name-wheel","name-list-generator","test-names": return (0..<(op=="name-generator"||op=="random-name-generator"||op=="test-names"||op.hasSuffix("list-generator") ? count : 1)).map{_ in "\(pick(first)) \(pick(last))"}.joined(separator:"\n")
        case "username","username-picker","username-randomizer","username-wheel","username-list-generator","random-username-generator": return (0..<(op=="username"||op=="random-username-generator"||op.hasSuffix("list-generator") ? count : 1)).map{_ in "\(pick(adj))\(pick(noun))\(rnd(100))"}.joined(separator:"\n")
        case "random-country-generator","country-generator","country-picker","country-randomizer","country-wheel","country-list-generator": return (op.hasSuffix("list-generator") ? Array(countries.shuffled().prefix(min(count,countries.count))) : (0..<(op=="country-generator"||op=="random-country-generator" ? count : 1)).map{_ in pick(countries)}).joined(separator:"\n")
        case "random-city-generator","city-generator","city-picker","city-randomizer","city-wheel","city-list-generator": return (op.hasSuffix("list-generator") ? Array(cities.shuffled().prefix(min(count,cities.count))) : (0..<(op=="city-generator"||op=="random-city-generator" ? count : 1)).map{_ in pick(cities)}).joined(separator:"\n")
        case "random-color-generator","color-randomizer","color-wheel","color-list-generator": return (0..<(op=="random-color-generator" || op.hasSuffix("list-generator") ? count : 1)).map{_ in "#\(hex(3))"}.joined(separator:"\n")
        case "random-word-generator","word-generator","word-picker","word-randomizer","word-wheel","word-list-generator": return (0..<(op=="random-word-generator"||op=="word-generator"||op.hasSuffix("list-generator") ? count : 1)).map{_ in pick(words)}.joined(separator:"\n")
        case "random-date-generator","date-generator","date-picker","date-randomizer","date-wheel","date-list-generator": return (0..<(op=="random-date-generator"||op=="date-generator"||op.hasSuffix("list-generator") ? count : 1)).map{_ in String(format:"%04d-%02d-%02d",1990+rnd(36),1+rnd(12),1+rnd(28))}.joined(separator:"\n")
        case "yes-no-generator": return rnd(2)==0 ? "Yes" : "No"
        case "random-decision","decision-generator","decision-picker","decision-randomizer","decision-wheel","decision-list-generator": let options=lines(o["options"] ?? o["names"] ?? ""); guard options.count>=2 else {throw NativeSimpleError.message("Enter at least two options, one per line.")}; return op.hasSuffix("list-generator") ? Array(options.shuffled()) .joined(separator:"\n") : pick(options)
        case "team-generator": return try buildTeams(lines(o["names"] ?? ""), k:max(2,n(o,"teams",2)))
        case "team-picker","team-randomizer","team-wheel","team-list-generator": let options=lines(o["names"] ?? ""); guard !options.isEmpty else {throw NativeSimpleError.message("Enter names, one per line.")}; return pick(options)
        case "group-generator","group-picker","group-randomizer","group-wheel","group-list-generator": return try buildGroups(lines(o["names"] ?? ""), groups:max(2,n(o,"groups",2)))
        case "secret-santa-generator","secret-santa-picker","secret-santa-randomizer","secret-santa-wheel","secret-santa-list-generator": return try secretSanta(lines(o["names"] ?? ""))
        case "fantasy-name-generator","fantasy-generator","fantasy-picker","fantasy-randomizer","fantasy-wheel","fantasy-list-generator": return (0..<(op=="fantasy-name-generator"||op.hasSuffix("list-generator") ? count : 1)).map{_ in pick(fantasy)+pick(suffixes)}.joined(separator:"\n")
        case "nickname-generator": return (0..<count).map{_ in String(seedValue.prefix(3))+pick(adj)}.joined(separator:"\n")
        case "pet-name-generator","pet-generator","pet-picker","pet-randomizer","pet-wheel","pet-list-generator": return (0..<(op=="pet-name-generator"||op=="pet-generator"||op.hasSuffix("list-generator") ? count : 1)).map{_ in pick(pets)}.joined(separator:"\n")
        case "baby-name-generator","baby-generator","baby-picker","baby-randomizer","baby-wheel","baby-list-generator": return (0..<(op=="baby-name-generator"||op=="baby-generator"||op.hasSuffix("list-generator") ? count : 1)).map{_ in pick(first)}.joined(separator:"\n")
        case "story-prompt-generator","writing-prompt-generator": return "\(pick(first)) must \(pick(storyActions)) a \(pick(noun)) before \(pick(storyDeadlines))."
        case "plot-generator": return "Character: \(pick(first))\nWant: a \(pick(noun))\nObstacle: a \(pick(adj)) \(pick(noun))"
        case "biz-name","company-name","brand-name","product-name": return (0..<count).map{_ in "\(pick(adj)) \(seedValue)"}.joined(separator:"\n")
        case "hashtags": return seedValue.split(whereSeparator: { $0.isWhitespace }).flatMap{ ["#\($0)","#\($0)tips","#\(pick(adj))\($0)"] }.joined(separator:" ")
        case "uuid-list": return (0..<count).map{_ in UUID().uuidString}.joined(separator:"\n")
        case "coin-flip": return rnd(2)==0 ? "Heads" : "Tails"
        case "dice-roller": let dice=max(1,min(100,n(o,"dice",1))); let sides=max(2,min(1000,n(o,"sides",6))); let rolls=(0..<dice).map{_ in 1+rnd(sides)}; return "\(dice)d\(sides): \(rolls.map(String.init).joined(separator:", "))\nTotal: \(rolls.reduce(0,+))"
        case "wheel","wheel-spinner": let options=lines(o["options"] ?? o["items"] ?? o["names"] ?? ""); guard options.count>=2 else {throw NativeSimpleError.message("Enter at least two options, one per line.")}; return "Selected: \(pick(options))"
        case "emoji-generator","emoji-picker","emoji-randomizer","emoji-wheel","emoji-list-generator": return (0..<(op.hasSuffix("list-generator") ? count : 1)).map{_ in pick(emojis)}.joined(separator:" ")
        case "number-generator","number-picker","number-randomizer","number-wheel","number-list-generator": return (0..<(op=="number-generator"||op.hasSuffix("list-generator") ? count : 1)).map{_ in String(rnd(1000))}.joined(separator:"\n")
        case "time-generator","time-picker","time-randomizer","time-wheel","time-list-generator": return (0..<(op.hasSuffix("list-generator") ? count : 1)).map{_ in String(format:"%02d:%02d",rnd(24),rnd(60))}.joined(separator:"\n")
        case "character-generator","character-picker","character-randomizer","character-wheel","character-list-generator": return (0..<(op.hasSuffix("list-generator") ? count : 1)).map{_ in "\(pick(first)) — \(pick(adj)) \(pick(roles))"}.joined(separator:"\n")
        case "gamer-name-generator","gamer-generator","gamer-picker","gamer-randomizer","gamer-wheel","gamer-list-generator": return (0..<(op.hasSuffix("list-generator")||op=="gamer-name-generator" ? count : 1)).map{_ in "\(pick(adj))\(pick(noun))\(rnd(999))"}.joined(separator:"\n")
        case "test-address": return (0..<count).map{_ in "\(100+rnd(900)) \(pick(noun).capitalized) Street, \(pick(cities))"}.joined(separator:"\n")
        case "test-email": return (0..<count).map{ i in "\(pick(first).lowercased()).\(pick(last).lowercased())\(i)@example.com"}.joined(separator:"\n")
        case "test-phone": return (0..<count).map{_ in String(format:"+1-555-01%02d",rnd(100))}.joined(separator:"\n")
        case "story-generator","story-picker","story-randomizer","story-wheel","story-list-generator": return (0..<(op.hasSuffix("list-generator") ? count : 1)).map{_ in "Story seed: \(pick(first)) discovers a \(pick(noun)) that could change everything."}.joined(separator:"\n")
        default: throw NativeSimpleError.message("Unknown generator operation: \(op)")
        }
    }

    private static func buildTeams(_ names:[String], k:Int) throws -> String { guard names.count>=k else {throw NativeSimpleError.message("Need at least as many names as teams.")}; var shuffled=names.shuffled(); var teams=Array(repeating:[String](),count:k); for i in shuffled.indices { teams[i%k].append(shuffled[i]) }; return teams.enumerated().map{ "Team \($0.offset+1)\n\($0.element.joined(separator:"\n"))" }.joined(separator:"\n\n") }
    private static func buildGroups(_ names:[String], groups:Int) throws -> String { guard !names.isEmpty else {throw NativeSimpleError.message("Enter names, one per line.")}; let k=min(groups,names.count); var shuffled=names.shuffled(); var buckets=Array(repeating:[String](),count:k); for i in shuffled.indices {buckets[i%k].append(shuffled[i])}; return buckets.enumerated().map{ "Group \($0.offset+1)\n\($0.element.joined(separator:"\n"))"}.joined(separator:"\n\n") }
    private static func secretSanta(_ names:[String]) throws -> String { guard names.count>=2 else {throw NativeSimpleError.message("Enter at least two names.")}; for _ in 0..<40 { let recv=names.shuffled(); if recv.indices.allSatisfy({ recv[$0] != names[$0] }) { return names.indices.map{ "\(names[$0]) → \(recv[$0])" }.joined(separator:"\n") } }; throw NativeSimpleError.message("Could not build a derangement. Add more names.") }

    private static func runNetwork(_ op:String,input:String,options o:[String:String]) throws -> String {
        let raw=(o["address"] ?? input).trimmingCharacters(in:.whitespacesAndNewlines)
        if op.hasPrefix("ipv4-") || ["ipv4-calculator","subnet-calculator","cidr-calculator"].contains(op) {
            let parsed=try parseIPv4Prefix(raw.isEmpty ? "192.168.1.10/24" : raw); let prefix=parsed.prefix ?? Int(o["prefix"] ?? "24") ?? 24; let r=ipv4Result(parsed.ip,prefix)
            switch op { case "ipv4-calculator","subnet-calculator","cidr-calculator": return "Address: \(parsed.ip.map(String.init).joined(separator:"."))/\(prefix)\nNetwork: \(r.network)\nBroadcast: \(r.broadcast)\nFirst usable: \(r.first)\nLast usable: \(r.last)\nSubnet mask: \(r.mask)\nWildcard mask: \(r.wildcard)\nTotal addresses: \(r.total)\nUsable hosts: \(r.usable)"; case "ipv4-binary": return "Address: \(bits(parsed.ip))\nMask: \(bits(ipFromString(r.mask)))"; case "ipv4-decimal": return String(ipToInt(parsed.ip)); case "ipv4-network-address": return r.network; case "ipv4-broadcast-address": return r.broadcast; case "ipv4-host-range": return "\(r.first) - \(r.last)"; case "ipv4-wildcard-mask": return r.wildcard; case "ipv4-mask-from-prefix": return r.mask; case "ipv4-prefix-from-mask": return String(maskPrefix(ipFromString(o["mask"] ?? input))); case "ipv4-host-count": return String(r.usable); case "ipv4-subnet-count": return "Addresses per /\(prefix): \(r.total)\nUsable hosts: \(r.usable)"; case "ipv4-split-subnets": return "Subnet /\(prefix) -> network \(r.network), broadcast \(r.broadcast)"; default: throw NativeSimpleError.message("Unknown IPv4 operation") }
        }
        if op.hasPrefix("ipv6-") { return try runIPv6(op, raw: raw.isEmpty ? "2001:db8::1" : raw, prefix:Int(o["prefix"] ?? "64") ?? 64) }
        switch op {
        case "url-parser","url-query-parser","url-origin","url-path-analyzer":
            let components=URLComponents(string:o["url"] ?? (input.isEmpty ? "https://example.com/path?x=1" : input))!; let path=components.path.isEmpty ? "/" : components.path; let pairs=components.queryItems ?? []
            switch op { case "url-parser": return "Protocol: \(components.scheme ?? "")\nUsername: \(components.user ?? "—")\nHost: \(components.host ?? "")\nHostname: \(components.host ?? "")\nPort: \(components.port.map(String.init) ?? "default")\nPath: \(path)\nQuery: \(components.percentEncodedQuery.map{ "?\($0)" } ?? "—")\nHash: \(components.fragment.map{ "#\($0)" } ?? "—")\nOrigin: \(components.scheme ?? "")://\(components.host ?? "")\(components.port.map{":\($0)"} ?? "")"; case "url-origin": return "\(components.scheme ?? "")://\(components.host ?? "")\(components.port.map{":\($0)"} ?? "")"; case "url-path-analyzer": let seg=path.split(separator:"/").map(String.init); return "Path: \(path)\nSegments: \(seg.count)\nLast segment: \(seg.last ?? "—")"; default: return pairs.isEmpty ? "No query parameters." : pairs.map{ "\($0.name) = \($0.value ?? "")" }.joined(separator:"\n") }
        case "url-query-builder": var c=URLComponents(string:o["url"] ?? (input.isEmpty ? "https://example.com/search" : input))!; var q=c.queryItems ?? []; q.append(URLQueryItem(name:o["name"] ?? "q",value:o["value"] ?? "")); c.queryItems=q; return c.string!
        case "url-encode": return (o["text"] ?? input).addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        case "url-decode": return (o["text"] ?? input).removingPercentEncoding ?? input
        case "port-lookup","port-reference": if let name=o["name"]?.lowercased(), !name.isEmpty { let rows=NativeUtilityEngine.ports.filter{$0.value.lowercased().contains(name)}.map{ "\($0.key): \($0.value)" }; return rows.isEmpty ? "No match in the common-port reference." : rows.joined(separator:"\n") }; let p=Int(o["port"] ?? input) ?? 443; return NativeUtilityEngine.ports[p].map{ "\(p)/TCP or UDP: \($0)" } ?? "\(p): not in the built-in common-port reference."
        case "http-status-reference": return [(200,"OK"),(201,"Created"),(204,"No Content"),(301,"Moved Permanently"),(302,"Found"),(304,"Not Modified"),(400,"Bad Request"),(401,"Unauthorized"),(403,"Forbidden"),(404,"Not Found"),(405,"Method Not Allowed"),(409,"Conflict"),(429,"Too Many Requests"),(500,"Internal Server Error"),(502,"Bad Gateway"),(503,"Service Unavailable"),(504,"Gateway Timeout")].map{ "\($0.0): \($0.1)"}.joined(separator:"\n")
        case "header-format","header-parser": let rows=lines(o["headers"] ?? (input.isEmpty ? "Content-Type: application/json\nAuthorization: Bearer YOUR_TOKEN" : input)).map{ line in let p=line.firstIndex(of:":"); return p.map{ "\(line[..<$0].trimmingCharacters(in:.whitespaces)): \(line[line.index(after:$0)...].trimmingCharacters(in:.whitespaces))" } ?? line }; return op=="header-parser" ? rows.map{ row in let p=row.firstIndex(of:":"); return p.map{ "\(row[..<$0]) → \(row[row.index(after:$0)...].trimmingCharacters(in:.whitespaces))" } ?? row }.joined(separator:"\n") : rows.joined(separator:"\n")
        case "basic-auth-header": let user=o["username"] ?? ""; let pass=o["password"] ?? ""; return "Basic " + Data("\(user):\(pass)".utf8).base64EncodedString()
        case "bearer-header": return "Bearer \(o["token"] ?? input)"
        case "connection-info": return "Online status is device/runtime dependent; native engine does not expose browser Network Information API fields."
        case "http-method-reference": return ["GET: Retrieve a representation","POST: Submit data for processing","PUT: Replace a resource","PATCH: Partially modify a resource","DELETE: Remove a resource","HEAD: Headers without response body","OPTIONS: Discover communication options","CONNECT: Establish a tunnel","TRACE: Diagnostic loop-back method"].joined(separator:"\n")
        case "content-type-reference": return ["application/json","application/xml","application/x-www-form-urlencoded","multipart/form-data","text/plain","text/html","text/css","text/javascript","image/png","image/jpeg","image/webp","audio/mpeg","video/mp4"].joined(separator:"\n")
        case "websocket-url-builder": let host=(o["host"] ?? input).replacingOccurrences(of:"http://",with:"").replacingOccurrences(of:"https://",with:"").trimmingCharacters(in:.init(charactersIn:"/")); let path=((o["path"] ?? "/socket").hasPrefix("/") ? (o["path"] ?? "/socket") : "/\(o["path"] ?? "socket")"); return "\(((o["secure"] ?? "true").lowercased() == "false") ? "ws" : "wss")://\(host.isEmpty ? "example.com" : host)\(path)"
        case "localhost-url-builder": let scheme=o["protocol"].flatMap{$0.isEmpty ? nil : $0} ?? "http"; let host=o["host"].flatMap{$0.isEmpty ? nil : $0} ?? "localhost"; let port=o["port"].flatMap{$0.isEmpty ? nil : $0} ?? "3000"; let path=o["path"].flatMap{$0.isEmpty ? nil : $0} ?? "/"; return "\(scheme)://\(host):\(port)\(path.hasPrefix("/") ? path : "/\(path)")"
        default: throw NativeSimpleError.message("Unknown network operation: \(op)")
        }
    }

    private struct V4 { let network:String; let broadcast:String; let first:String; let last:String; let mask:String; let wildcard:String; let total:UInt64; let usable:UInt64 }
    private struct V4Parsed { let ip:[Int]; let prefix:Int? }
    private static func parseIPv4(_ raw:String) throws -> [Int] { let p=raw.split(separator:".").map{Int($0)}; guard p.count==4 && p.allSatisfy({($0 ?? -1)>=0 && ($0 ?? -1)<=255}) else {throw NativeSimpleError.message("Enter a valid IPv4 address.")}; return p.map{$0!} }
    private static func parseIPv4Prefix(_ raw:String) throws -> V4Parsed { let p=raw.split(separator:"/",omittingEmptySubsequences:false); return V4Parsed(ip:try parseIPv4(String(p[0])),prefix:p.count>1 ? Int(p[1]) : nil) }
    private static func ipToInt(_ ip:[Int]) -> UInt64 { (UInt64(ip[0])<<24)|(UInt64(ip[1])<<16)|(UInt64(ip[2])<<8)|UInt64(ip[3]) }
    private static func intToIP(_ n:UInt64)->String { "\((n>>24)&255).\((n>>16)&255).\((n>>8)&255).\(n&255)" }
    private static func mask(_ prefix:Int) throws -> UInt64 { guard (0...32).contains(prefix) else {throw NativeSimpleError.message("Prefix must be between 0 and 32.")}; return prefix==0 ? 0 : (UInt64.max << UInt64(32-prefix)) & 0xffffffff }
    private static func bits(_ ip:[Int])->String { ip.map{String($0,radix:2).leftPad(to:8,with:"0")}.joined(separator:" ") }
    private static func ipv4Result(_ ip:[Int],_ prefix:Int)->V4 { let m=try! mask(prefix); let n=ipToInt(ip); let network=n&m; let broadcast=network | (~m & 0xffffffff); let total:UInt64=1 << UInt64(32-prefix); let usable:UInt64=prefix>=31 ? total : max(0,total-2); return V4(network:intToIP(network),broadcast:intToIP(broadcast),first:intToIP(prefix>=31 ? network : network+1),last:intToIP(prefix>=31 ? broadcast : broadcast-1),mask:intToIP(m),wildcard:intToIP(~m & 0xffffffff),total:total,usable:usable) }
    private static func ipFromString(_ s:String)->[Int] { (try? parseIPv4(s)) ?? [0,0,0,0] }
    private static func maskPrefix(_ ip:[Int])->Int { String(ipToInt(ip),radix:2).leftPad(to:32,with:"0").firstIndex(of:"0").map{String(ipToInt(ip),radix:2).leftPad(to:32,with:"0").distance(from:String(ipToInt(ip),radix:2).leftPad(to:32,with:"0").startIndex,to:$0)} ?? 32 }

    private static func parseIPv6(_ raw:String) throws -> [UInt16] { let v=raw.lowercased().components(separatedBy:"%").first ?? raw; let halves=v.components(separatedBy:"::"); guard halves.count<=2 else {throw NativeSimpleError.message("Invalid IPv6 address.")}; let left=halves[0].isEmpty ? [] : halves[0].split(separator:":").compactMap{UInt16($0,radix:16)}; let right=(halves.count==2 && !halves[1].isEmpty) ? halves[1].split(separator:":").compactMap{UInt16($0,radix:16)} : []; guard left.count+right.count<=8 else {throw NativeSimpleError.message("Invalid IPv6 address.")}; let fill=halves.count==2 ? 8-left.count-right.count : 0; guard halves.count==2 || left.count+right.count==8 else {throw NativeSimpleError.message("Invalid IPv6 address.")}; return left + Array(repeating:UInt16(0),count:fill) + right }
    private static func expand6(_ g:[UInt16])->String { g.map{String(format:"%04x",$0)}.joined(separator:":") }
    private static func compress6(_ g:[UInt16])->String {
        var bestStart = -1
        var bestLen = 0
        var i = 0
        while i < 8 {
            if g[i] == 0 {
                var j = i
                while j < 8 && g[j] == 0 { j += 1 }
                if j - i > bestLen { bestStart = i; bestLen = j - i }
                i = j
            } else { i += 1 }
        }
        if bestLen < 2 { return g.map { String($0, radix:16) }.joined(separator:":") }
        let left = g.prefix(bestStart).map { String($0, radix:16) }.joined(separator:":")
        let right = g.dropFirst(bestStart + bestLen).map { String($0, radix:16) }.joined(separator:":")
        if left.isEmpty && right.isEmpty { return "::" }
        if left.isEmpty { return "::\(right)" }
        if right.isEmpty { return "\(left)::" }
        return "\(left)::\(right)"
    }
    private static func runIPv6(_ op:String,raw:String,prefix:Int) throws -> String { let g=try parseIPv6(raw.split(separator:"/").first.map(String.init) ?? raw); switch op { case "ipv6-expand": return expand6(g); case "ipv6-compress": return compress6(g); case "ipv6-binary": return g.map{String($0,radix:2).leftPad(to:16,with:"0")}.joined(separator:" "); case "ipv6-address-type": let first=Int(g[0]); if g.allSatisfy({$0==0}) {return "Unspecified (::)"}; if g.dropLast().allSatisfy({$0==0}) && g.last==1 {return "Loopback (::1)"}; if (first & 0xfe00)==0xfc00{return "Unique local (fc00::/7)"}; if (first & 0xff00)==0xff00{return "Multicast (ff00::/8)"}; if g[0...4].allSatisfy({$0==0}) && g[5]==0xffff{return "IPv4-mapped IPv6"}; return "Global/unicast or other address"; default: guard (0...128).contains(prefix) else {throw NativeSimpleError.message("Prefix must be between 0 and 128.")}; var network=g; let full=prefix/16; let rem=prefix%16; if full<8 { if rem==0 {for i in full..<8{network[i]=0}} else {network[full] &= UInt16(0xffff << (16-rem)); if full+1<8 {for i in (full+1)..<8{network[i]=0}}} }; var last=network; var remaining=128-prefix; var idx=7; while remaining>0 && idx>=0 {let take=min(16,remaining); last[idx] |= UInt16((1<<take)-1); remaining -= take; idx -= 1}; return "Network: \(compress6(network))/\(prefix)\nFirst: \(compress6(network))\nLast: \(compress6(last))\nAddresses: 2^\(128-prefix)" } }

    private static func runDeveloper(_ op:String,input:String,options o:[String:String]) throws -> String {
        let secondary=o["secondary"] ?? o["test"] ?? o["second"] ?? ""
        func b64(_ value:String)->String { let normalized=value.replacingOccurrences(of:"-",with:"+").replacingOccurrences(of:"_",with:"/"); let padded=normalized + String(repeating:"=", count:(4-normalized.count%4)%4); return String(data:Data(base64Encoded:padded) ?? Data(),encoding:.utf8) ?? "" }
        func enc(_ kind:String,_ value:String)->String { switch kind { case "base64": return Data(value.utf8).base64EncodedString(); case "uri": return value.addingPercentEncoding(withAllowedCharacters:.urlQueryAllowed) ?? value; case "unicode": return value.unicodeScalars.map{String(format:"\\u%04x",$0.value)}.joined(); case "html": return value.replacingOccurrences(of:"&",with:"&amp;").replacingOccurrences(of:"<",with:"&lt;").replacingOccurrences(of:">",with:"&gt;").replacingOccurrences(of:"\"",with:"&quot;").replacingOccurrences(of:"'",with:"&#39;"); default:return value } }
        func dec(_ kind:String,_ value:String)->String { switch kind { case "base64": return String(data:Data(base64Encoded:value.filter{!$0.isWhitespace}) ?? Data(),encoding:.utf8) ?? ""; case "uri": return value.removingPercentEncoding ?? value; case "unicode": return value.replacingOccurrences(of:"\\u",with:" ").split(separator:" ").compactMap{UInt32($0,radix:16).flatMap(UnicodeScalar.init)}.map(String.init).joined(); case "html": return value.replacingOccurrences(of:"&lt;",with:"<").replacingOccurrences(of:"&gt;",with:"> ").replacingOccurrences(of:"&quot;",with:"\"").replacingOccurrences(of:"&#39;",with:"'").replacingOccurrences(of:"&amp;",with:"&"); default:return value } }
        if op.hasPrefix("regex-") {
            guard !secondary.isEmpty else { throw NativeSimpleError.message("Enter a regular expression in the second field.") }
            let flags=o["flags"] ?? "g"
            var regexOptions=NSRegularExpression.Options()
            if flags.contains("i") { regexOptions.insert(.caseInsensitive) }
            if flags.contains("m") { regexOptions.insert(.anchorsMatchLines) }
            if flags.contains("s") { regexOptions.insert(.dotMatchesLineSeparators) }
            let pattern=try NSRegularExpression(pattern:input,options:regexOptions)
            let range=NSRange(secondary.startIndex...,in:secondary)
            let matches=pattern.matches(in:secondary,range:range)
            let rows=matches.enumerated().map { index, match in
                "\(index+1). \(String(secondary[Range(match.range,in:secondary)!])) at index \(match.range.location)"
            }.joined(separator:"\n")
            return "Pattern: /\(input)/\nMatches: \(matches.count)\n\n\(rows.isEmpty ? "No matches" : rows)"
        }
        if op=="jwt-decoder" || op=="jwt-expiration-checker" {
            let parts=input.trimmingCharacters(in:.whitespacesAndNewlines).split(separator:".")
            guard parts.count==3 else { throw NativeSimpleError.message("A JWT must contain three dot-separated parts.") }
            let header=try JSONSerialization.jsonObject(with:Data(b64(String(parts[0])).utf8),options:[.fragmentsAllowed])
            let payload=try JSONSerialization.jsonObject(with:Data(b64(String(parts[1])).utf8),options:[.fragmentsAllowed])
            let exp=(payload as? [String:Any])?["exp"] as? Double
            let expiresAt:String
            let expired:Any
            if let exp {
                let formatter=ISO8601DateFormatter(); formatter.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
                expiresAt=formatter.string(from:Date(timeIntervalSince1970:exp)); expired=Date().timeIntervalSince1970 >= exp
            } else { expiresAt="none"; expired=NSNull() }
            return prettyJSONObject(["header":header,"payload":payload,"signaturePresent":!parts[2].isEmpty,"expiresAt":expiresAt,"expired":expired])
        }
        if op=="uuid-generator" { let count=max(1,min(100,Int(o["count"] ?? "10") ?? 10)); return (0..<count).map{_ in UUID().uuidString.lowercased()}.joined(separator:"\n") }
        if op=="uuid-validator" { return Self.uuidValidation(input) }
        if op=="json-validator" { _=try Self.jsonValue(input,pretty:false); return "Valid JSON (RFC 8259-compatible parser)." }
        if op=="json-beautifier" || op=="json-formatter" { return try Self.jsonValue(input,pretty:true) }
        if op=="json-minifier" { return try Self.jsonValue(input,pretty:false) }
        if op=="query-string-parser" { return input }
        if op=="url-parser" { return try Self.developerURLInfo(input) }
        if op=="http-status-lookup" {
            let rows=[("200","OK"),("201","Created"),("204","No Content"),("301","Moved Permanently"),("302","Found"),("304","Not Modified"),("400","Bad Request"),("401","Unauthorized"),("403","Forbidden"),("404","Not Found"),("405","Method Not Allowed"),("409","Conflict"),("422","Unprocessable Content"),("429","Too Many Requests"),("500","Internal Server Error"),("502","Bad Gateway"),("503","Service Unavailable"),("504","Gateway Timeout")]
            let code=input.trimmingCharacters(in:.whitespacesAndNewlines)
            return rows.first(where:{$0.0==code}).map{"\($0.0) \($0.1)"} ?? rows.map{"\($0.0) \($0.1)"}.joined(separator:"\n")
        }
        if op=="data-uri-generator" { return "data:text/plain;base64,\(enc("base64",input))" }
        if op=="markdown-preview" || op=="markdown-to-html" { return Self.formatDeveloperMarkup(input) }
        if op=="user-agent-parser" { return input }
        if op=="cron-generator" || op=="cron-parser" { return "Cron: \(input.trimmingCharacters(in:.whitespacesAndNewlines))\nFive-field format: minute hour day-of-month month day-of-week" }
        return input
    }

    private static func developerHashJSON(op: String, data: Data) -> String {
        let lower = op.lowercased()
        let enc = lower.contains("base64") ? "base64" : "hex"
        var rows: [[String: Any]] = []
        let algorithms: [(String, (Data) -> Data)] = [
            ("MD5", { Data(Insecure.MD5.hash(data: $0)) }),
            ("SHA-1", { Data(Insecure.SHA1.hash(data: $0)) }),
            ("SHA-256", { Data(SHA256.hash(data: $0)) }),
            ("SHA-384", { Data(SHA384.hash(data: $0)) }),
            ("SHA-512", { Data(SHA512.hash(data: $0)) })
        ]
        let selected = algorithms.filter { algorithm, _ in
            if lower.contains("md5") { return algorithm == "MD5" }
            if lower.contains("sha1") || lower.contains("sha-1") { return algorithm == "SHA-1" }
            if lower.contains("sha256") || lower.contains("sha-256") { return algorithm == "SHA-256" }
            if lower.contains("sha384") || lower.contains("sha-384") { return algorithm == "SHA-384" }
            if lower.contains("sha512") || lower.contains("sha-512") { return algorithm == "SHA-512" }
            return true
        }
        for (name, digest) in selected {
            let bytes = digest(data)
            let value = enc == "base64" ? bytes.base64EncodedString() : bytes.map { String(format: "%02x", $0) }.joined()
            rows.append(["algorithm": name, "encoding": enc, "digest": value])
        }
        return prettyJSONObject(["localOnly": true, "hashes": rows, "note": "MD5 and SHA-1 are legacy checksums, not password-hashing algorithms."])
    }

    /// Hash raw bytes obtained from a local file picker. No network request is made.
    static func hashDeveloperFileData(op: String, data: Data) -> String { developerHashJSON(op: op, data: data) }

    private static func developerTimestamp(_ raw: String) throws -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let date: Date
        if trimmed.isEmpty { date = Date() }
        else if let n = Double(trimmed), n.isFinite {
            date = Date(timeIntervalSince1970: abs(n) < 100_000_000_000 ? n : n / 1000)
        } else {
            let iso = ISO8601DateFormatter()
            guard let parsed = iso.date(from: trimmed) else { throw NativeSimpleError.message("Enter Unix seconds/milliseconds or an ISO-8601 date.") }
            date = parsed
        }
        let iso = ISO8601DateFormatter().string(from: date)
        let local = DateFormatter(); local.locale = Locale(identifier: "en_US_POSIX"); local.timeZone = .current; local.dateFormat = "yyyy-MM-dd HH:mm:ss zzz"
        let utc = DateFormatter(); utc.locale = Locale(identifier: "en_US_POSIX"); utc.timeZone = TimeZone(secondsFromGMT: 0); utc.dateFormat = "yyyy-MM-dd HH:mm:ss 'UTC'"
        return prettyJSONObject(["epochSeconds": Int64(date.timeIntervalSince1970), "epochMilliseconds": Int64(date.timeIntervalSince1970 * 1000), "iso": iso, "utc": utc.string(from: date), "local": local.string(from: date), "timezone": TimeZone.current.identifier])
    }

    private static func developerCronField(_ raw: String, min lower: Int, max upper: Int, names: [String: Int] = [:], dow: Bool = false) throws -> (values: Set<Int>, wildcard: Bool) {
        // Vixie-style cron marks a day field beginning with * (including */step) as wildcard-driven.
        // Cron dialects differ here, so the generated explanation names this assumption explicitly.
        let source = raw.lowercased(); let wildcard = source.hasPrefix("*"); var values = Set<Int>()
        for segment in source.split(separator: ",", omittingEmptySubsequences: false).map(String.init) {
            guard !segment.isEmpty else { throw NativeSimpleError.message("Empty comma-separated value in cron field.") }
            let split = segment.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
            guard split.count <= 2 else { throw NativeSimpleError.message("Cron field contains more than one '/'.") }
            let step = split.count == 2 ? (Int(split[1]) ?? 0) : 1
            guard step > 0 else { throw NativeSimpleError.message("Cron step must be a positive integer.") }
            let range = split[0].split(separator: "-", omittingEmptySubsequences: false).map(String.init)
            let start: Int; let end: Int
            if split[0] == "*" { start = lower; end = upper }
            else if range.count == 2 {
                guard let a = names[range[0]] ?? Int(range[0]), let b = names[range[1]] ?? Int(range[1]), a >= lower, a <= upper, b >= lower, b <= upper, a <= b else { throw NativeSimpleError.message("Invalid cron range '\(split[0])'. Expected values from \(lower) through \(upper).") }
                start = a; end = b
            } else {
                guard let a = names[split[0]] ?? Int(split[0]), a >= lower, a <= upper else { throw NativeSimpleError.message("Cron value '\(split[0])' must be from \(lower) through \(upper).") }
                start = a; end = split.count == 2 ? upper : a
            }
            for n in stride(from: start, through: end, by: step) { values.insert(dow && n == 7 ? 0 : n) }
        }
        guard !values.isEmpty else { throw NativeSimpleError.message("Cron field does not select any values.") }
        return (values, wildcard)
    }

    private static func developerCron(_ expression: String) throws -> String {
        let parts = expression.trimmingCharacters(in: .whitespacesAndNewlines).split(whereSeparator: { $0.isWhitespace }).map(String.init)
        guard parts.count == 5 else { throw NativeSimpleError.message("Expected exactly five cron fields (minute hour day-of-month month day-of-week); received \(parts.count).") }
        let months = ["jan":1,"feb":2,"mar":3,"apr":4,"may":5,"jun":6,"jul":7,"aug":8,"sep":9,"oct":10,"nov":11,"dec":12]
        let weekdays = ["sun":0,"mon":1,"tue":2,"wed":3,"thu":4,"fri":5,"sat":6]
        let mi = try developerCronField(parts[0], min: 0, max: 59)
        let hr = try developerCronField(parts[1], min: 0, max: 23)
        let dom = try developerCronField(parts[2], min: 1, max: 31)
        let mon = try developerCronField(parts[3], min: 1, max: 12, names: months)
        let dow = try developerCronField(parts[4], min: 0, max: 7, names: weekdays, dow: true)
        var cursor = Calendar.current.date(bySetting: .second, value: 0, of: Date()) ?? Date()
        cursor = Calendar.current.date(bySetting: .nanosecond, value: 0, of: cursor) ?? cursor
        cursor = Calendar.current.date(byAdding: .minute, value: 1, to: cursor) ?? cursor
        let end = Calendar.current.date(byAdding: .day, value: 366, to: cursor) ?? cursor
        var runs: [[String: String]] = []
        let localFmt = DateFormatter(); localFmt.locale = Locale(identifier: "en_US_POSIX"); localFmt.timeZone = .current; localFmt.dateFormat = "yyyy-MM-dd HH:mm zzz"
        let utcFmt = ISO8601DateFormatter(); utcFmt.timeZone = TimeZone(secondsFromGMT: 0)
        while cursor <= end && runs.count < 10 {
            let c = Calendar.current.dateComponents([.minute,.hour,.day,.month,.weekday], from: cursor)
            let dayNumber = ((c.weekday ?? 1) - 1) % 7
            let dayMatches = dom.values.contains(c.day ?? -1); let weekdayMatches = dow.values.contains(dayNumber)
            let validDay = dom.wildcard ? weekdayMatches : (dow.wildcard ? dayMatches : (dayMatches || weekdayMatches))
            if mi.values.contains(c.minute ?? -1), hr.values.contains(c.hour ?? -1), mon.values.contains(c.month ?? -1), validDay {
                runs.append(["local": localFmt.string(from: cursor), "utc": utcFmt.string(from: cursor)])
            }
            cursor = Calendar.current.date(byAdding: .minute, value: 1, to: cursor) ?? end.addingTimeInterval(60)
        }
        guard !runs.isEmpty else { throw NativeSimpleError.message("No matching cron run found in the next 366 days.") }
        return prettyJSONObject(["normalized": parts.joined(separator: " "), "timezone": TimeZone.current.identifier, "explanation": "Five-field cron: minute hour day-of-month month day-of-week. Times use the device time zone. Vixie-style semantics: when both day fields are restricted (neither starts with *), either matching field triggers; a leading * including */step marks that field wildcard-driven. Confirm this edge case with your target scheduler.", "nextRuns": runs])
    }

    private static func developerJSONPath(_ raw: String, path: String) throws -> String {
        let root = try JSONSerialization.jsonObject(with: Data(raw.utf8), options: [.fragmentsAllowed])
        var normalized = path.trimmingCharacters(in: .whitespacesAndNewlines)
        if normalized.isEmpty || normalized == "$" || normalized == "." { return try jsonValue(raw, pretty: true) }
        guard normalized.hasPrefix("$") || normalized.hasPrefix(".") else { throw NativeSimpleError.message("JSON path must start with '$' or '.'.") }
        if normalized.hasPrefix("$") { normalized.removeFirst() }
        if normalized.hasPrefix(".") { normalized.removeFirst() }
        let pattern = try NSRegularExpression(pattern: #"\.?([^\.\[\]]+)|\[(\d+|\*|'[^']+'|"[^"]+")\]"#)
        let range = NSRange(normalized.startIndex..., in: normalized)
        let matches = pattern.matches(in: normalized, range: range)
        var consumed = ""
        var tokens: [Any] = []
        for match in matches {
            if let r = Range(match.range, in: normalized) { consumed += String(normalized[r]) }
            if let r = Range(match.range(at: 1), in: normalized) { tokens.append(String(normalized[r])) }
            else if let r = Range(match.range(at: 2), in: normalized) {
                let token = String(normalized[r])
                if token == "*" { tokens.append("*") }
                else if let n = Int(token) { tokens.append(n) }
                else { tokens.append(String(token.dropFirst().dropLast())) }
            }
        }
        guard !tokens.isEmpty, normalized.replacingOccurrences(of: #"[\.\[\]'" ]"#, with: "", options: .regularExpression).isEmpty || !matches.isEmpty else { throw NativeSimpleError.message("Unsupported JSON path. Use $.user.name, $.items[0].id, or $['display-name'].") }
        var values: [Any] = [root]
        for token in tokens {
            values = values.flatMap { value -> [Any] in
                if let wildcard = token as? String, wildcard == "*" {
                    if let array = value as? [Any] { return array }
                    if let dict = value as? [String: Any] { return dict.keys.sorted().compactMap { dict[$0] } }
                    return []
                }
                if let index = token as? Int, let array = value as? [Any], index >= 0, index < array.count { return [array[index]] }
                if let key = token as? String, let dict = value as? [String: Any], let found = dict[key] { return [found] }
                return []
            }
        }
        guard !values.isEmpty else { throw NativeSimpleError.message("JSON path '\(path)' did not match any value.") }
        let value: Any = values.count == 1 ? values[0] : values
        let data = try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys, .fragmentsAllowed])
        return String(data: data, encoding: .utf8) ?? ""
    }

    private static func developerTemplate(_ op: String, input: String, secondary: String) -> String? {
        let lower = op.lowercased(); let subject = input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? secondary.trimmingCharacters(in: .whitespacesAndNewlines) : input.trimmingCharacters(in: .whitespacesAndNewlines)
        if lower.contains("gitignore") && lower.contains("generator") {
            let stack = subject.isEmpty ? "node" : subject.lowercased()
            let specific = stack.contains("python") ? "__pycache__/\n*.py[cod]\n.venv/\n.pytest_cache/\n" : stack.contains("swift") ? ".build/\nDerivedData/\nxcuserdata/\n" : stack.contains("android") || stack.contains("kotlin") ? ".gradle/\nbuild/\nlocal.properties\n" : stack.contains("rust") ? "target/\n" : "node_modules/\ndist/\nbuild/\ncoverage/\n"
            return "# OS/editor\n.DS_Store\nThumbs.db\n.idea/\n.vscode/\n\n# Secrets\n.env\n.env.*\n!.env.example\n*.pem\n*.key\n\n# Logs\n*.log\nlogs/\n\n# Stack: \(stack)\n\(specific)"
        }
        if lower.contains("docker-compose") && (lower.contains("generator") || lower.contains("builder")) { return "services:\n  app:\n    build: .\n    restart: unless-stopped\n    ports:\n      - \"3000:3000\"\n    environment:\n      NODE_ENV: production\n    # Supply secrets at deploy time; do not commit credentials.\n" }
        if (lower.contains("dockerfile") && (lower.contains("helper") || lower.contains("generator"))) || (lower.contains("docker") && lower.contains("generator")) { return "FROM node:22-alpine AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\nFROM node:22-alpine AS runtime\nENV NODE_ENV=production\nWORKDIR /app\nCOPY --from=build /app/package*.json ./\nRUN npm ci --omit=dev\nCOPY --from=build /app/dist ./dist\nUSER node\nEXPOSE 3000\n# Verify the entry point matches your application.\nCMD [\"node\",\"dist/server.js\"]\n" }
        if lower.contains("editorconfig") && lower.contains("generator") { return "root = true\n\n[*]\ncharset = utf-8\nend_of_line = lf\ninsert_final_newline = true\ntrim_trailing_whitespace = true\n\n[*.{js,jsx,ts,tsx,json,css,html,yml,yaml,md}]\nindent_style = space\nindent_size = 2\n\n[*.{kt,kts,java,swift,py,go,rs}]\nindent_style = space\nindent_size = 4\n\n[Makefile]\nindent_style = tab\n" }
        if (lower.contains("environment-variable") || lower.contains("env-var")) && lower.contains("generator") { let keys = subject.components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespacesAndNewlines).uppercased().replacingOccurrences(of: "[^A-Z0-9_]", with: "_", options: .regularExpression) }.filter { !$0.isEmpty }; return "# Example only; never place real credentials here.\n" + (keys.isEmpty ? ["APP_ENV", "API_BASE_URL", "LOG_LEVEL"] : Array(Set(keys)).sorted()).map { "\($0)=" }.joined(separator: "\n") + "\n" }
        if lower.contains("openapi") && lower.contains("generator") { return "openapi: 3.1.0\ninfo:\n  title: \(subject.isEmpty ? "Example API" : subject)\n  version: 1.0.0\n  description: Example contract; review all paths and schemas before publishing.\nservers:\n  - url: https://api.example.com\npaths:\n  /health:\n    get:\n      operationId: getHealth\n      responses:\n        '200':\n          description: Service is healthy\n          content:\n            application/json:\n              schema:\n                type: object\n                properties:\n                  status:\n                    type: string\n                    const: ok\n" }
        if lower.contains("readme") && lower.contains("generator") { return "# \(subject.isEmpty ? "Project Name" : subject)\n\nDescribe what the project does and who it serves.\n\n## Features\n- Core capability\n- Important constraints and privacy model\n\n## Requirements\nDocument supported runtime and tool versions.\n\n## Getting started\n\n```sh\nnpm ci\nnpm run dev\n```\n\n## Configuration\nUse environment-specific configuration and never commit secrets.\n\n## Tests\n```sh\nnpm test\n```\n\n## License\nDocument the repository's actual license.\n" }
        if lower.contains("license") && lower.contains("generator") { return "MIT License\n\nCopyright (c) \(Calendar.current.component(.year, from: Date())) \(subject.isEmpty ? "[Copyright holder]" : subject)\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the \"Software\"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND.\n" }
        if lower.contains("nginx") && lower.contains("generator") { return "server {\n    listen 80;\n    server_name example.com;\n    root /usr/share/nginx/html;\n    index index.html;\n    location / { try_files $uri $uri/ =404; }\n    location ~ /\\. { deny all; }\n}\n" }
        if lower.contains("cors") && (lower.contains("generator") || lower.contains("builder") || lower.contains("helper")) { return "# Example CORS policy. Replace with explicit trusted origins.\nAccess-Control-Allow-Origin: https://app.example.com\nVary: Origin\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\nAccess-Control-Allow-Headers: Content-Type, Authorization\nAccess-Control-Max-Age: 600\n# Never reflect arbitrary Origin values when credentials are enabled.\n" }
        if (lower.contains("csp") || lower.contains("content-security-policy")) && (lower.contains("generator") || lower.contains("builder") || lower.contains("helper")) { return "Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; upgrade-insecure-requests\n# Add only reviewed script/style/image/connect sources required by your app.\n" }
        if lower.contains("graphql") && (lower.contains("generator") || lower.contains("builder") || lower.contains("query")) { return "query ExampleQuery($id: ID!) {\n  node(id: $id) {\n    id\n    __typename\n  }\n}\n\n# Variables JSON starter:\n{\n  \"id\": \"replace-with-node-id\"\n}\n" }
        if lower.contains("docker") && (lower.contains("generator") || lower.contains("builder") || lower.contains("helper")) { return "FROM node:22-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nEXPOSE 3000\nCMD [\"npm\",\"start\"]\n" }
        if lower.contains("branch-name") && lower.contains("generator") { let clean = subject.lowercased().replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression).trimmingCharacters(in: CharacterSet(charactersIn: "-")); return "feature/\(clean.isEmpty ? "describe-change" : clean)\nfix/\(clean.isEmpty ? "describe-change" : clean)\n" }
        if lower.contains("commit-message") && (lower.contains("helper") || lower.contains("generator")) { return "feat: describe the user-visible change\n\nExplain why the change is needed and note behavior or migration impacts.\n" }
        if lower.contains("changelog") && lower.contains("generator") { return "# Changelog\n\n## Unreleased\n### Added\n- Describe new behavior.\n\n### Changed\n- Describe behavior changes.\n\n### Fixed\n- Describe corrected defects.\n" }
        if (lower.contains("semantic-version") || lower.contains("semver")) && (lower.contains("calculator") || lower.contains("generator") || lower.contains("helper")) { let parts = subject.split(separator: ".").compactMap { Int($0) }; guard parts.count >= 3 else { return "Enter a version like 1.2.3; major changes break compatibility, minor changes add compatible features, patch changes fix bugs." }; return "Current: \(parts[0]).\(parts[1]).\(parts[2])\nPatch: \(parts[0]).\(parts[1]).\(parts[2] + 1)\nMinor: \(parts[0]).\(parts[1] + 1).0\nMajor: \(parts[0] + 1).0.0\n" }
        if lower.contains("gitignore-generator") { return "# Generated .gitignore\n.DS_Store\n.env\nnode_modules/\ndist/\nbuild/\n*.log\n" }
        if lower.contains("license") && lower.contains("generator") { return "MIT License\n" }
        if lower.contains("jwt-payload") || lower.contains("jwt-builder") { return "{\n  \"sub\": \"user-id\",\n  \"iss\": \"https://issuer.example\",\n  \"aud\": \"example-api\",\n  \"iat\": 0,\n  \"exp\": 3600\n}\n" }
        if lower.contains("webhook-payload") { let raw=subject.trimmingCharacters(in:.whitespacesAndNewlines); let dataValue=raw.isEmpty ? nil : (try? JSONSerialization.jsonObject(with:Data(raw.utf8),options:[.fragmentsAllowed])); let eventType=(dataValue == nil && !raw.isEmpty) ? raw : "resource.updated"; let data:Any=dataValue ?? ["id":"record_123","status":"created"]; return prettyJSONObject(["id":"evt_example_001","type":eventType,"createdAt":"2026-01-01T00:00:00.000Z","data":data,"meta":["generatedLocally":true,"signature":"not-provided"]])+"\n" }
        return nil
    }

    private static func runDeveloperParity(_ op:String,input:String,options o:[String:String]) throws -> String {
        let lower=op.lowercased(), secondary=o["secondary"] ?? o["test"] ?? o["second"] ?? "", flags=o["flags"] ?? "g"
        let base=lower.replacingOccurrences(of:"^developer-",with:"",options:.regularExpression).components(separatedBy:"-").first ?? lower
        let suffixPattern=try! NSRegularExpression(pattern:"(?:^|-)(formatter|validator|beautifier|minifier|parser|converter|generator|diff|inspector|preview|tester|decoder|encoder|explainer|helper|builder|calculator|lookup|checker|compare)$")
        let suffix=suffixPattern.firstMatch(in:lower,range:NSRange(lower.startIndex...,in:lower)).flatMap{Range($0.range(at:1),in:lower).map{String(lower[$0])}} ?? ""
        func json(_ raw:String)throws -> Any { try JSONSerialization.jsonObject(with:Data(raw.utf8),options:[.fragmentsAllowed]) }
        func pretty(_ raw:String)throws -> String { try Self.jsonValue(raw,pretty:true) }
        func compact(_ value:Any)throws -> String { let data=try JSONSerialization.data(withJSONObject:value,options:[.fragmentsAllowed,.sortedKeys]); return String(data:data,encoding:.utf8) ?? "" }
        func jsonDiff(_ leftRaw:String,_ rightRaw:String)throws -> String {
            // Compare JSON values rather than formatted lines: key order and whitespace should not
            // produce false positives. Missing members are distinct from explicit JSON nulls.
            let left=try json(leftRaw), right=try json(rightRaw)
            var changes:[[String:Any]]=[], truncated=false
            func canonical(_ value:Any)->String {
                if let object=value as? [String:Any] { return "{" + object.keys.sorted().map{((try? compact($0)) ?? "\"\($0)\"")+":"+canonical(object[$0]!)}.joined(separator:",") + "}" }
                if let array=value as? [Any] { return "["+array.map{canonical($0)}.joined(separator:",")+"]" }
                return (try? compact(value)) ?? String(describing:value)
            }
            func add(_ type:String,_ path:String,_ before:Any?,_ after:Any?) {
                if changes.count >= 500 { truncated=true;return }
                var row:[String:Any] = ["type":type,"path":path]
                if let before {row["before"]=before};if let after {row["after"]=after};changes.append(row)
            }
            func walk(_ a:Any?,_ b:Any?,_ path:String,_ depth:Int) {
                if changes.count >= 500 {truncated=true;return}
                if depth > 100 {add("depth-limit",path,a,b);return}
                guard let a else {add("added",path,nil,b);return};guard let b else {add("removed",path,a,nil);return}
                if let lhs=a as? [String:Any],let rhs=b as? [String:Any] {
                    for key in Set(lhs.keys).union(rhs.keys).sorted() { let escaped=(try? compact(key)) ?? String(describing:key);walk(lhs[key],rhs[key],"\(path)[\(escaped)]",depth+1) }
                } else if let lhs=a as? [Any],let rhs=b as? [Any] {
                    for index in 0..<max(lhs.count,rhs.count) {walk(index<lhs.count ? lhs[index] : nil,index<rhs.count ? rhs[index] : nil,"\(path)[\(index)]",depth+1)}
                } else if canonical(a) != canonical(b) {add("changed",path,a,b)}
            }
            walk(left,right,"$",0)
            return prettyJSONObject(["equal":changes.isEmpty && !truncated,"changeCount":changes.count,"changes":changes,"truncated":truncated,"note":"Whitespace and object key order are ignored. Arrays are compared by index; this is not a move-aware diff."])
        }
        func sortValue(_ value:Any)->Any {
            if let dict=value as? [String:Any] { var out:[String:Any]=[:]; for key in dict.keys.sorted() {out[key]=sortValue(dict[key]!)}; return out }
            if let array=value as? [Any] {return array.map{sortValue($0)}}
            return value
        }
        func minifyText(_ value:String)->String { value.replacingOccurrences(of:"/\\*[\\s\\S]*?\\*/",with:"",options:.regularExpression).replacingOccurrences(of:"<!--[\\s\\S]*?-->",with:"",options:.regularExpression).replacingOccurrences(of:"\\s+",with:" ",options:.regularExpression).trimmingCharacters(in:.whitespacesAndNewlines) }
        func formatSQL(_ raw:String)->String {
            var text=raw.trimmingCharacters(in:.whitespacesAndNewlines).replacingOccurrences(of:"\\s+",with:" ",options:.regularExpression)
            guard !text.isEmpty else { return "" }
            text=text.replacingOccurrences(of:#"(?i)\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|VALUES|SET|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|ON|UNION|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE)\b"#,with:"\n$1",options:.regularExpression)
            text=text.replacingOccurrences(of:"\\s*,\\s*",with:", ",options:.regularExpression)
            return text.trimmingCharacters(in:.whitespacesAndNewlines)
        }
        func formatCSS(_ raw:String)->String {
            var text=raw.replacingOccurrences(of:"/\\*[\\s\\S]*?\\*/",with:"",options:.regularExpression).trimmingCharacters(in:.whitespacesAndNewlines)
            text=text.replacingOccurrences(of:"\\s*\\{\\s*",with:" {\n  ",options:.regularExpression)
            text=text.replacingOccurrences(of:"\\s*;\\s*",with:";\n  ",options:.regularExpression)
            text=text.replacingOccurrences(of:"\\s*\\}\\s*",with:"\n}\n\n",options:.regularExpression)
            return text.trimmingCharacters(in:.whitespacesAndNewlines)+(text.isEmpty ? "" : "\n")
        }
        func localSuffixFallback(_ familyRaw:String)->String {
            let family=familyRaw.replacingOccurrences(of:"developer-",with:"").lowercased()
            let bytes=input.utf8.count
            let note:String
            if family.contains("yaml") { note="YAML checks here are lightweight and do not replace a full parser or schema validator." }
            else if family.contains("sql") { note="SQL syntax varies by dialect; this does not execute SQL or inspect a database schema." }
            else if family.contains("graphql") { note="GraphQL type validation requires the target schema; this operation performs structural checks only." }
            else if family.contains("jwt") { note="JWT decoding is not signature verification; claims remain untrusted until a separate verifier validates policy and signature." }
            else if family.contains("docker") || family.contains("nginx") || family.contains("kubernetes") || family.contains("openapi") { note="Review this local result against your toolchain and deployed version; it does not execute or fully validate configuration." }
            else if family.contains("hash") { note="Hashes are one-way digests, not encryption; MD5 and SHA-1 are legacy algorithms." }
            else { note="This local utility does not execute code or send input to a server." }
            switch suffix {
            case "explainer": return "\(family.uppercased()) — local explanation\n\n\(note)\n\nInput: \(input.count) characters, \(bytes) UTF-8 bytes, \(input.isEmpty ? 0 : input.components(separatedBy:.newlines).count) lines."
            case "inspector": return prettyJSONObject(["tool":op,"family":family,"characters":input.count,"utf8Bytes":bytes,"lines":input.isEmpty ? 0 : input.components(separatedBy:.newlines).count,"words":input.split(whereSeparator:{$0.isWhitespace}).count,"delimiterCounts":["openCurly":input.filter{$0=="{"}.count,"closeCurly":input.filter{$0=="}"}.count,"openRound":input.filter{$0=="("}.count,"closeRound":input.filter{$0==")"}.count],"preview":String(input.prefix(500)),"note":note])
            case "parser": return prettyJSONObject(["family":family,"lines":input.components(separatedBy:.newlines).enumerated().map{["line":$0.offset+1,"empty":$0.element.isEmpty,"text":$0.element] as [String:Any]},"note":"Line-oriented local parse view; no complete parser is bundled for this mode."])
            case "preview": return prettyJSONObject(["family":family,"preview":String(input.prefix(2000)),"truncated":input.count>2000,"characters":input.count,"utf8Bytes":bytes,"note":note])
            case "validator", "tester":
                if input.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty { return "Enter \(family) input to check." }
                var stack:[Character]=[], quote:Character?=nil, escaped=false
                for (index,ch) in input.enumerated() { if let q=quote { if escaped {escaped=false} else if ch=="\\" {escaped=true} else if ch==q {quote=nil}; continue }; if ch=="\"" || ch=="'" {quote=ch;continue}; if "([{\u{20}".contains(ch) && ch != " " {stack.append(ch)} else if ")] }".contains(ch) && ch != " " { let expected:Character = ch==")" ? "(" : ch=="]" ? "[" : "{"; guard stack.last==expected else {return "Unmatched or misordered closing delimiter '\(ch)' at character \(index+1)."};stack.removeLast() } }
                if quote != nil { return "Unterminated quoted string; this is a basic structural check, not a language parser." };if let last=stack.last {return "Unclosed delimiter '\(last)'."};return "\(family.uppercased()) structural check passed: quotes and delimiters are balanced. This is not full syntax, schema, type or runtime validation."
            case "formatter", "beautifier": return input.replacingOccurrences(of:"\r\n",with:"\n").replacingOccurrences(of:"\r",with:"\n").components(separatedBy:"\n").map{$0.trimmingCharacters(in:.whitespacesAndNewlines)}.joined(separator:"\n").trimmingCharacters(in:.newlines)+"\n"
            case "minifier": return input.replacingOccurrences(of:"\r\n",with:"\n").replacingOccurrences(of:"\r",with:"\n").components(separatedBy:"\n").map{$0.trimmingCharacters(in:.whitespacesAndNewlines)}.filter{!$0.isEmpty}.joined(separator:"\n")
            case "generator":
                switch family {
                case "json": return "{\"id\":\"example-1\",\"active\":true,\"items\":[]}"
                case "csv": return "id,name,active\n1,Ada,true\n2,Grace,true"
                case "yaml": return "app:\n  name: example\n  enabled: true\n"
                case "markdown": return "# Project title\n\nDescribe the purpose of this project.\n"
                case "graphql": return "query Example($id: ID!) {\n  node(id: $id) { id __typename }\n}\n"
                case "kubernetes": return "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: example-config\ndata:\n  APP_ENV: \"development\"\n"
                case "http": return "GET /health HTTP/1.1\nHost: api.example.com\nAccept: application/json\n"
                case "uuid": return UUID().uuidString.lowercased()
                default: return "No domain-specific starter preset exists for \(family). Provide an input or use its dedicated generator."
                }
            case "converter": return input.replacingOccurrences(of:"\r\n",with:"\n").replacingOccurrences(of:"\r",with:"\n")
            case "encoder": return (try? encode("base64",input)) ?? input
            case "decoder": return (try? decode("base64",input)) ?? "Invalid encoded input; confirm the selected encoding and try again."
            default: return input
            }
        }
        func markdownToHTML(_ raw:String)->String {
            func esc(_ value:String)->String { value.replacingOccurrences(of:"&",with:"&amp;").replacingOccurrences(of:"<",with:"&lt;").replacingOccurrences(of:">",with:"&gt;").replacingOccurrences(of:"\"",with:"&quot;").replacingOccurrences(of:"'",with:"&#39;") }
            var out:[String]=[],paragraph:[String]=[],code:[String]=[],inCode=false
            func flush() {if !paragraph.isEmpty {out.append("<p>\(paragraph.map(esc).joined(separator:" "))</p>");paragraph=[]}}
            for line in raw.replacingOccurrences(of:"\r\n",with:"\n").components(separatedBy:"\n") { if line.trimmingCharacters(in:.whitespaces).hasPrefix("```") {flush();if inCode {out.append("<pre><code>\(esc(code.joined(separator:"\n")))</code></pre>");code=[];inCode=false}else{inCode=true};continue };if inCode {code.append(line);continue};if line.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty{flush();continue};let trimmed=line.trimmingCharacters(in:.whitespaces);if let match=trimmed.range(of:#"^#{1,6}\s+"#,options:.regularExpression){flush();let prefix=String(trimmed[..<match.upperBound]);let level=prefix.filter{$0=="#"}.count;out.append("<h\(level)>\(esc(String(trimmed[match.upperBound...])) )</h\(level)>")}else{paragraph.append(trimmed)} }
            flush();if inCode {out.append("<pre><code>\(esc(code.joined(separator:"\n")))</code></pre>")};return out.joined(separator:"\n")
        }
        func csvRows(_ value:String)->[[String]] {
            let chars=Array(value); var rows:[[String]]=[],row:[String]=[],cell="",quoted=false,i=0
            while i<chars.count {let ch=chars[i]; if ch=="\"" {if quoted && i+1<chars.count && chars[i+1]=="\"" {cell.append("\"");i+=1} else {quoted.toggle()}} else if ch=="," && !quoted {row.append(cell);cell=""} else if (ch=="\n" || ch=="\r") && !quoted {if ch=="\r" && i+1<chars.count && chars[i+1]=="\n" {i+=1};row.append(cell);cell="";if row.contains(where:{!$0.isEmpty}) {rows.append(row)};row=[]} else {cell.append(ch)};i+=1 }
            row.append(cell);if row.contains(where:{!$0.isEmpty}) {rows.append(row)};return rows
        }
        func csvString(_ rows:[[String]])->String { rows.map{$0.map{cell in cell.rangeOfCharacter(from:CharacterSet(charactersIn:",\"\n\r")) != nil ? "\"\(cell.replacingOccurrences(of:"\"",with:"\"\""))\"" : cell}.joined(separator:",")}.joined(separator:"\n") }
        func csvToJSON(_ value:String)throws -> String {
            let rows=csvRows(value);guard !rows.isEmpty else{return "[]"};let headers=rows[0]
            let objects=rows.dropFirst().map{row -> [String:String] in var object:[String:String]=[:];for (i,key) in headers.enumerated(){object[key.isEmpty ? "column_\(i+1)":key]=i<row.count ? row[i]:""};return object}
            let data=try JSONSerialization.data(withJSONObject:objects,options:[.prettyPrinted,.sortedKeys]);return String(data:data,encoding:.utf8) ?? "[]"
        }
        func csvCell(_ value:Any?)->String {
            guard let value,!(value is NSNull) else{return ""}
            let text:String
            if value is [String:Any] || value is [Any] {text=(try? compact(value)) ?? ""} else if let number=value as? NSNumber {text=number.stringValue} else {text=String(describing:value)}
            return text.rangeOfCharacter(from:CharacterSet(charactersIn:",\"\n\r")) != nil ? "\"\(text.replacingOccurrences(of:"\"",with:"\"\""))\"" : text
        }
        func jsonToCSV(_ raw:String)throws -> String {
            guard let array=try json(raw) as? [Any] else {throw NativeSimpleError.message("Expected a JSON array of objects.")}
            var keys:[String]=[];for item in array {if let object=item as? [String:Any] {for key in object.keys.sorted() where !keys.contains(key){keys.append(key)}}};guard !keys.isEmpty else{return ""}
            return csvString([keys]+array.map{item in let object=item as? [String:Any] ?? [:];return keys.map{csvCell(object[$0])}})
        }
        func encode(_ kind:String,_ value:String)throws -> String {
            switch kind {
            case "base64": return Data(value.utf8).base64EncodedString()
            case "uri": return value.utf8.map{byte -> String in let c=UnicodeScalar(byte);let allowed=(byte>=65 && byte<=90)||(byte>=97 && byte<=122)||(byte>=48 && byte<=57)||"-_.!~*'()".utf8.contains(byte);return allowed ? String(c) : String(format:"%%%02X",byte)}.joined()
            case "unicode": return value.unicodeScalars.map{String(format:"\\u%04x",$0.value)}.joined()
            case "html": return value.replacingOccurrences(of:"&",with:"&amp;").replacingOccurrences(of:"<",with:"&lt;").replacingOccurrences(of:">",with:"&gt;").replacingOccurrences(of:"\"",with:"&quot;").replacingOccurrences(of:"'",with:"&#39;")
            default:return value
            }
        }
        func decode(_ kind:String,_ value:String)throws -> String {
            switch kind {
            case "base64": guard let data=Data(base64Encoded:value.filter{!$0.isWhitespace}) else {throw NativeSimpleError.message("The string to be decoded is not correctly encoded.")};return String(data:data,encoding:.utf8) ?? ""
            case "uri": guard let decoded=value.replacingOccurrences(of:"+",with:"%20").removingPercentEncoding else {throw NativeSimpleError.message("URI malformed")};return decoded
            case "unicode":
                let pattern=try! NSRegularExpression(pattern:"\\\\u([0-9a-fA-F]{4})");let matches=pattern.matches(in:value,range:NSRange(value.startIndex...,in:value));var output=value
                for match in matches.reversed(){if let full=Range(match.range,in:output),let digits=Range(match.range(at:1),in:output),let code=UInt16(output[digits],radix:16),let scalar=UnicodeScalar(code){output.replaceSubrange(full,with:String(scalar))}}
                return output
            case "html": return value.replacingOccurrences(of:"&lt;",with:"<").replacingOccurrences(of:"&gt;",with:">").replacingOccurrences(of:"&quot;",with:"\"").replacingOccurrences(of:"&#39;",with:"'").replacingOccurrences(of:"&amp;",with:"&")
            default:return value
            }
        }
        func urlInfo()throws -> String {do{return try Self.developerURLInfo(input)}catch{throw NativeSimpleError.message("Failed to construct 'URL': Invalid URL")}}
        func validURL()throws -> String {guard let components=URLComponents(string:input.trimmingCharacters(in:.whitespacesAndNewlines)),components.scheme != nil else{throw NativeSimpleError.message("Failed to construct 'URL': Invalid URL")};return "Valid URL/URI"}
        func validMarkup(_ value:String)->Bool {XMLParser(data:Data(value.utf8)).parse()}
        let statuses=[("200","OK"),("201","Created"),("204","No Content"),("301","Moved Permanently"),("302","Found"),("304","Not Modified"),("400","Bad Request"),("401","Unauthorized"),("403","Forbidden"),("404","Not Found"),("405","Method Not Allowed"),("409","Conflict"),("422","Unprocessable Content"),("429","Too Many Requests"),("500","Internal Server Error"),("502","Bad Gateway"),("503","Service Unavailable"),("504","Gateway Timeout")]
        let mime=[("json","application/json"),("js","text/javascript"),("css","text/css"),("html","text/html"),("csv","text/csv"),("xml","application/xml"),("pdf","application/pdf"),("png","image/png"),("jpg","image/jpeg"),("jpeg","image/jpeg"),("webp","image/webp"),("svg","image/svg+xml"),("txt","text/plain"),("wasm","application/wasm")]

        if lower.contains("data-uri") {
            if lower.hasSuffix("decoder") {
                guard input.hasPrefix("data:"), let comma=input.firstIndex(of:",") else { throw NativeSimpleError.message("Enter a valid data URI containing a comma separator.") }
                let metadata=String(input[..<comma]), payload=String(input[input.index(after:comma)...])
                if metadata.lowercased().hasSuffix(";base64") { guard let data=Data(base64Encoded:payload), let text=String(data:data,encoding:.utf8) else { throw NativeSimpleError.message("The data URI does not contain valid UTF-8 base64 text.") }; return text }
                guard let text=payload.removingPercentEncoding else { throw NativeSimpleError.message("The data URI payload contains invalid percent encoding.") }; return text
            }
            return "data:text/plain;base64,\(Data(input.utf8).base64EncodedString())"
        }
        if lower.contains("file-hash") { throw NativeSimpleError.message("Choose a file to calculate its hash locally on this device.") }
        if lower.contains("hash-compare") || lower.contains("hash-diff") { let left = input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().filter { !$0.isWhitespace }; let right = secondary.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().filter { !$0.isWhitespace }; guard !left.isEmpty && !right.isEmpty else { throw NativeSimpleError.message("Enter both hash values to compare.") }; let equal = left.count == right.count && zip(left, right).reduce(0) { $0 | (Int($1.0.asciiValue ?? 0) ^ Int($1.1.asciiValue ?? 0)) } == 0; return prettyJSONObject(["equal": equal, "leftLength": left.count, "rightLength": right.count, "caseInsensitive": true, "note": "Comparison normalizes case and whitespace; it does not verify a signature."]) }
        if lower.contains("hash") && suffix == "decoder" { throw NativeSimpleError.message("Cryptographic hashes are one-way digests and cannot be decoded to the original input.") }
        if lower.contains("hash") && suffix == "explainer" { return "A hash maps input bytes to a fixed-length digest; it is not encryption. MD5 and SHA-1 are legacy algorithms and unsuitable for modern collision-resistant security. Passwords require a dedicated password-hashing scheme. Processing remains local." }
        if lower.contains("hash") && (suffix == "inspector" || suffix == "parser") { let compact=input.filter{ !$0.isWhitespace }; let algorithms:[Int:String]=[32:"MD5",40:"SHA-1",64:"SHA-256",96:"SHA-384",128:"SHA-512"]; return prettyJSONObject(["characters":input.count,"hexadecimal":!compact.isEmpty && compact.allSatisfy{$0.isHexDigit},"possibleAlgorithm":algorithms[compact.count] ?? NSNull() as Any,"note":"Digest length suggests a format; it does not verify authenticity."]) }
        if lower.contains("hash") && (suffix == "formatter" || suffix == "beautifier") { let compact=input.filter{ !$0.isWhitespace }; guard !compact.isEmpty && compact.allSatisfy({$0.isHexDigit}) else { throw NativeSimpleError.message("A hash digest must contain hexadecimal characters only.") }; return stride(from:0,to:compact.count,by:8).map { let start=compact.index(compact.startIndex,offsetBy:$0),end=compact.index(start,offsetBy:min(8,compact.distance(from:start,to:compact.endIndex))); return String(compact[start..<end]).lowercased() }.joined(separator:" ") }
        if lower.contains("hash") { return Self.developerHashJSON(op: lower, data: Data(input.utf8)) }
        if lower.contains("unix-timestamp") || lower.contains("timestamp-converter") { return try Self.developerTimestamp(input) }
        if lower.contains("cron") {
            if suffix=="encoder" { let expression=input.trimmingCharacters(in:.whitespacesAndNewlines);_ = try Self.developerCron(expression);return try encode("base64",expression) }
            if suffix=="decoder" { let expression=try decode("base64",input).trimmingCharacters(in:.whitespacesAndNewlines);let report=try Self.developerCron(expression);return expression+"\n\n"+report }
            let expression=input.trimmingCharacters(in:.whitespacesAndNewlines)
            return try Self.developerCron(expression.isEmpty && lower.contains("generator") ? "*/5 * * * *" : expression)
        }
        if lower.contains("json-path") || lower.contains("jsonpath") { return try Self.developerJSONPath(input, path: secondary.isEmpty ? "$" : secondary) }
        if lower.contains("query-string-parser") || lower.contains("query-parser") || lower == "url-query-parser" {
            let trimmed=input.trimmingCharacters(in:.whitespacesAndNewlines)
            let raw=(trimmed.contains("?") ? String(trimmed.split(separator:"?",maxSplits:1,omittingEmptySubsequences:false).last ?? "") : trimmed).components(separatedBy:"#").first ?? ""
            var entries:[[String:String]]=[];var grouped:[String:[String]] = [:]
            if !raw.isEmpty { for part in raw.split(separator:"&",omittingEmptySubsequences:false) where !part.isEmpty { let pair=part.split(separator:"=",maxSplits:1,omittingEmptySubsequences:false);guard let key=String(pair.first ?? "").replacingOccurrences(of:"+",with:" ").removingPercentEncoding,let value=String(pair.count>1 ? pair[1] : "").replacingOccurrences(of:"+",with:" ").removingPercentEncoding else {throw NativeSimpleError.message("Invalid percent escape in query string.")};entries.append(["key":key,"value":value]);grouped[key,default:[]].append(value) } }
            return prettyJSONObject(["count":entries.count,"entries":entries,"grouped":grouped])
        }
        if (lower.contains("query-string-builder") || lower.contains("query-builder")) && !lower.contains("sql") && !lower.contains("graphql") {
            var pairs:[(String,String)]=[]
            if let data=input.data(using:.utf8),let parsed=try? JSONSerialization.jsonObject(with:data) {
                if let obj=parsed as? [String:Any] { for key in obj.keys.sorted() { let value=obj[key] ?? NSNull();if let many=value as? [Any] { for item in many { pairs.append((key,item is NSNull ? "" : String(describing:item))) } } else {pairs.append((key,value is NSNull ? "" : String(describing:value)))} } }
                else if let array=parsed as? [[Any]] { for row in array { guard row.count>=2 else {throw NativeSimpleError.message("Each query pair must contain a key and value.")};pairs.append((String(describing:row[0]),String(describing:row[1]))) } }
                else if let array=parsed as? [[String:Any]] { for row in array {pairs.append((String(describing:row["key"] ?? ""),String(describing:row["value"] ?? "")))} }
                else {throw NativeSimpleError.message("JSON must be an object or array of query pairs.")}
            } else {
                pairs=input.components(separatedBy:.newlines).filter{$0.contains("=")}.map{line in let p=line.split(separator:"=",maxSplits:1,omittingEmptySubsequences:false);return (String(p[0]).trimmingCharacters(in:.whitespaces),String(p.count>1 ? p[1] : "").trimmingCharacters(in:.whitespaces))}
            }
            guard !pairs.isEmpty else {throw NativeSimpleError.message("Enter a JSON object, array of key/value pairs, or one key=value pair per line.")}
            func formEncode(_ value:String)->String { var allowed=CharacterSet.alphanumerics;allowed.insert(charactersIn:"*-._");return value.addingPercentEncoding(withAllowedCharacters:allowed)?.replacingOccurrences(of:"%20",with:"+") ?? value }
            return pairs.map{"\(formEncode($0.0))=\(formEncode($0.1))"}.joined(separator:"&")
        }
        if lower.contains("cookie-parser") {
            let rows=input.components(separatedBy:";").map{$0.trimmingCharacters(in:.whitespacesAndNewlines)}.filter{!$0.isEmpty}.map{part -> [String:Any] in guard let idx=part.firstIndex(of:"=") else {return ["name":part,"value":"","hasValue":false]};return ["name":String(part[..<idx]).trimmingCharacters(in:.whitespaces),"value":String(part[part.index(after:idx)...]).trimmingCharacters(in:.whitespaces),"hasValue":true]}
            return prettyJSONObject(["count":rows.count,"cookies":rows])
        }
        if lower.contains("header-builder") {
            var rows:[(String,String)]=[]
            if let data=input.data(using:.utf8),let object=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any] { rows=object.keys.sorted().map{($0,String(describing:object[$0] ?? ""))} }
            else { for line in input.components(separatedBy:.newlines) where !line.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty {guard let idx=line.firstIndex(of:":") else {throw NativeSimpleError.message("Enter headers as JSON or Header-Name: value lines.")};rows.append((String(line[..<idx]).trimmingCharacters(in:.whitespaces),String(line[line.index(after:idx)...]).trimmingCharacters(in:.whitespaces))) } }
            guard !rows.isEmpty else {throw NativeSimpleError.message("Enter headers as JSON or one Header-Name: value per line.")}
            return try rows.map{ name,value in guard name.range(of:#"^[!#$%&'*+.^_`|~0-9A-Za-z-]+$"#,options:.regularExpression) != nil else {throw NativeSimpleError.message("Invalid HTTP header name: \(name)")};guard !value.contains("\r") && !value.contains("\n") else {throw NativeSimpleError.message("Header '\(name)' contains a line break, which is not allowed.")};return "\(name): \(value)" }.joined(separator:"\n")
        }
        if lower.contains("user-agent-parser") {
            let ua=input.trimmingCharacters(in:.whitespacesAndNewlines),l=ua.lowercased()
            let browser=l.contains("edg/") ? "Microsoft Edge" : (l.contains("opr/") || l.contains("opera") ? "Opera" : (l.contains("firefox/") ? "Firefox" : (l.contains("chrome/") || l.contains("crios/") ? "Chrome/Chromium" : (l.contains("safari/") ? "Safari" : "Unknown"))))
            let os=l.contains("android") ? "Android" : ((l.contains("iphone") || l.contains("ipad") || l.contains("cpu os")) ? "iOS/iPadOS" : (l.contains("windows") ? "Windows" : ((l.contains("mac os") || l.contains("macintosh")) ? "macOS" : (l.contains("linux") ? "Linux" : "Unknown"))))
            let version=ua.range(of:#"(?i)(?:edg|opr|firefox|chrome|crios|version)/([0-9.]+)"#,options:.regularExpression).map{String(ua[$0]).components(separatedBy:"/").last ?? ""}
            return prettyJSONObject(["browser":browser,"browserVersion":version as Any? ?? NSNull(),"operatingSystem":os,"mobile":l.contains("mobile") || l.contains("android") || l.contains("iphone") || l.contains("ipad"),"raw":ua,"note":"User-agent strings are self-reported and can be spoofed; classification is heuristic."])
        }
        if let template = Self.developerTemplate(lower, input: input, secondary: secondary) { return template }
        if ["regex-tester","regex-replace","regex-generator","regex-explainer"].contains(where:lower.contains) {
            guard !secondary.isEmpty else{throw NativeSimpleError.message("Enter a sample string, or a JSON array of sample strings, in the second field.")}
            var opts=NSRegularExpression.Options();if flags.contains("i"){opts.insert(.caseInsensitive)};if flags.contains("m"){opts.insert(.anchorsMatchLines)};if flags.contains("s"){opts.insert(.dotMatchesLineSeparators)}
            let pattern=try NSRegularExpression(pattern:input,options:opts)
            var samples=[secondary], batch=false
            // JSON-array batch mode lets developers test independent samples without changing the
            // multiline/global flags. Each sample receives its own match list and replacement preview.
            if secondary.trimmingCharacters(in:.whitespacesAndNewlines).hasPrefix("["), let data=secondary.data(using:.utf8), let parsed=try? JSONSerialization.jsonObject(with:data), let array=parsed as? [Any] {
                guard array.allSatisfy({$0 is String}) else {throw NativeSimpleError.message("Regex batch input must be a JSON array containing only strings.")}
                samples=array.compactMap{$0 as? String};batch=true
            }
            guard !batch || (1...100).contains(samples.count) else {throw NativeSimpleError.message("Regex batch mode accepts between 1 and 100 sample strings.")}
            guard samples.reduce(0,{$0 + $1.utf8.count}) <= 1_000_000 else {throw NativeSimpleError.message("Regex sample input exceeds the 1 MB local processing limit.")}
            let riskRegex=try? NSRegularExpression(pattern:#"\([^)]*[+*][^)]*\)[+*{]|(?:\.\*|\.\+).*(?:\.\*|\.\+)"#)
            let risk=riskRegex?.firstMatch(in:input,range:NSRange(input.startIndex...,in:input)) != nil
            let replacement=o["replacement"] ?? ""
            func analyze(_ sample:String,_ index:Int)->[String:Any] {
                // NSRegularExpression has no portable per-call timeout. Skip long test samples for
                // patterns matching the nested-quantifier heuristic instead of freezing the app.
                let skipped=risk && sample.utf16.count > 24
                let fullRange=NSRange(sample.startIndex...,in:sample)
                let matches=skipped ? [] : pattern.matches(in:sample,range:fullRange)
                let rows=matches.map { match -> [String:Any] in
                    let whole=Range(match.range,in:sample).map{String(sample[$0])} ?? ""
                    let groups=(1..<match.numberOfRanges).map { group -> Any in match.range(at:group).location == NSNotFound ? NSNull() : (Range(match.range(at:group),in:sample).map{String(sample[$0])} ?? "") }
                    return ["match":whole,"index":match.range.location,"endExclusive":match.range.location+match.range.length,"groups":groups]
                }
                var row:[String:Any]=["sampleIndex":index,"sample":sample,"matchCount":matches.count,"matches":rows,"executionSkipped":skipped]
                if lower.contains("replace") { row["preview"]=skipped ? NSNull() : pattern.stringByReplacingMatches(in:sample,range:fullRange,withTemplate:replacement) }
                return row
            }
            let results=samples.enumerated().map{analyze($0.element,$0.offset)}
            let total=results.reduce(0){$0 + (($1["matchCount"] as? Int) ?? 0)}
            let riskNote:Any = risk ? "Potential catastrophic backtracking pattern detected heuristically. Matching is skipped for samples over 24 UTF-16 code units because NSRegularExpression has no portable timeout." : NSNull()
            if batch { return prettyJSONObject(["pattern":input,"flags":flags,"engine":"NSRegularExpression (native Foundation engine; syntax differs from JavaScript RegExp)","mode":"batch","sampleCount":samples.count,"matchCount":total,"results":results,"performanceRisk":riskNote,"replacement":lower.contains("replace") ? replacement : NSNull()]) }
            let first=results[0]
            if lower.contains("replace") { return prettyJSONObject(["pattern":input,"flags":flags,"engine":"NSRegularExpression","preview":first["preview"] ?? NSNull(),"matches":first["matches"] ?? [],"executionSkipped":first["executionSkipped"] ?? false,"performanceRisk":riskNote]) }
            let rows=(first["matches"] as? [[String:Any]] ?? []).enumerated().map{"\($0.offset+1). \(String(describing:$0.element["match"] ?? "")) at index \(String(describing:$0.element["index"] ?? 0))"}.joined(separator:"\n")
            return "Pattern: /\(input)/\nEngine: NSRegularExpression (native Foundation engine; syntax differs from JavaScript RegExp)\nMatches: \(first["matchCount"] as? Int ?? 0)\n\(risk && (first["executionSkipped"] as? Bool == true) ? "Warning: \(riskNote)\n" : "")\n\(rows.isEmpty ? ((first["executionSkipped"] as? Bool == true) ? "Execution skipped for safety" : "No matches") : rows)"
        }
        if lower.contains("jwt-") {
            let parts=input.trimmingCharacters(in:.whitespacesAndNewlines).split(separator:".",omittingEmptySubsequences:false)
            guard parts.count==3 else { throw NativeSimpleError.message("A JWT must contain three dot-separated parts.") }
            func decodePart(_ part:Substring)throws -> (Any,String) {
                let text=String(part).replacingOccurrences(of:"-",with:"+").replacingOccurrences(of:"_",with:"/")
                let padded=text+String(repeating:"=",count:(4-text.count%4)%4)
                guard let data=Data(base64Encoded:padded), let value=String(data:data,encoding:.utf8) else { throw NativeSimpleError.message("Invalid JWT base64url encoding.") }
                return (try JSONSerialization.jsonObject(with:data,options:[.fragmentsAllowed]),value)
            }
            let (header,headerRaw)=try decodePart(parts[0]), (payload,payloadRaw)=try decodePart(parts[1])
            guard let payloadObject=payload as? [String:Any] else { throw NativeSimpleError.message("JWT payload must be a JSON object.") }
            let now=Date().timeIntervalSince1970
            func claimTime(_ key:String)->Any {
                guard let n=payloadObject[key] as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() else { return NSNull() }
                let seconds=n.doubleValue
                guard seconds.isFinite, abs(seconds) < 253402300800 else { return ["unixSeconds":NSNull(),"iso":NSNull(),"status":"out-of-range"] }
                let iso=ISO8601DateFormatter(); iso.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
                let status:String
                switch key { case "exp": status = now >= seconds ? "expired" : "valid"; case "nbf": status = now < seconds ? "not-yet-valid" : "active"; case "iat": status = seconds > now ? "issued-in-the-future" : "informational"; default: status = "informational" }
                return ["unixSeconds":seconds,"iso":iso.string(from:Date(timeIntervalSince1970:seconds)),"status":status]
            }
            let exp=(payloadObject["exp"] as? NSNumber)?.doubleValue
            let expiresAt:String
            let expired:Any
            if let exp, exp.isFinite, abs(exp) < 253402300800 {
                let formatter=ISO8601DateFormatter(); formatter.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
                expiresAt=formatter.string(from:Date(timeIntervalSince1970:exp)); expired=now >= exp
            } else { expiresAt="none"; expired=NSNull() }
            let claims:[String:Any]=["exp":claimTime("exp"),"iat":claimTime("iat"),"nbf":claimTime("nbf"),"sub":payloadObject["sub"] ?? NSNull(),"iss":payloadObject["iss"] ?? NSNull(),"aud":payloadObject["aud"] ?? NSNull()]
            let largeIntegerWarning = !Self.unsafeJSONIntegerTokens(payloadRaw).isEmpty
            return prettyJSONObject(["warning":"DECODE ONLY — signature not verified. Do not treat this display as proof of authenticity.","header":header,"payload":payload,"claims":claims,"signaturePresent":!parts[2].isEmpty,"signatureVerified":false,"expiresAt":expiresAt,"expired":expired,"largeIntegerPrecisionWarning":largeIntegerWarning ? "Large integers may lose precision in JavaScript consumers; this native Swift display preserves JSON parsing semantics but does not establish signature validity." : NSNull(),"headerRaw":headerRaw])
        }
        if lower.contains("uuid-generator") || lower.contains("uuid-batch-generator") {let number=Double(secondary) ?? 0,count=max(1,min(1000,number==0 ? 10:Int(number)));return (0..<count).map{_ in UUID().uuidString.lowercased()}.joined(separator:"\n")}
        if lower.contains("developer-sql-query-builder") || lower.contains("sql-query-builder") {
            let spec: [String:Any]; if input.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty { spec=[:] } else { guard let data=input.data(using:.utf8), let value=try? JSONSerialization.jsonObject(with:data) as? [String:Any] else { throw NativeSimpleError.message("Enter query options as JSON with table, columns, filters and limit.") }; spec=value }
            func ident(_ raw:Any?,_ label:String)throws -> String { guard let text=raw as? String, text.range(of:#"^[A-Za-z_][A-Za-z0-9_]*$"#,options:.regularExpression) != nil else { throw NativeSimpleError.message("\(label) must be a simple SQL identifier.") }; return "\"\(text)\"" }
            let table=try ident(spec["table"] ?? "users","Table"); let columns=(spec["columns"] as? [Any]) ?? []; let colSQL=try columns.isEmpty ? "*" : columns.map{try ident($0,"Column")}.joined(separator:", ")
            let filters=(spec["filters"] as? [[String:Any]]) ?? []; var parameters:[Any]=[]; var clauses:[String]=[]
            for f in filters { let col=try ident(f["column"],"Filter column"); let op=(f["operator"] as? String ?? "=").uppercased(); guard ["=","!=","<>","<","<=",">",">=","LIKE","IN","IS NULL","IS NOT NULL"].contains(op) else { throw NativeSimpleError.message("Unsupported filter operator: \(op)") }; if op=="IS NULL" || op=="IS NOT NULL" { clauses.append("\(col) \(op)") } else if op=="IN" { guard let vals=f["value"] as? [Any], !vals.isEmpty else { throw NativeSimpleError.message("IN requires a non-empty values array.") }; clauses.append("\(col) IN (\(vals.map{_ in "?"}.joined(separator:", ")))" );parameters.append(contentsOf:vals) } else { clauses.append("\(col) \(op) ?");parameters.append(f["value"] ?? NSNull()) } }
            let limit=spec["limit"] as? Int ?? 100; guard (1...10000).contains(limit) else { throw NativeSimpleError.message("Limit must be from 1 through 10000.") }
            return prettyJSONObject(["sql":"SELECT \(colSQL) FROM \(table)\(clauses.isEmpty ? "" : " WHERE \(clauses.joined(separator:" AND "))") LIMIT \(limit);","parameters":parameters,"note":"Uses ? placeholders for values; adapt quoting and placeholders to your database driver/dialect."])
        }
        if lower.contains("http-request-builder") { let method=(secondary.split(separator:" ").first.map(String.init) ?? "GET").uppercased(); guard ["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"].contains(method) else { throw NativeSimpleError.message("Unsupported HTTP method.") }; guard let c=URLComponents(string:input.isEmpty ? "https://api.example.com/health" : input),["https","http"].contains(c.scheme?.lowercased() ?? ""),let host=c.host else { throw NativeSimpleError.message("Enter an absolute http or https URL.") }; return "\(method) \(c.percentEncodedPath.isEmpty ? "/" : c.percentEncodedPath)\(c.percentEncodedQuery.map{"?\($0)"} ?? "") HTTP/1.1\nHost: \(host)\nAccept: application/json\nUser-Agent: enV-Developer-Studio/1.0\n" }
        if lower.contains("status-code-explainer") || lower.contains("http-status-explainer") { guard let code=Int(input.trimmingCharacters(in:.whitespacesAndNewlines)),(100...599).contains(code) else { throw NativeSimpleError.message("Enter an HTTP status code from 100 through 599.") }; let item=statuses.first{$0.0==String(code)}; let category=code<200 ? "Informational" : code<300 ? "Success" : code<400 ? "Redirection" : code<500 ? "Client error" : "Server error"; return prettyJSONObject(["code":code,"name":item?.1 ?? "Unassigned or extension status code","category":category,"note":"Local lookup only; no request is sent."]) }
        if lower.contains("ip-header-parser") { let headers=input.components(separatedBy:.newlines).compactMap{line -> [String:Any]? in guard let r=line.range(of:#"^\s*(x-forwarded-for|x-real-ip|cf-connecting-ip|forwarded)\s*:\s*(.*)$"#,options:[.regularExpression,.caseInsensitive]) else {return nil}; let name=String(line[r]).components(separatedBy:":").first?.trimmingCharacters(in:.whitespaces) ?? ""; let value=line.components(separatedBy:":").dropFirst().joined(separator:":").trimmingCharacters(in:.whitespaces); var row:[String:Any]=["name":name,"value":value]; if name.lowercased()=="x-forwarded-for" {row["addresses"]=value.split(separator:",").map{$0.trimmingCharacters(in:.whitespaces)}}; return row }; return prettyJSONObject(["headers":headers,"note":"Forwarding headers are attacker-controlled unless a trusted proxy strips and rewrites them."]) }
        if lower.contains("uuid") && suffix=="encoder" {
            let compact=input.trimmingCharacters(in:.whitespacesAndNewlines).replacingOccurrences(of:"-",with:"")
            guard compact.range(of:#"^[0-9a-fA-F]{32}$"#,options:.regularExpression) != nil else { throw NativeSimpleError.message("Enter a canonical UUID in 8-4-4-4-12 hexadecimal form.") }
            return stride(from:0,to:32,by:2).map { index in let start=compact.index(compact.startIndex,offsetBy:index),end=compact.index(start,offsetBy:2);String(repeating:"0",count:max(0,8-String(Int(compact[start..<end],radix:16)!,radix:2).count))+String(Int(compact[start..<end],radix:16)!,radix:2) }.joined(separator:" ")
        }
        if lower.contains("uuid") && suffix=="decoder" {
            let compact=input.trimmingCharacters(in:.whitespacesAndNewlines).replacingOccurrences(of:#"[\s,:-]"#,with:"",options:.regularExpression)
            let hex:String
            if compact.range(of:#"^[01]{128}$"#,options:.regularExpression) != nil { hex=stride(from:0,to:128,by:8).map { index in let start=compact.index(compact.startIndex,offsetBy:index),end=compact.index(start,offsetBy:8);String(repeating:"0",count:max(0,2-String(Int(compact[start..<end],radix:2)!,radix:16).count))+String(Int(compact[start..<end],radix:2)!,radix:16) }.joined() }
            else if compact.range(of:#"^[0-9a-fA-F]{32}$"#,options:.regularExpression) != nil {hex=compact.lowercased()}
            else {throw NativeSimpleError.message("Enter exactly 128 binary digits or 32 hexadecimal digits to decode a UUID.")}
            return "\(hex.prefix(8))-\(hex.dropFirst(8).prefix(4))-\(hex.dropFirst(12).prefix(4))-\(hex.dropFirst(16).prefix(4))-\(hex.dropFirst(20))"
        }
        if lower.contains("uuid") && (lower.contains("validator") || lower.contains("tester")) {return Self.uuidValidation(input)}
        if lower.contains("uuid") && ["formatter","beautifier","minifier","converter","parser","inspector","preview","explainer"].contains(suffix) {
            let compact=input.trimmingCharacters(in:.whitespacesAndNewlines).replacingOccurrences(of:"-",with:"").lowercased()
            if suffix=="explainer" { return "UUIDs are 128-bit identifiers. This local tool validates their shape and reports the encoded form; uniqueness is not proven by inspection." }
            if suffix=="inspector" || suffix=="parser" { let verdict=Self.uuidValidation(input); return prettyJSONObject(["valid":verdict.hasPrefix("Valid UUID"),"validation":verdict,"canonical":input.trimmingCharacters(in:.whitespacesAndNewlines).lowercased(),"hex":compact,"hexLength":compact.count,"note":"UUID structure is inspected locally; ownership or uniqueness cannot be inferred."]) }
            if suffix=="preview" { return String(input.prefix(100)) }
            if suffix=="minifier" { guard compact.range(of:#"^[0-9a-f]{32}$"#,options:.regularExpression) != nil else { throw NativeSimpleError.message("Enter a valid UUID to normalize it.") }; return compact }
            if suffix=="converter" { guard compact.range(of:#"^[0-9a-f]{32}$"#,options:.regularExpression) != nil else { throw NativeSimpleError.message("Enter a valid UUID to convert.") }; return "\(compact.prefix(8))-\(compact.dropFirst(8).prefix(4))-\(compact.dropFirst(12).prefix(4))-\(compact.dropFirst(16).prefix(4))-\(compact.dropFirst(20))" }
            let verdict=Self.uuidValidation(input); guard verdict.hasPrefix("Valid UUID") else { throw NativeSimpleError.message(verdict) }; return verdict
        }
        if suffix == "diff" && !lower.contains("json") && !lower.contains("hash") { let a=input.components(separatedBy:.newlines),b=secondary.components(separatedBy:.newlines);var out:[String]=[];for i in 0..<max(a.count,b.count){let left=i<a.count ? a[i] : nil,right=i<b.count ? b[i] : nil;if left==right{out.append("  \(left ?? "")")}else{if let left{out.append("- \(left)")};if let right{out.append("+ \(right)")}}};return prettyJSONObject(["label":base,"equal":input==secondary,"changes":out]) }
        if lower.contains("url-query-builder") || lower.contains("query-string-builder") { let data=input.data(using:.utf8) ?? Data();guard let obj=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any] else { throw NativeSimpleError.message("Enter query parameters as a JSON object.") };var pairs:[String]=[];for key in obj.keys.sorted(){let values: [Any] = (obj[key] as? [Any]) ?? [obj[key] ?? NSNull()];for value in values {let v=String(describing:value);let kEnc=key.addingPercentEncoding(withAllowedCharacters:.urlQueryAllowed.subtracting(CharacterSet(charactersIn:"&=+?"))) ?? key;let vEnc=v.addingPercentEncoding(withAllowedCharacters:.urlQueryAllowed.subtracting(CharacterSet(charactersIn:"&=+?"))) ?? v;pairs.append("\(kEnc)=\(vEnc)")}};return pairs.joined(separator:"&") }
        if lower.contains("url-") || lower.contains("uri-") || lower.contains("cookie-parser") || lower.contains("query-builder") {
            if lower.contains("encoder"){return try encode("uri",input)};if lower.contains("decoder"){return try decode("uri",input)};if lower.contains("validator") || lower.contains("tester"){return try validURL()};return try urlInfo()
        }
        if lower.contains("base64") {
            if suffix=="encoder" || suffix=="generator" { return try encode(lower.contains("url-safe") || lower.contains("urlsafe") ? "base64url" : "base64",input) }
            if suffix=="decoder" { return try decode(lower.contains("url-safe") || lower.contains("urlsafe") ? "base64url" : "base64",input) }
            if suffix=="validator" || suffix=="tester" { let decoded=try decode("base64",input);return "Valid Base64. Decoded UTF-8 length: \(decoded.count) characters / \(decoded.utf8.count) bytes." }
            if suffix=="formatter" || suffix=="beautifier" { return try encode("base64",decode("base64",input)) }
            if suffix=="inspector" || suffix=="parser" || suffix=="preview" { let decoded=try decode("base64",input);return prettyJSONObject(["valid":true,"encodedCharacters":input.count,"decodedCharacters":decoded.count,"decodedUTF8Bytes":decoded.utf8.count,"preview":String(decoded.prefix(500)),"note":"Base64 is encoding, not encryption."]) }
            if suffix=="explainer" { return "Base64 maps bytes to printable text using a 64-character alphabet. It is not encryption; use URL-safe Base64 for URL contexts and validate untrusted input before use." }
            return localSuffixFallback("base64")
        }
        if lower.contains("unicode"){if suffix=="encoder" || suffix=="generator"{return try encode("unicode",input)};if suffix=="decoder"{return try decode("unicode",input)};return localSuffixFallback("unicode")}
        if lower.contains("ascii") || lower.contains("binary") || lower.contains("hex") {
            if suffix == "encoder" || suffix == "generator" || suffix == "converter" {
                if lower.contains("ascii") {
                    guard input.unicodeScalars.allSatisfy({ $0.value <= 127 }) else { throw NativeSimpleError.message("ASCII supports code points U+0000–U+007F only. Use HEX or Binary for UTF-8 text.") }
                    return input.unicodeScalars.map { String($0.value) }.joined(separator: " ")
                }
                return Data(input.utf8).map { byte in let n = Int(byte); return lower.contains("binary") ? String(repeating: "0", count: max(0, 8 - String(n, radix: 2).count)) + String(n, radix: 2) : String(format: "%02x", n) }.joined(separator: " ")
            }
            if suffix == "decoder" {
                let tokens = input.trimmingCharacters(in: .whitespacesAndNewlines).split(whereSeparator: { $0.isWhitespace || $0 == "," }).map(String.init)
                guard !tokens.isEmpty else { throw NativeSimpleError.message("Enter a code sequence to decode.") }
                if lower.contains("ascii") {
                    let numbers = tokens.compactMap(Int.init)
                    guard numbers.count == tokens.count, numbers.allSatisfy({ (0...127).contains($0) }) else { throw NativeSimpleError.message("ASCII codes must be decimal integers from 0 to 127 separated by spaces or commas.") }
                    return numbers.map { String(UnicodeScalar($0)!) }.joined()
                }
                let radix = lower.contains("binary") ? 2 : 16
                var bytes: [UInt8] = []
                for token in tokens {
                    guard let value = Int(token, radix: radix), (0...255).contains(value), (radix != 2 || token.count <= 8) else { throw NativeSimpleError.message("Invalid \(radix == 2 ? "binary byte" : "hex byte"): \(token)") }
                    bytes.append(UInt8(value))
                }
                guard let result = String(data: Data(bytes), encoding: .utf8) else { throw NativeSimpleError.message("Bytes do not form valid UTF-8 text.") }
                return result
            }
            return localSuffixFallback(lower.contains("ascii") ? "ascii" : lower.contains("binary") ? "binary" : "hex")
        }
        if lower.contains("json-schema") && (suffix=="generator" || suffix=="builder") {
            let sample = try json(input.isEmpty ? "{\"name\":\"Ada\",\"count\":2,\"ratio\":1.5,\"active\":true}" : input)
            // Merge observed sample shapes instead of trusting the first array element. A property
            // is marked required only when it appears in every observed object sample.
            func schemaTypes(_ schema:[String:Any])->Set<String> {
                if let value=schema["type"] as? String {return [value]}
                if let values=schema["type"] as? [String] {return Set(values)}
                return []
            }
            func mergeSchema(_ left:[String:Any],_ right:[String:Any])->[String:Any] {
                var typeSet=schemaTypes(left).union(schemaTypes(right))
                if typeSet.contains("number") { typeSet.remove("integer") }
                var out:[String:Any]=[:]
                if !typeSet.isEmpty { let types=typeSet.sorted();out["type"]=types.count==1 ? types[0] as Any : types }
                if typeSet.contains("object") {
                    let a=left["properties"] as? [String:Any] ?? [:],b=right["properties"] as? [String:Any] ?? [:]
                    var props:[String:Any]=[:]
                    for key in Set(a.keys).union(b.keys).sorted() {
                        if let av=a[key] as? [String:Any],let bv=b[key] as? [String:Any] {props[key]=mergeSchema(av,bv)}
                        else {props[key]=a[key] ?? b[key]}
                    }
                    out["properties"]=props
                    let reqA=Set(left["required"] as? [String] ?? []),reqB=Set(right["required"] as? [String] ?? [])
                    out["required"]=reqA.intersection(reqB).sorted()
                    out["additionalProperties"]=(left["additionalProperties"] as? Bool == true && right["additionalProperties"] as? Bool == true)
                }
                if typeSet.contains("array") {
                    let a=left["items"] as? [String:Any],b=right["items"] as? [String:Any]
                    if let a,let b {out["items"]=mergeSchema(a,b)} else {out["items"]=a ?? b ?? [:]}
                }
                return out
            }
            func inferSchema(_ value:Any) -> [String:Any] {
                if let object=value as? [String:Any] {
                    var properties:[String:Any]=[:]
                    for key in object.keys.sorted() { properties[key]=inferSchema(object[key] ?? NSNull()) }
                    return ["type":"object","properties":properties,"required":object.keys.sorted(),"additionalProperties":false]
                }
                if let array=value as? [Any] {
                    var merged:[String:Any]?=nil
                    for item in array { let next=inferSchema(item);merged = merged.map{mergeSchema($0,next)} ?? next }
                    return ["type":"array","items":merged ?? [:]]
                }
                if value is NSNull { return ["type":"null"] }
                if value is String { return ["type":"string"] }
                if let number=value as? NSNumber {
                    if CFGetTypeID(number)==CFBooleanGetTypeID() { return ["type":"boolean"] }
                    return ["type": number.doubleValue.isFinite && number.doubleValue.rounded(.towardZero)==number.doubleValue ? "integer" : "number"]
                }
                return [:]
            }
            var schema:[String:Any] = ["$schema":"https://json-schema.org/draft/2020-12/schema","title":"Generated schema"]
            for (key,value) in inferSchema(sample) { schema[key]=value }
            return prettyJSONObject(schema)
        }
        if lower.contains("json") {
            if lower.contains("to-csv"){return try jsonToCSV(input)};if lower.contains("diff"){return try jsonDiff(input,secondary)};if lower.contains("sort"){let value=sortValue(try json(input));let data=try JSONSerialization.data(withJSONObject:value,options:[.prettyPrinted,.sortedKeys,.fragmentsAllowed]);return String(data:data,encoding:.utf8) ?? ""}
            if suffix=="generator" && input.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty { return "{\"id\":\"example-1\",\"name\":\"Example\",\"active\":true,\"items\":[]}" }
            if suffix=="minifier"{return try Self.jsonValue(input,pretty:false)}
            if suffix=="inspector" || suffix=="parser" || suffix=="explainer" { return try Self.jsonInspector(input) }
            if ["formatter","beautifier","preview","tester"].contains(suffix){return try pretty(input)};if suffix=="validator"{_ = try json(input);return "Valid JSON (RFC 8259-compatible parser)."};if suffix=="encoder"{return try encode("base64",input)};if suffix=="decoder"{return try decode("base64",input)};if suffix=="converter"{return try pretty(input)};return input
        }
        if lower.contains("csv") {
            if lower.contains("to-json"){return try csvToJSON(input)};if suffix=="validator" || suffix=="tester"{let rows=csvRows(input);guard !rows.isEmpty else{throw NativeSimpleError.message("CSV is empty.")};return "Valid CSV with \(rows.count) rows and \(rows[0].count) columns."};if suffix=="minifier"{return csvString(csvRows(input))};if ["decoder","parser","formatter","beautifier","preview","inspector","converter"].contains(suffix){return csvString(csvRows(input))};return input
        }
        if lower.contains("xml") || lower.contains("html") || lower.contains("svg") {
            if suffix=="validator" || suffix=="tester"{guard validMarkup(input) else{throw NativeSimpleError.message("Invalid markup/XML.")};return "Valid markup/XML."};if suffix=="minifier"{return minifyText(input)};if suffix=="encoder"{return try encode("html",input)};if suffix=="decoder"{return try decode("html",input)};if suffix=="explainer"{return "Markup represents nested elements and text. Well-formed XML parsing does not prove HTML accessibility, sanitization, schema conformance, or SVG safety."};if suffix=="inspector" || suffix=="parser"{return prettyJSONObject(["tags":Array(input.matches(of:/<([A-Za-z][\\w:.-]*)\\b/).map{$0.output}.prefix(500)),"characters":input.count,"lines":input.components(separatedBy:.newlines).count])};if suffix=="preview"{return String(input.prefix(2000))};if suffix=="generator"{return "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><title>New page</title></head><body><main><h1>Hello world</h1></main></body></html>\n"};return Self.formatDeveloperMarkup(input)
        }
        if ["sql","graphql","css","javascript","typescript","docker","nginx","kubernetes","git","openapi","markdown","yaml"].contains(where:lower.contains) {
            if lower.contains("markdown") && (suffix=="preview" || lower.contains("markdown-to-html")){return markdownToHTML(input)}
            if lower.contains("sql") && (suffix=="formatter" || suffix=="beautifier") { return formatSQL(input) }
            if lower.contains("css") && (suffix=="formatter" || suffix=="beautifier") { return formatCSS(input) }
            if lower.contains("markdown") && (suffix=="formatter" || suffix=="beautifier") { return input.replacingOccurrences(of:"\r\n",with:"\n").components(separatedBy:"\n").map{$0.trimmingCharacters(in:.whitespaces)}.joined(separator:"\n")+"\n" }
            if lower.contains("markdown") && suffix=="generator" { return "# Project title\n\nDescribe the purpose of this project.\n" }
            if suffix=="validator" || suffix=="tester" { if input.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty {throw NativeSimpleError.message("Enter \(base) input to check.")};if lower.contains("yaml") && input.components(separatedBy:.newlines).contains(where:{$0.hasPrefix("\t") || $0.hasPrefix("  \t")}) {throw NativeSimpleError.message("YAML indentation must use spaces, not tabs.")};let opens=input.filter{$0=="{"}.count,closes=input.filter{$0=="}"}.count;if (lower.contains("graphql") || lower.contains("css")) && opens != closes {throw NativeSimpleError.message("Opening and closing braces do not balance.")};return "Basic \(base.uppercased()) structure check passed. Full syntax, schema, dialect and runtime validation is not claimed." }
            if suffix=="minifier" {return minifyText(input)}
            if suffix=="encoder" && lower.contains("css") { return Self.cssEscape(input) };if suffix=="decoder" && lower.contains("css") { return Self.cssUnescape(input) };if suffix=="encoder" {return try encode("base64",input)};if suffix=="decoder" {return try decode("base64",input)}
            if lower.contains("css") && (suffix=="inspector" || suffix=="parser") {return prettyJSONObject(["rules":input.components(separatedBy:"}").filter{$0.contains("{")}.map{String($0.prefix(500))+"}"},"openBraces":input.filter{$0=="{"}.count,"closeBraces":input.filter{$0=="}"}.count,"note":"Lightweight CSS rule inspection; full grammar parsing is not performed."])}
            if lower.contains("sql") && (suffix=="inspector" || suffix=="parser") {return prettyJSONObject(["statementCount":input.components(separatedBy:";").filter{!$0.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty}.count,"keywords":Array(Set(input.uppercased().components(separatedBy:CharacterSet.alphanumerics.inverted).filter{["SELECT","INSERT","UPDATE","DELETE","CREATE","ALTER","DROP","FROM","WHERE","JOIN","LIMIT","VALUES","SET"].contains($0)})).sorted(),"note":"Lightweight inspection only; no database parser or execution."])}
            if lower.contains("yaml") && suffix=="generator" {return "app:\n  name: example\n  enabled: true\n"}
            return localSuffixFallback(base)
        }
        if lower.contains("http-status") || lower.contains("status-code") {let code=input.trimmingCharacters(in:.whitespacesAndNewlines);return statuses.first(where:{$0.0==code}).map{"\($0.0) \($0.1)"} ?? statuses.map{"\($0.0) \($0.1)"}.joined(separator:"\n")}
        if lower.contains("mime") || lower.contains("content-type") {let ext=input.trimmingCharacters(in:.whitespacesAndNewlines).components(separatedBy:".").last?.lowercased() ?? "";return mime.first(where:{$0.0==ext}).map{$0.1} ?? mime.map{"\($0.0)\t\($0.1)"}.joined(separator:"\n")}
        if lower.contains("cron"){return "Cron: \(input.trimmingCharacters(in:.whitespacesAndNewlines))\nFive-field format: minute hour day-of-month month day-of-week"}
        if lower.contains("data-uri"){return try encode("base64",input)}
        if lower.contains("file-hash"){throw NativeSimpleError.message("Use a local file input for the file hash tool.")}
        if ["generator","builder","helper"].contains(where:lower.contains){let text=input.trimmingCharacters(in:.whitespacesAndNewlines);return text.isEmpty ? "Generated developer template ready. Replace the placeholders with your project values.":text}
        if lower.contains("explainer"){return "Developer tool: \(op)\n\nInput length: \(input.count) characters."}
        return input
    }

    private static func runSEO(_ op:String,options o:[String:String]) throws -> String { let title=o["title"] ?? o["name"] ?? "Page title"; let desc=o["description"] ?? "A short description."; let url=o["url"] ?? o["canonical"] ?? "https://example.com/"; switch op { case "meta": return ["<title>\(esc(title))</title>","<meta name=\"description\" content=\"\(esc(desc))\" />",o["canonical"].map{ "<link rel=\"canonical\" href=\"\(esc($0))\" />" }].compactMap{$0}.joined(separator:"\n"); case "serp": return "\(title)\n\(url)\n\(desc)"; case "og": return ["<meta property=\"og:title\" content=\"\(esc(title))\" />","<meta property=\"og:description\" content=\"\(esc(desc))\" />","<meta property=\"og:image\" content=\"\(esc(o["image"] ?? ""))\" />","<meta property=\"og:url\" content=\"\(esc(url))\" />","<meta property=\"og:type\" content=\"website\" />"].joined(separator:"\n"); case "twitter-card": return ["<meta name=\"twitter:card\" content=\"summary_large_image\" />","<meta name=\"twitter:title\" content=\"\(esc(title))\" />","<meta name=\"twitter:description\" content=\"\(esc(desc))\" />","<meta name=\"twitter:image\" content=\"\(esc(o["image"] ?? ""))\" />"].joined(separator:"\n"); case "schema": return "<script type=\"application/ld+json\">\n\(prettyJSONObject(["@context":"https://schema.org","@type":o["kind"] ?? "WebSite","name":title,"description":desc]))\n</script>"; case "sitemap": let body=lines(o["urls"] ?? url).map{"  <url>\n    <loc>\(esc($0))</loc>\n  </url>"}.joined(separator:"\n"); return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n\(body)\n</urlset>"; case "robots": let dis=lines(o["disallow"] ?? "").map{"Disallow: \($0)"}.joined(separator:"\n"); return "User-agent: *\nAllow: /\n\(dis)\(o["sitemap"].map{"\nSitemap: \($0)"} ?? "")".trimmingCharacters(in:.whitespacesAndNewlines); case "canonical": return "<link rel=\"canonical\" href=\"\(esc(url))\" />"; case "hreflang": let rows=lines(o["rows"] ?? ""); guard !rows.isEmpty else {throw NativeSimpleError.message("Enter rows as lang,url")}; return rows.map{let p=$0.split(separator:",",maxSplits:1).map(String.init); return "<link rel=\"alternate\" hreflang=\"\(esc(p.first ?? ""))\" href=\"\(esc(p.count>1 ? p[1] : ""))\" />"}.joined(separator:"\n"); case "utm": var c=URLComponents(string:o["url"] ?? "https://example.com/")!; var q=c.queryItems ?? []; if let s=o["source"],!s.isEmpty {q.append(URLQueryItem(name:"utm_source",value:s))}; if let m=o["medium"],!m.isEmpty {q.append(URLQueryItem(name:"utm_medium",value:m))}; if let camp=o["campaign"],!camp.isEmpty {q.append(URLQueryItem(name:"utm_campaign",value:camp))}; c.queryItems=q; return c.string!; case "redirect": let from=o["from"] ?? "/old"; let to=o["to"] ?? "/"; return "# nginx\nrewrite ^\(from)$ \(to) permanent;\n\n# netlify\n\(from) \(to) 301\n\n<!-- meta -->\n<meta http-equiv=\"refresh\" content=\"0;url=\(esc(to))\">"; case "robots-test": return try robotsTest(o); case "sitemap-validator": return try sitemapValidator(o); case "jsonld-validator": return try jsonldValidator(o); case "headings": return try headings(o); case "slug": let text=(o["text"] ?? "").folding(options:.diacriticInsensitive,locale:.current).lowercased(); let stops=Set((o["stopwords"] ?? "the,a,an,and,or,of,to,in,on,for,with,by").split(separator:",").map{$0.trimmingCharacters(in:.whitespaces)}); return text.replacingOccurrences(of:"[^A-Za-z0-9\\p{L}\\p{N}]+",with:"-",options:.regularExpression).trimmingCharacters(in:CharacterSet(charactersIn:"-")).split(separator:"-").filter{!stops.contains(String($0))}.joined(separator:"-"); case "title-length": return lengthJSON(o["text"] ?? "",60,"Within common working guidance; search engines may still rewrite it.","Above common guidance; consider shortening the visible title."); case "description-length": return lengthJSON(o["text"] ?? "",160,"Within common working guidance; snippets are not guaranteed.","Above common working guidance; search engines may truncate or rewrite it."); case "robots-meta": var parts=[o["index"]=="noindex" ? "noindex":"index",o["follow"]=="nofollow" ? "nofollow":"follow"]; if o["snippet"]=="nosnippet" {parts.append("nosnippet")}; if let x=o["maxSnippet"],!x.isEmpty {parts.append("max-snippet:\(x)")}; if let x=o["maxImage"],!x.isEmpty {parts.append("max-image-preview:\(x)")}; return "<meta name=\"robots\" content=\"\(esc(parts.joined(separator:", ")))\" />"; case "llms-txt": return "# \(title)\n\n> \(desc)\n\n## About\n- \(url)\n\n## Important pages\n- \(o["pages"] ?? "/")"; case "manifest": return prettyJSONObject(["name":o["name"] ?? "App","short_name":o["short_name"] ?? "App","start_url":"/","display":"standalone","background_color":"#ffffff","theme_color":o["theme"] ?? "#0d9f8a"]); default: throw NativeSimpleError.message("Unknown SEO operation: \(op)") } }
    private static func esc(_ s:String)->String { s.replacingOccurrences(of:"&",with:"&amp;").replacingOccurrences(of:"<",with:"&lt;").replacingOccurrences(of:">",with:"&gt;").replacingOccurrences(of:"\"",with:"&quot;") }
    private static func prettyJSONObject(_ obj:[String:Any])->String { String(data:try! JSONSerialization.data(withJSONObject:obj,options:[.prettyPrinted]),encoding:.utf8)! }
    private static func lengthJSON(_ text:String,_ maxCount:Int,_ ok:String,_ bad:String)->String { prettyJSONObject(["characters":text.count,"guidance":text.count <= maxCount ? ok : bad]) }

    private static func jsonValue(_ raw:String,pretty:Bool) throws -> String {
        let value=try JSONSerialization.jsonObject(with:Data(raw.utf8),options:[.fragmentsAllowed])
        let options:JSONSerialization.WritingOptions = pretty ? [.prettyPrinted,.fragmentsAllowed] : [.fragmentsAllowed]
        return String(data:try JSONSerialization.data(withJSONObject:value,options:options),encoding:.utf8) ?? ""
    }
    /**
     * Bounded structural inspection rather than eager tree rendering. This directly addresses
     * reports of large JSON documents freezing interfaces while every collapsed node is built.
     * It intentionally reports structure, not schema correctness, and warns that JSONSerialization
     * can collapse duplicate object keys and represent numbers with platform-specific semantics.
     */
    private static func jsonInspector(_ raw:String, maxNodes:Int = 100_000) throws -> String {
        guard raw.utf8.count <= 50 * 1024 * 1024 else { throw NativeSimpleError.message("JSON input exceeds the 50 MiB inspection safety limit; inspect smaller sections.") }
        let root = try JSONSerialization.jsonObject(with:Data(raw.utf8), options:[.fragmentsAllowed])
        func typeOf(_ value:Any)->String {
            if value is [String:Any] { return "object" }; if value is [Any] { return "array" }; if value is NSNull { return "null" }; if value is String { return "string" }
            if let number=value as? NSNumber { return CFGetTypeID(number)==CFBooleanGetTypeID() ? "boolean" : "number" }
            return "unknown"
        }
        var stack:[(Any,Int)] = [(root,0)]
        var nodes=0, maximumDepth=0, objectCount=0, arrayCount=0, propertyCount=0, arrayItems=0, stringCount=0
        while !stack.isEmpty && nodes < maxNodes {
            let (value,depth)=stack.removeLast(); nodes += 1; maximumDepth=max(maximumDepth,depth)
            if let object=value as? [String:Any] {
                objectCount += 1; propertyCount += object.count
                for child in object.values { stack.append((child,depth+1)) }
            } else if let array=value as? [Any] {
                arrayCount += 1; arrayItems += array.count
                for child in array { stack.append((child,depth+1)) }
            } else if value is String { stringCount += 1 }
        }
        let truncated = !stack.isEmpty
        let unsafe = Self.unsafeJSONIntegerTokens(raw)
        let (duplicates, duplicateScanTruncated) = Self.duplicateJSONKeyPaths(raw)
        var warnings:[String] = []
        if !unsafe.isEmpty { warnings.append("Raw integer tokens exceed JavaScript's exact integer range; preserve exact identifiers as strings when interoperating with JavaScript.") }
        if !duplicates.isEmpty { warnings.append("Duplicate object keys are ambiguous; parsers commonly keep only the last occurrence.") }
        if truncated { warnings.append("Structural traversal stopped at \(maxNodes) nodes to protect responsiveness.") }
        if duplicateScanTruncated { warnings.append("Duplicate-key scan reached its 100,000-node limit; keys beyond that point may not have been inspected.") }
        warnings.append("Structural inspection is not JSON Schema validation.")
        return prettyJSONObject(["rootType":typeOf(root),"characters":raw.count,"utf8Bytes":raw.utf8.count,"nodeCount":nodes,"maximumDepth":maximumDepth,"objectCount":objectCount,"arrayCount":arrayCount,"propertyCount":propertyCount,"arrayItems":arrayItems,"stringCount":stringCount,"unsafeIntegerTokens":unsafe,"duplicateKeys":Array(duplicates.prefix(100)),"duplicateScanTruncated":duplicateScanTruncated,"truncated":truncated,"warnings":warnings,"privacy":"Inspection is local; no network request is made."])
    }

    /** Detect duplicate decoded property names while ignoring strings that only resemble JSON syntax. */
    private static func duplicateJSONKeyPaths(_ raw:String, maxNodes:Int = 100_000) -> ([String], Bool) {
        let bytes=Array(raw.utf8); var index=0, visited=0, truncated=false; var duplicates:[String]=[]
        func skipWhitespace() { while index < bytes.count && [UInt8(9),10,13,32].contains(bytes[index]) { index += 1 } }
        func readString() -> String {
            let start=index; index += 1
            while index < bytes.count { let byte=bytes[index]; index += 1; if byte == 92 { if index < bytes.count { index += 1 }; continue }; if byte == 34 { break } }
            let literal=String(decoding:bytes[start..<index],as:UTF8.self)
            return ((try? JSONSerialization.jsonObject(with:Data(literal.utf8),options:[.fragmentsAllowed])) as? String) ?? literal
        }
        func parseValue(_ path:String,_ depth:Int) {
            skipWhitespace()
            guard index < bytes.count else { return }
            guard visited < maxNodes, depth <= 100 else { truncated=true; return }
            visited += 1
            switch bytes[index] {
            case 34: _ = readString()
            case 123:
                index += 1; skipWhitespace(); if index < bytes.count && bytes[index] == 125 { index += 1; return }
                var keys=Set<String>()
                while index < bytes.count && visited < maxNodes {
                    skipWhitespace(); guard index < bytes.count && bytes[index] == 34 else { return }
                    let key=readString()
                    let keyData=(try? JSONSerialization.data(withJSONObject:key,options:[.fragmentsAllowed]))
                    let quoted=keyData.flatMap{String(data:$0,encoding:.utf8)} ?? "\"?\""
                    if !keys.insert(key).inserted { duplicates.append(path+"["+quoted+"]") }
                    skipWhitespace(); guard index < bytes.count && bytes[index] == 58 else { return }; index += 1
                    parseValue(path+"["+quoted+"]",depth+1); skipWhitespace()
                    if index < bytes.count && bytes[index] == 125 { index += 1; return }
                    if index < bytes.count && bytes[index] == 44 { index += 1 } else { return }
                }
                if visited >= maxNodes && index < bytes.count { truncated=true }
            case 91:
                index += 1; skipWhitespace(); if index < bytes.count && bytes[index] == 93 { index += 1; return }
                var item=0
                while index < bytes.count && visited < maxNodes {
                    parseValue(path+"[\(item)]",depth+1); item += 1; skipWhitespace()
                    if index < bytes.count && bytes[index] == 93 { index += 1; return }
                    if index < bytes.count && bytes[index] == 44 { index += 1 } else { return }
                }
                if visited >= maxNodes && index < bytes.count { truncated=true }
            default:
                while index < bytes.count && ![UInt8(9),10,13,32,44,93,125].contains(bytes[index]) { index += 1 }
            }
        }
        parseValue("$",0)
        return (Array(Set(duplicates)).sorted(),truncated)
    }

    /** Lexical scan only JSON number tokens outside quoted strings (so numeric IDs in text are ignored). */
    private static func unsafeJSONIntegerTokens(_ raw:String, limit:Int = 50) -> [[String:Any]] {
        let bytes=Array(raw.utf8); let safe="9007199254740991"; var result:[[String:Any]]=[]
        var i=0, line=1, column=1
        func advance() { if bytes[i] == 10 { line += 1; column = 1 } else { column += 1 }; i += 1 }
        while i < bytes.count && result.count < limit {
            if bytes[i] == 34 {
                advance()
                while i < bytes.count { let b=bytes[i]; if b == 92 { advance(); if i < bytes.count { advance() }; continue }; advance(); if b == 34 { break } }
                continue
            }
            if bytes[i] == 45 || (bytes[i] >= 48 && bytes[i] <= 57) {
                let start=i, startLine=line, startColumn=column
                if bytes[i] == 45 { advance() }
                while i < bytes.count && bytes[i] >= 48 && bytes[i] <= 57 { advance() }
                var integerOnly=true
                if i < bytes.count && bytes[i] == 46 { integerOnly=false; advance(); while i < bytes.count && bytes[i] >= 48 && bytes[i] <= 57 { advance() } }
                if i < bytes.count && (bytes[i] == 69 || bytes[i] == 101) { integerOnly=false; advance(); if i < bytes.count && (bytes[i] == 43 || bytes[i] == 45) { advance() }; while i < bytes.count && bytes[i] >= 48 && bytes[i] <= 57 { advance() } }
                if integerOnly {
                    let token=String(decoding:bytes[start..<i],as:UTF8.self); let digits=token.hasPrefix("-") ? String(token.dropFirst()) : token
                    if digits.count > safe.count || (digits.count == safe.count && digits > safe) { result.append(["token":token,"line":startLine,"column":startColumn]) }
                }
                continue
            }
            advance()
        }
        return result
    }

    private static func cssEscape(_ input:String)->String {
        var out=""
        for scalar in input.unicodeScalars {
            switch scalar.value {
            case 0x5c: out += "\\\\"
            case 0x22: out += "\\\""
            case 0x27: out += "\\27 "
            case 0x0a: out += "\\a "
            case 0x0d: out += "\\d "
            case 0x0c: out += "\\c "
            case 0: out += "\\fffd "
            case 1...0x1f, 0x7f: out += "\\\(String(scalar.value,radix:16)) "
            default: out.unicodeScalars.append(scalar)
            }
        }
        return out
    }
    private static func cssUnescape(_ input:String)->String {
        let pattern=try! NSRegularExpression(pattern:#"\\([0-9a-fA-F]{1,6})[ \t\r\n\f]?|\\(.)"#)
        var out=input
        for match in pattern.matches(in:input,range:NSRange(input.startIndex...,in:input)).reversed() {
            guard let range=Range(match.range,in:out) else {continue}
            if let hRange=Range(match.range(at:1),in:out),let cp=UInt32(out[hRange],radix:16) { let safe=(cp==0 || cp>0x10ffff || (0xd800...0xdfff).contains(cp)) ? 0xfffd : cp; out.replaceSubrange(range,with:String(UnicodeScalar(safe)!)) }
            else if let cRange=Range(match.range(at:2),in:out) { out.replaceSubrange(range,with:String(out[cRange])) }
        }
        return out
    }

    private static func uuidValidation(_ raw:String) -> String {
        let value=raw.trimmingCharacters(in:.whitespacesAndNewlines)
        if value.caseInsensitiveCompare("00000000-0000-0000-0000-000000000000") == .orderedSame { return "Valid Nil UUID" }
        if value.caseInsensitiveCompare("ffffffff-ffff-ffff-ffff-ffffffffffff") == .orderedSame { return "Valid Max UUID" }
        let regex=try! NSRegularExpression(pattern:"^[0-9a-f]{8}-[0-9a-f]{4}-([1-8])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",options:[.caseInsensitive])
        let range=NSRange(value.startIndex...,in:value)
        guard let match=regex.firstMatch(in:value,range:range),match.range==range,let versionRange=Range(match.range(at:1),in:value) else { return "Invalid UUID" }
        return "Valid UUID v\(value[versionRange])"
    }
    private static func formatDeveloperMarkup(_ input:String) -> String {
        let normalized=input.replacingOccurrences(of:">\\s+<",with:"><",options:.regularExpression)
        let tokens=normalized.replacingOccurrences(of:"(<[^>]+>)",with:"\n$1\n",options:.regularExpression).components(separatedBy:"\n").map{$0.trimmingCharacters(in:.whitespacesAndNewlines)}.filter{!$0.isEmpty}
        let voidish=try! NSRegularExpression(pattern:"^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$",options:[.caseInsensitive])
        var depth=0
        return tokens.map { token in
            let close=token.hasPrefix("</")
            if close { depth=max(0,depth-1) }
            let line=String(repeating:"  ",count:depth)+token
            let open=token.hasPrefix("<") && !token.hasPrefix("</") && !token.hasPrefix("<!") && !token.hasSuffix("/>")
            let name=token.replacingOccurrences(of:"^</?([^\\s>/]+).*$",with:"$1",options:.regularExpression)
            if open && voidish.firstMatch(in:name,range:NSRange(name.startIndex...,in:name)) == nil { depth += 1 }
            return line
        }.joined(separator:"\n")
    }
    private static func developerURLInfo(_ raw:String) throws -> String {
        guard var components=URLComponents(string:raw.trimmingCharacters(in:.whitespacesAndNewlines)),let rawScheme=components.scheme,let rawHost=components.host else { throw NativeSimpleError.message("Enter a valid absolute URL.") }
        let scheme=rawScheme.lowercased(),host=rawHost.lowercased(),port=components.port
        let effectivePort=(scheme=="http" && port==80)||(scheme=="https" && port==443) ? nil : port
        components.scheme=scheme; components.host=host; components.port=effectivePort
        if components.percentEncodedPath.isEmpty { components.percentEncodedPath="/" }
        let portText=effectivePort.map{":\($0)"} ?? ""
        let params=(components.queryItems ?? []).reduce(into:[String:String]()) { $0[$1.name]=$1.value ?? "" }
        return prettyJSONObject([
            "href":components.string ?? raw,"protocol":"\(scheme):","username":components.user ?? "",
            "hostname":host,"port":effectivePort.map(String.init) ?? "","pathname":components.percentEncodedPath,
            "search":components.percentEncodedQuery.flatMap { query in query.isEmpty ? nil : "?\(query)" } ?? "",
            "hash":components.percentEncodedFragment.flatMap { fragment in fragment.isEmpty ? nil : "#\(fragment)" } ?? "",
            "origin":"\(scheme)://\(host)\(portText)","params":params
        ])
    }
    private static func robotsTest(_ o:[String:String]) throws -> String { let rules=lines(o["robots"] ?? ""); let path=o["path"] ?? "/"; let agent=(o["agent"] ?? "*").lowercased(); var allowed=true; var best = -1; var matched:String?; var agents:[String]=[]; for line in rules { let p=line.split(separator:":",maxSplits:1).map(String.init); guard p.count==2 else {continue}; let k=p[0].lowercased().trimmingCharacters(in:.whitespaces); let v=p[1].trimmingCharacters(in:.whitespaces); if k=="user-agent" {agents=[v.lowercased()]; continue}; if (k=="allow"||k=="disallow") && (agents.contains("*")||agents.contains(agent)) && !v.isEmpty { let pattern="^"+NSRegularExpression.escapedPattern(for:v).replacingOccurrences(of:"\\*",with:".*"); if path.range(of:pattern,options:.regularExpression) != nil && v.count>=best {best=v.count; allowed=k=="allow"; matched=v} } }; return prettyJSONObject(["agent":agent,"path":path,"allowed":allowed,"matchedRule":matched as Any]) }
    private static func sitemapValidator(_ o:[String:String]) throws -> String { let xml=o["xml"] ?? ""; guard !xml.isEmpty else {throw NativeSimpleError.message("Paste sitemap XML first.")}; let root=try? NSRegularExpression(pattern:"<\\s*([A-Za-z0-9:_-]+)",options:[]); let range=NSRange(xml.startIndex..<xml.endIndex,in:xml); let rootName=root?.firstMatch(in:xml,options:[],range:range).flatMap{Range($0.range(at:1),in:xml).map{String(xml[$0])}}?.split(separator:":").last.map(String.init); guard rootName=="urlset"||rootName=="sitemapindex" else {throw NativeSimpleError.message("Root element must be <urlset> or <sitemapindex>.")}; let re=try! NSRegularExpression(pattern:"<loc>(.*?)</loc>",options:.dotMatchesLineSeparators); var urls:[String]=[]; for m in re.matches(in:xml,range:range) {if let r=Range(m.range(at:1),in:xml){urls.append(String(xml[r]).trimmingCharacters(in:.whitespacesAndNewlines))}}; let invalid=urls.filter{URL(string:$0)==nil}; return prettyJSONObject(["valid":invalid.isEmpty,"type":rootName! as String,"urlCount":urls.count,"duplicateCount":urls.count-Set(urls).count,"invalidUrlCount":invalid.count,"invalidUrls":Array(invalid.prefix(20))]) }
    private static func jsonldValidator(_ o:[String:String]) throws -> String { let raw=o["jsonld"] ?? ""; guard let data=raw.data(using:.utf8) else {throw NativeSimpleError.message("Paste JSON-LD first.")}; guard let object=try? JSONSerialization.jsonObject(with:data) else {throw NativeSimpleError.message("Invalid JSON: fix the JSON syntax before validating JSON-LD.")}; let nodes:[[String:Any]] = (object as? [[String:Any]]) ?? [(object as? [String:Any]) ?? [:]]; let missing=nodes.filter{ $0["@context"] == nil }.count; let types=nodes.compactMap{ $0["@type"] as? String }; return prettyJSONObject(["validJson":true,"hasSchemaContext":missing==0,"types":types,"nodeCount":nodes.count]) }
    private static func headings(_ o:[String:String]) throws -> String { let html=o["html"] ?? ""; guard !html.isEmpty else {throw NativeSimpleError.message("Paste HTML containing your headings.")}; let re=try! NSRegularExpression(pattern:"<h([1-6])\\b[^>]*>(.*?)</h\\1>",options:[.caseInsensitive,.dotMatchesLineSeparators]); let range=NSRange(html.startIndex..<html.endIndex,in:html); var hs:[[String:Any]]=[]; for m in re.matches(in:html,range:range) { let l=Int((html as NSString).substring(with:m.range(at:1))) ?? 0; let body=(html as NSString).substring(with:m.range(at:2)).replacingOccurrences(of:"<[^>]+>",with:"",options:.regularExpression).trimmingCharacters(in:.whitespacesAndNewlines); hs.append(["level":l,"text":body]) }; let h1=hs.filter{$0["level"] as? Int==1}.count; var skipped:[[String:Any]]=[]; for i in 1..<hs.count { if (hs[i]["level"] as! Int) > (hs[i-1]["level"] as! Int)+1 {skipped.append(hs[i])} }; return prettyJSONObject(["headingCount":hs.count,"h1Count":h1,"missingH1":h1==0,"multipleH1":h1>1,"skippedLevels":skipped,"emptyHeadings":hs.filter{($0["text"] as? String ?? "").isEmpty},"outline":hs]) }

    private static func runCSS(_ op:String,options o:[String:String]) -> Output { let p=op.split(separator:":",maxSplits:1).map(String.init); let family=p.first=="neumorphism" ? "neomorph" : p.first ?? "gradient"; let workflow=p.count>1 ? p[1] : "tool"; var v=o; v["from"]=v["from"] ?? "#0d9f8a"; v["to"]=v["to"] ?? "#1db87a"; v["angle"]=v["angle"] ?? "135"; v["x"]=v["x"] ?? "0"; v["y"]=v["y"] ?? "8"; v["blur"]=v["blur"] ?? "24"; v["spread"]=v["spread"] ?? "0"; v["color"]=v["color"] ?? "rgba(22,24,29,.18)"; let pair=cssFor(family,v); let svg=(workflow=="svg" && pair.svg==nil) ? "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"480\" height=\"240\" viewBox=\"0 0 480 240\"><rect width=\"480\" height=\"240\" rx=\"24\" fill=\"#ffffff\"/><rect x=\"40\" y=\"40\" width=\"400\" height=\"160\" rx=\"20\" fill=\"#0d9f8a\"/><text x=\"240\" y=\"132\" text-anchor=\"middle\" fill=\"#ffffff\" font-family=\"system-ui, sans-serif\" font-size=\"28\">enV \(family)</text></svg>" : pair.svg; let code=(workflow=="token" && svg==nil) ? ":root {\n  --env-\(family): \(pair.css.replacingOccurrences(of:"\n",with:"\\n"));\n}" : (svg ?? pair.css); return Output(text: code, filename: "env-\(family)-\(workflow).\(svg != nil ? "svg" : "css")") }
    private static func cssFor(_ f:String,_ v:[String:String])->(css:String,svg:String?) { func num(_ k:String,_ d:Double)->Double {Double(v[k] ?? "") ?? d}; func first(_ k:String,_ d:String)->String{v[k] ?? d}; switch f { case "gradient": return ("background: linear-gradient(\(num("angle",135)==0 ? 135:num("angle",135))deg, \(first("from","#0d9f8a")), \(first("to","#1db87a")));",nil); case "shadow": let sh="\(num("x",0))px \(num("y",0))px \(max(0,num("blur",0)))px \(num("spread",0))px \(first("color","rgba(22,24,29,.18)"))"; return ("box-shadow: \(sh);",nil); case "border": return ("border: \(max(0,num("width",0)))px solid \(first("color","#e4e0d8"));\nborder-radius: \(max(0,num("radius",0)))px;",nil); case "button": return ("background: \(first("bg","#0d9f8a"));\ncolor: \(first("text","#ffffff"));\nborder: 0;\nborder-radius: \(num("radius",0))px;\npadding: \(num("py",0))px \(num("px",0))px;\ncursor: pointer;",nil); case "card": return ("background: #ffffff;\nborder: 1px solid \(first("border","#e7e5e4"));\nborder-radius: \(num("radius",0))px;\npadding: \(num("pad",0))px;\nbox-shadow: 0 8px 24px rgb(22 24 29 / 0.08);",nil); case "badge": return ("background: \(first("bg","#e8f7f3"));\ncolor: \(first("text","#087f6d"));\nborder-radius: \(num("radius",0))px;\npadding: \(num("py",0))px \(num("px",0))px;\ndisplay: inline-block;",nil); case "input": return ("border: 1px solid \(first("border","#d6d3d1"));\nborder-radius: \(num("radius",0))px;\noutline: none;\nbox-shadow: 0 0 0 3px color-mix(in srgb, \(first("focus","#0d9f8a")) 18%, transparent);",nil); case "avatar": let s=max(24,num("size",96)); let r=min(50,max(0,num("radius",50))); return ("width: \(trimNumber(s))px;\nheight: \(trimNumber(s))px;\nbackground: \(first("bg","#e7f7f3"));\nborder-radius: \(trimNumber(r))%;\nobject-fit: cover;",nil); case "glass": return ("background: rgb(255 255 255 / \(first("alpha","0.16")));\nbackdrop-filter: blur(\(num("blur",0))px);\n-webkit-backdrop-filter: blur(\(num("blur",0))px);\nborder: 1px solid rgb(255 255 255 / \(first("borderAlpha","0.35")));",nil); case "neomorph": let d=max(1,num("dist",10)); return ("border-radius: \(num("radius",0))px;\nbox-shadow: \(trimNumber(d))px \(trimNumber(d))px \(trimNumber(d*2))px #d1d1d1, -\(trimNumber(d))px -\(trimNumber(d*2))px #ffffff;",nil); case "pattern": let s=max(6,num("size",24)); let st=trimNumber(s); let svg="<svg xmlns=\"http://www.w3.org/2000/svg\" width=\(st) height=\(st) viewBox=\"0 0 \(st) \(st)\"><path d=\"M0 0L\(st) \(st)M\(st) 0L0 \(st)\" stroke=\"\(first("color","#0d9f8a"))\" stroke-opacity=\"\(first("opacity","0.14"))\" stroke-width=\"1\"/></svg>"; let data="url(\"data:image/svg+xml,\(svg.addingPercentEncoding(withAllowedCharacters:.urlQueryAllowed) ?? svg)\")"; return ("background-image: \(data);\nbackground-size: \(st)px \(st)px;",svg); case "blob": let seed=num("seed",1); let points=(0..<10).map{ i -> String in let a=(Double(i)/10)*Double.pi*2; let r=38 + ((seed*Double(i+3)*13).truncatingRemainder(dividingBy:20)); return "\(50+cos(a)*r) \(50+sin(a)*r)"}.joined(separator:" "); let svg="<svg viewBox=\"0 0 100 100\" xmlns=\"http://www.w3.org/2000/svg\"><polygon fill=\"#0d9f8a\" points=\"\(points)\"/></svg>"; return (svg,svg); case "wave": let a=num("amp",24); let svg="<svg viewBox=\"0 0 1440 120\" xmlns=\"http://www.w3.org/2000/svg\" preserveAspectRatio=\"none\"><path fill=\"#0d9f8a\" d=\"M0,60 C360,\(trimNumber(60-a)) 720,\(trimNumber(60+a)) 1440,60 L1440,120 L0,120 Z\"/></svg>"; return (svg,svg); default: let o=max(0,min(1,num("opacity",0.06))); return (".noise{position:relative;overflow:hidden}\n.noise::after{content:\"\";position:absolute;inset:0;opacity:\(trimNumber(o));background-image:url(\"data:image/svg+xml,...\");pointer-events:none}",nil) } }
}

private extension String {
    func leftPad(to length: Int, with character: String) -> String {
        guard count < length else { return self }
        return String(repeating: character, count: length - count) + self
    }
}

private enum NativeSimpleError: Error, LocalizedError {
    case message(String)
    var errorDescription: String? { if case let .message(s) = self { return s }; return nil }
}
