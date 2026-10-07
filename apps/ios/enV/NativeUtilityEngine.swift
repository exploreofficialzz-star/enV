import Foundation

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
    private static let developerOps: Set<String> = ["cron-generator","cron-parser","data-uri-generator","http-status-lookup","json-beautifier","json-formatter","json-minifier","json-validator","jwt-decoder","jwt-expiration-checker","markdown-preview","markdown-to-html","query-string-parser","regex-replace","regex-tester","url-parser","user-agent-parser","uuid-generator","uuid-validator"]
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
        case "developer": return developerOps.contains(op)
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
        case "developer": return Output(text: try runDeveloper(op, input: input, options: options), filename: "env-developer-\(op).txt")
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

    private static func runSEO(_ op:String,options o:[String:String]) throws -> String { let title=o["title"] ?? o["name"] ?? "Page title"; let desc=o["description"] ?? "A short description."; let url=o["url"] ?? o["canonical"] ?? "https://example.com/"; switch op { case "meta": return ["<title>\(esc(title))</title>","<meta name=\"description\" content=\"\(esc(desc))\" />",o["canonical"].map{ "<link rel=\"canonical\" href=\"\(esc($0))\" />" }].compactMap{$0}.joined(separator:"\n"); case "serp": return "\(title)\n\(url)\n\(desc)"; case "og": return ["<meta property=\"og:title\" content=\"\(esc(title))\" />","<meta property=\"og:description\" content=\"\(esc(desc))\" />","<meta property=\"og:image\" content=\"\(esc(o["image"] ?? ""))\" />","<meta property=\"og:url\" content=\"\(esc(url))\" />","<meta property=\"og:type\" content=\"website\" />"].joined(separator:"\n"); case "twitter-card": return ["<meta name=\"twitter:card\" content=\"summary_large_image\" />","<meta name=\"twitter:title\" content=\"\(esc(title))\" />","<meta name=\"twitter:description\" content=\"\(esc(desc))\" />","<meta name=\"twitter:image\" content=\"\(esc(o["image"] ?? ""))\" />"].joined(separator:"\n"); case "schema": return "<script type=\"application/ld+json\">\n\(prettyJSONObject(["@context":"https://schema.org","@type":o["kind"] ?? "WebSite","name":title,"description":desc]))\n</script>"; case "sitemap": let body=lines(o["urls"] ?? url).map{"  <url>\n    <loc>\(esc($0))</loc>\n  </url>"}.joined(separator:"\n"); return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n\(body)\n</urlset>"; case "robots": let dis=lines(o["disallow"] ?? "").map{"Disallow: \($0)"}.joined(separator:"\n"); return "User-agent: *\nAllow: /\n\(dis)\(o["sitemap"].map{"\nSitemap: \($0)"} ?? "")".trimmingCharacters(in:.whitespacesAndNewlines); case "canonical": return "<link rel=\"canonical\" href=\"\(esc(url))\" />"; case "hreflang": let rows=lines(o["rows"] ?? ""); guard !rows.isEmpty else {throw NativeSimpleError.message("Enter rows as lang,url")}; return rows.map{let p=$0.split(separator:",",maxSplits:1).map(String.init); return "<link rel=\"alternate\" hreflang=\"\(esc(p.first ?? ""))\" href=\"\(esc(p.count>1 ? p[1] : ""))\" />"}.joined(separator:"\n"); case "utm": var c=URLComponents(string:o["url"] ?? "https://example.com/")!; var q=c.queryItems ?? []; if let s=o["source"],!s.isEmpty {q.append(URLQueryItem(name:"utm_source",value:s))}; if let m=o["medium"],!m.isEmpty {q.append(URLQueryItem(name:"utm_medium",value:m))}; if let camp=o["campaign"],!camp.isEmpty {q.append(URLQueryItem(name:"utm_campaign",value:camp))}; c.queryItems=q; return c.string!; case "redirect": let from=o["from"] ?? "/old"; let to=o["to"] ?? "/"; return "# nginx\nrewrite ^\(from)$ \(to) permanent;\n\n# netlify\n\(from) \(to) 301\n\n<!-- meta -->\n<meta http-equiv=\"refresh\" content=\"0;url=\(esc(to))\">"; case "robots-test": return try robotsTest(o); case "sitemap-validator": return try sitemapValidator(o); case "jsonld-validator": return try jsonldValidator(o); case "headings": return try headings(o); case "slug": let text=(o["text"] ?? "").folding(options:.diacriticInsensitive,locale:.current).lowercased(); let stops=Set((o["stopwords"] ?? "the,a,an,and,or,of,to,in,on,for,with,by").split(separator:",").map{$0.trimmingCharacters(in:.whitespaces)}); return text.replacingOccurrences(of:"[^A-Za-z0-9\\p{L}\\p{N}]+",with:"-",options:.regularExpression).trimmingCharacters(in:CharacterSet(charactersIn:"-")).split(separator:"-").filter{!stops.contains(String($0))}.joined(separator:"-"); case "title-length": return lengthJSON(o["text"] ?? "",60,"Within common working guidance; search engines may still rewrite it.","Above common guidance; consider shortening the visible title."); case "description-length": return lengthJSON(o["text"] ?? "",160,"Within common working guidance; snippets are not guaranteed.","Above common guidance; search engines may truncate or rewrite it."); case "robots-meta": var parts=[o["index"]=="noindex" ? "noindex":"index",o["follow"]=="nofollow" ? "nofollow":"follow"]; if o["snippet"]=="nosnippet" {parts.append("nosnippet")}; if let x=o["maxSnippet"],!x.isEmpty {parts.append("max-snippet:\(x)")}; if let x=o["maxImage"],!x.isEmpty {parts.append("max-image-preview:\(x)")}; return "<meta name=\"robots\" content=\"\(esc(parts.joined(separator:", ")))\" />"; case "llms-txt": return "# \(title)\n\n> \(desc)\n\n## About\n- \(url)\n\n## Important pages\n- \(o["pages"] ?? "/")"; case "manifest": return prettyJSONObject(["name":o["name"] ?? "App","short_name":o["short_name"] ?? "App","start_url":"/","display":"standalone","background_color":"#ffffff","theme_color":o["theme"] ?? "#0d9f8a"]); default: throw NativeSimpleError.message("Unknown SEO operation: \(op)") } }
    private static func esc(_ s:String)->String { s.replacingOccurrences(of:"&",with:"&amp;").replacingOccurrences(of:"<",with:"&lt;").replacingOccurrences(of:">",with:"&gt;").replacingOccurrences(of:"\"",with:"&quot;") }
    private static func prettyJSONObject(_ obj:[String:Any])->String { String(data:try! JSONSerialization.data(withJSONObject:obj,options:[.prettyPrinted]),encoding:.utf8)! }
    private static func lengthJSON(_ text:String,_ maxCount:Int,_ ok:String,_ bad:String)->String { prettyJSONObject(["characters":text.count,"guidance":text.count <= maxCount ? ok : bad]) }

    private static func jsonValue(_ raw:String,pretty:Bool) throws -> String {
        let value=try JSONSerialization.jsonObject(with:Data(raw.utf8),options:[.fragmentsAllowed])
        let options:JSONSerialization.WritingOptions = pretty ? [.prettyPrinted,.fragmentsAllowed] : [.fragmentsAllowed]
        return String(data:try JSONSerialization.data(withJSONObject:value,options:options),encoding:.utf8) ?? ""
    }
    private static func uuidValidation(_ raw:String) -> String {
        let value=raw.trimmingCharacters(in:.whitespacesAndNewlines)
        let regex=try! NSRegularExpression(pattern:"^[0-9a-f]{8}-[0-9a-f]{4}-([1-5])[89ab][0-9a-f]{3}-[89ab][0-9a-f]{4}-[0-9a-f]{12}$",options:[.caseInsensitive])
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
