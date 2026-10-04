package com.chastech.env.engine

import android.util.Base64
import com.chastech.env.data.ToolRecord
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.text.Normalizer
import java.time.LocalDate
import java.util.Locale
import java.util.UUID
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

/**
 * Native-first port of the web generator/network/SEO/CSS utility engines.
 * The catalog's engine.op is the source of truth; tool IDs are never used as a substitute.
 */
object NativeUtilityEngine {
    data class Output(val text: String, val filename: String = "env-output.txt")

    private val generatorOps = setOf(
        "baby-generator","baby-list-generator","baby-name-generator","baby-picker","baby-randomizer","baby-wheel",
        "character-generator","character-list-generator","character-picker","character-randomizer","character-wheel",
        "city-generator","city-list-generator","city-picker","city-randomizer","city-wheel",
        "coin-flip","color-list-generator","color-randomizer","color-wheel",
        "country-generator","country-list-generator","country-picker","country-randomizer","country-wheel",
        "date-generator","date-list-generator","date-picker","date-randomizer","date-wheel",
        "decision-generator","decision-list-generator","decision-picker","decision-randomizer","decision-wheel",
        "dice-roller","dummy-csv","dummy-json","dummy-products","dummy-sql","dummy-users",
        "emoji-generator","emoji-list-generator","emoji-picker","emoji-randomizer","emoji-wheel",
        "fantasy-generator","fantasy-list-generator","fantasy-name-generator","fantasy-picker","fantasy-randomizer","fantasy-wheel",
        "gamer-generator","gamer-list-generator","gamer-name-generator","gamer-picker","gamer-randomizer","gamer-wheel",
        "group-generator","group-list-generator","group-picker","group-randomizer","group-wheel",
        "hashtags","lorem","name-generator","name-list-generator","name-picker","name-randomizer","name-wheel",
        "nickname-generator","number-generator","number-list-generator","number-picker","number-randomizer","number-wheel",
        "passphrase","pet-generator","pet-list-generator","pet-name-generator","pet-picker","pet-randomizer","pet-wheel",
        "plot-generator","random-city-generator","random-color-generator","random-country-generator","random-date-generator",
        "random-decision","random-hex","random-name-generator","random-number-generator","random-string","random-username-generator","random-word-generator",
        "secret-santa-generator","secret-santa-list-generator","secret-santa-picker","secret-santa-randomizer","secret-santa-wheel",
        "secure-token","story-generator","story-list-generator","story-picker","story-prompt-generator","story-randomizer","story-wheel",
        "team-generator","team-list-generator","team-picker","team-randomizer","team-wheel",
        "test-address","test-email","test-names","test-phone",
        "time-generator","time-list-generator","time-picker","time-randomizer","time-wheel",
        "username","username-list-generator","username-picker","username-randomizer","username-wheel",
        "uuid-list","wheel","word-generator","word-list-generator","word-picker","word-randomizer","word-wheel",
        "writing-prompt-generator","yes-no-generator"
    )

    private val networkOps = setOf(
        "basic-auth-header","bearer-header","cidr-calculator","connection-info","content-type-reference","header-format","header-parser",
        "http-method-reference","http-status-reference","ipv4-binary","ipv4-broadcast-address","ipv4-calculator","ipv4-decimal","ipv4-host-count",
        "ipv4-host-range","ipv4-mask-from-prefix","ipv4-network-address","ipv4-prefix-from-mask","ipv4-split-subnets","ipv4-subnet-count","ipv4-wildcard-mask",
        "ipv6-address-type","ipv6-binary","ipv6-compress","ipv6-expand","ipv6-subnet-calculator","localhost-url-builder","port-lookup","port-reference",
        "subnet-calculator","url-decode","url-encode","url-origin","url-path-analyzer","url-query-builder","url-query-parser","websocket-url-builder"
    )

    private val seoOps = setOf("canonical","description-length","headings","hreflang","jsonld-validator","llms-txt","manifest","meta","og","redirect","robots","robots-meta","robots-test","schema","serp","sitemap","sitemap-validator","title-length","twitter-card","utm")

    private val developerOps = setOf("cron-generator","cron-parser","data-uri-generator","http-status-lookup","json-beautifier","json-formatter","json-minifier","json-validator","jwt-decoder","jwt-expiration-checker","markdown-preview","markdown-to-html","query-string-parser","regex-replace","regex-tester","url-parser","user-agent-parser","uuid-generator","uuid-validator")

    private val cssFamilies = setOf("avatar","badge","blob","border","button","card","glass","gradient","input","neomorph","noise","pattern","shadow","wave")

    private val commonPorts = linkedMapOf(
        20 to "FTP data",21 to "FTP control",22 to "SSH",23 to "Telnet",25 to "SMTP",53 to "DNS",67 to "DHCP server",68 to "DHCP client",80 to "HTTP",110 to "POP3",123 to "NTP",143 to "IMAP",161 to "SNMP",194 to "IRC",389 to "LDAP",443 to "HTTPS",445 to "SMB",465 to "SMTPS",587 to "SMTP submission",636 to "LDAPS",993 to "IMAPS",995 to "POP3S",1433 to "MS SQL Server",1521 to "Oracle",2049 to "NFS",2375 to "Docker",2376 to "Docker TLS",3000 to "Development HTTP",3306 to "MySQL",3389 to "RDP",5432 to "PostgreSQL",5672 to "AMQP",6379 to "Redis",8080 to "HTTP alternate",8443 to "HTTPS alternate",9200 to "Elasticsearch"
    )

    private val httpStatuses = listOf(200 to "OK",201 to "Created",204 to "No Content",301 to "Moved Permanently",302 to "Found",304 to "Not Modified",400 to "Bad Request",401 to "Unauthorized",403 to "Forbidden",404 to "Not Found",405 to "Method Not Allowed",409 to "Conflict",429 to "Too Many Requests",500 to "Internal Server Error",502 to "Bad Gateway",503 to "Service Unavailable",504 to "Gateway Timeout")
    private val httpMethods = listOf("GET" to "Retrieve a representation","POST" to "Submit data for processing","PUT" to "Replace a resource","PATCH" to "Partially modify a resource","DELETE" to "Remove a resource","HEAD" to "Headers without response body","OPTIONS" to "Discover communication options","CONNECT" to "Establish a tunnel","TRACE" to "Diagnostic loop-back method")
    private val contentTypes = listOf("application/json","application/xml","application/x-www-form-urlencoded","multipart/form-data","text/plain","text/html","text/css","text/javascript","image/png","image/jpeg","image/webp","audio/mpeg","video/mp4")

    private val ADJ = listOf("bright","calm","clever","crisp","fair","gentle","keen","lucky","noble","quick","rapid","silent","solar","steady","swift","vivid","wild","zen","amber","coral")
    private val NOUN = listOf("harbor","nexus","pebble","ridge","cedar","atlas","ember","willow","quartz","meadow","orbit","lantern","harbor","finch","cinder","grove","marble","pine","river","summit")
    private val FIRST = listOf("Amina","Jonah","Priya","Luca","Mei","Omar","Sofia","Noah","Elena","Kai","Hana","Diego","Leila","Mateo","Iris","Samir","Freya","Arjun","Nora","Theo")
    private val LAST = listOf("Okoye","Berg","Nakamura","Silva","Kowalski","Hassan","Nguyen","Patel","Costa","Ibrahim","Novak","Andersen","Garcia","Rahman","Petrov")
    private val CITIES = listOf("Lisbon","Nairobi","Osaka","Recife","Bergen","Hanoi","Accra","Valparaíso","Kraków","Muscat","Durban","Tbilisi","Cusco","Tallinn","Busan")
    private val COUNTRIES = listOf("Japan","Kenya","Portugal","Canada","Brazil","Norway","Ghana","Chile","Poland","Oman","Georgia","Peru","Estonia","South Korea","Morocco")
    private val WORDS = listOf("anchor","bramble","canvas","drift","echo","fjord","glimmer","harvest","inlet","jasper","kettle","lagoon","mirror","nectar","olive","plover","quarry","ripple","saffron","timber")
    private val FANTASY = listOf("Aerindel","Brynth","Caelora","Dravok","Elyndra","Faelith","Grommak","Hyral","Ithriel","Jorvask")
    private val EMOJIS = listOf("😀","😂","😍","🤔","🔥","🎉","🚀","❤️","⭐","🌍","🎵","🎮","🍕","☀️","🌈")
    private val PETS = listOf("Miso","Pebble","Nimbus","Fig","Clover","Sable","Pip","Maple")
    private val ROLES = listOf("explorer","inventor","guardian","scholar","rogue")
    private val STORY_ACTIONS = listOf("return","protect","invent","abandon")
    private val STORY_DEADLINES = listOf("dawn","winter","the tide","the trial")
    private val SUFFIXES = listOf("iel","or","eth","an","is")
    private val LOREM = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus. Suspendisse lectus tortor, dignissim sit amet, adipiscing nec, ultricies sed, dolor."

    fun supports(tool: ToolRecord): Boolean {
        if (tool.status.equals("planned", true)) return false
        val type = tool.engine.type
        val op = tool.engine.extras["op"] ?: tool.engine.id ?: tool.id
        return when (type) {
            "generator" -> generatorOps.contains(op)
            "network" -> networkOps.contains(op)
            "seo" -> seoOps.contains(op)
            "developer" -> developerOps.contains(op)
            "cssgen" -> {
                val family = op.substringBefore(":").let { if (it == "neumorphism") "neomorph" else it }
                cssFamilies.contains(family) && op.contains(":")
            }
            else -> false
        }
    }

    fun run(tool: ToolRecord, input: String = "", optionsJson: String = "{}"): Output {
        val op = tool.engine.extras["op"] ?: tool.engine.id ?: tool.id
        val opts = parseOptions(optionsJson)
        return when (tool.engine.type) {
            "generator" -> Output(runGenerator(op, opts), "env-$op.txt")
            "network" -> Output(runNetwork(op, input, opts), "env-network-$op.txt")
            "seo" -> Output(runSeo(op, opts), "env-seo-$op.txt")
            "developer" -> Output(runDeveloper(op, input, opts), "env-developer-$op.txt")
            "cssgen" -> runCss(op, opts)
            else -> error("No native utility engine for ${tool.engine.type}.")
        }
    }

    private fun regexOptions(flags: String): Set<RegexOption> = buildSet { if (flags.contains('i')) add(RegexOption.IGNORE_CASE); if (flags.contains('m')) add(RegexOption.MULTILINE); if (flags.contains('s')) add(RegexOption.DOT_MATCHES_ALL) }
    private fun parseOptions(raw: String): MutableMap<String, String> {
        if (raw.isBlank()) return mutableMapOf()
        val obj = runCatching { JSONObject(raw) }.getOrElse { error("Options must be valid JSON.") }
        val out = mutableMapOf<String, String>()
        obj.keys().forEach { key ->
            val value = obj.opt(key)
            out[key] = when (value) {
                null, JSONObject.NULL -> ""
                else -> value.toString()
            }
        }
        return out
    }

    private fun num(opts: Map<String, String>, key: String, defaultValue: Int): Int = opts[key]?.toDoubleOrNull()?.toInt() ?: defaultValue
    private fun pick(values: List<String>) = values[Random.nextInt(values.size)]
    private fun rnd(n: Int): Int = if (n <= 0) 0 else Random.nextInt(n)
    private fun token(length: Int): String {
        val chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        return buildString { repeat(max(0, length)) { append(chars[rnd(chars.length)]) } }
    }
    private fun hex(length: Int): String {
        val chars = "0123456789abcdef"
        return buildString { repeat(max(0, length)) { append(chars[rnd(chars.length)]) } }
    }
    private fun lines(text: String) = text.split("\r?\n".toRegex()).map { it.trim() }.filter { it.isNotEmpty() }
    private fun uniquePicks(items: List<String>, count: Int): List<String> = items.shuffled().take(count.coerceAtMost(items.size))
    private fun jsonPretty(list: List<Map<String, Any?>>): String {
        val arr = JSONArray()
        list.forEach { row ->
            val obj = JSONObject(); row.forEach { (k,v) -> obj.put(k, v) }; arr.put(obj)
        }
        return arr.toString(2)
    }
    private fun uuid() = UUID.randomUUID().toString()

    private fun runGenerator(op0: String, opts: Map<String, String>): String {
        val count = num(opts, "count", 8)
        val seed = (opts["seed"] ?: opts["keyword"] ?: opts["name"] ?: "nova").trim().ifEmpty { "nova" }
        val op = op0
        fun listPick(values: List<String>, n: Int = count) = List(max(0, n)) { pick(values) }
        return when (op) {
            "lorem" -> when (opts["unit"] ?: "paragraphs") {
                "words" -> listPick(WORDS, count).joinToString(" ")
                "sentences" -> List(count) { LOREM.substringBefore(". ") + "." }.joinToString(" ")
                else -> List(count) { LOREM }.joinToString("\n\n")
            }
            "dummy-json","dummyjson","dummy-users" -> jsonPretty(List(count) { i -> mapOf("id" to uuid(), "name" to "${pick(FIRST)} ${pick(LAST)}", "email" to "user${i+1}@example.com", "city" to pick(CITIES)) })
            "dummy-products" -> jsonPretty(List(count) { i -> mapOf("sku" to "${(opts["prefix"] ?: "SKU").uppercase(Locale.US)}-${1000+i}", "name" to "${pick(ADJ)} ${pick(NOUN)}", "price" to (9 + rnd(90))) })
            "dummy-csv" -> (listOf("name,email,city") + List(count) { "${pick(FIRST)} ${pick(LAST)},${pick(FIRST).lowercase()}@example.com,${pick(CITIES)}" }).joinToString("\n")
            "dummy-sql" -> "-- Fictional test data generated by enV\n" + List(count) { i -> "INSERT INTO users (id, name, email) VALUES (${i+1}, '${pick(FIRST)} ${pick(LAST)}', 'user${i+1}@example.com');" }.joinToString("\n")
            "passphrase" -> List(num(opts,"words",6)) { pick(WORDS) }.joinToString("-")
            "random-string" -> token(num(opts,"length",16))
            "random-hex" -> hex(num(opts,"length",16))
            "secure-token" -> token(num(opts,"length",32))
            "random-number-generator" -> {
                val minValue = opts["min"]?.toDoubleOrNull() ?: 1.0; val maxValue = opts["max"]?.toDoubleOrNull() ?: 100.0
                val lo = min(minValue,maxValue); val hi=max(minValue,maxValue)
                List(num(opts,"count",1)) { lo + Random.nextDouble() * (hi - lo + 1.0) }.joinToString("\n") { trimNumber(it) }
            }
            "random-name-generator","test-names" -> List(count) { "${pick(FIRST)} ${pick(LAST)}" }.joinToString("\n")
            "username","gamer-name-generator" -> List(count) { "${pick(ADJ)}${pick(NOUN)}${rnd(99)}" }.joinToString("\n")
            "random-country-generator","country-generator","country-picker","country-randomizer","country-wheel" -> if (op.endsWith("list-generator")) uniquePicks(COUNTRIES, min(count, COUNTRIES.size)).joinToString("\n") else List(if (op == "country-generator" || op == "random-country-generator") count else 1) { pick(COUNTRIES) }.joinToString("\n")
            "random-city-generator","city-generator","city-picker","city-randomizer","city-wheel" -> if (op.endsWith("list-generator")) uniquePicks(CITIES, min(count,CITIES.size)).joinToString("\n") else List(if (op == "city-generator" || op == "random-city-generator") count else 1) { pick(CITIES) }.joinToString("\n")
            "random-color-generator","color-randomizer","color-wheel","color-list-generator" -> List(if (op == "random-color-generator") count else if (op.endsWith("list-generator")) count else 1) { "#${hex(3)}" }.joinToString("\n")
            "random-word-generator","word-generator","word-picker","word-randomizer","word-wheel","word-list-generator" -> List(if (op == "random-word-generator" || op == "word-generator") count else if (op.endsWith("list-generator")) count else 1) { pick(WORDS) }.joinToString("\n")
            "random-date-generator","date-generator","date-picker","date-randomizer","date-wheel","date-list-generator" -> List(if (op == "random-date-generator" || op == "date-generator") count else if (op.endsWith("list-generator")) count else 1) { "%04d-%02d-%02d".format(Locale.US,1990+rnd(36),1+rnd(12),1+rnd(28)) }.joinToString("\n")
            "yes-no-generator" -> if (rnd(2)==0) "Yes" else "No"
            "random-decision","decision-generator","decision-picker","decision-randomizer","decision-wheel","decision-list-generator" -> {
                val options = lines(opts["options"] ?: opts["names"] ?: ""); require(options.size >= 2) { "Enter at least two options, one per line." }
                if (op.endsWith("list-generator")) uniquePicks(options, options.size).joinToString("\n") else pick(options)
            }
            "team-generator" -> buildTeams(lines(opts["names"] ?: ""), max(2, num(opts,"teams",2)))
            "team-picker","team-randomizer","team-wheel","team-list-generator" -> pick(lines(opts["names"] ?: "").ifEmpty { error("Enter names, one per line.") })
            "group-generator","group-picker","group-randomizer","group-wheel","group-list-generator" -> buildGroups(lines(opts["names"] ?: ""), max(2,num(opts,"groups",2)))
            "secret-santa-generator","secret-santa-picker","secret-santa-randomizer","secret-santa-wheel","secret-santa-list-generator" -> secretSanta(lines(opts["names"] ?: ""))
            "fantasy-name-generator" -> List(count) { pick(FANTASY)+pick(SUFFIXES) }.joinToString("\n")
            "fantasy-generator","fantasy-picker","fantasy-randomizer","fantasy-wheel","fantasy-list-generator" -> List(if (op.endsWith("list-generator")) count else 1) { pick(FANTASY)+pick(SUFFIXES) }.joinToString("\n")
            "nickname-generator" -> List(count) { seed.take(3)+pick(ADJ) }.joinToString("\n")
            "pet-name-generator","pet-generator","pet-picker","pet-randomizer","pet-wheel","pet-list-generator" -> List(if (op == "pet-name-generator" || op.endsWith("list-generator")) count else 1) { pick(PETS) }.joinToString("\n")
            "baby-name-generator","baby-generator","baby-picker","baby-randomizer","baby-wheel","baby-list-generator" -> List(if (op == "baby-name-generator" || op.endsWith("list-generator")) count else 1) { pick(FIRST) }.joinToString("\n")
            "story-prompt-generator","writing-prompt-generator" -> "${pick(FIRST)} must ${pick(STORY_ACTIONS)} a ${pick(NOUN)} before ${pick(STORY_DEADLINES)}."
            "plot-generator" -> "Character: ${pick(FIRST)}\nWant: a ${pick(NOUN)}\nObstacle: a ${pick(ADJ)} ${pick(NOUN)}"
            "biz-name","company-name","brand-name","product-name" -> List(count) { "${pick(ADJ)} $seed" }.joinToString("\n")
            "hashtags" -> seed.split(Regex("\\s+")).filter { it.isNotBlank() }.flatMap { listOf("#$it","#${it}tips","#${pick(ADJ)}$it") }.joinToString(" ")
            "uuid-list" -> List(count) { uuid() }.joinToString("\n")
            "coin-flip" -> if (rnd(2)==0) "Heads" else "Tails"
            "dice-roller" -> { val dice=max(1,min(100,(opts["dice"]?.toDoubleOrNull()?.toInt()?:1))); val sides=max(2,min(1000,(opts["sides"]?.toDoubleOrNull()?.toInt()?:6))); val rolls=List(dice){1+rnd(sides)}; "$dice${'d'}$sides: ${rolls.joinToString(", ")}\nTotal: ${rolls.sum()}" }
            "wheel","wheel-spinner" -> "Selected: ${pick(lines(opts["options"] ?: opts["items"] ?: opts["names"] ?: "").ifEmpty { error("Enter at least two options, one per line.") })}"
            "name-generator","name-picker","name-randomizer","name-wheel","name-list-generator","random-name-generator" -> List(if (op.endsWith("list-generator") || op=="random-name-generator") count else 1) { "${pick(FIRST)} ${pick(LAST)}" }.joinToString("\n")
            "username-generator","username-picker","username-randomizer","username-wheel","username-list-generator","random-username-generator" -> List(if (op.endsWith("list-generator") || op=="random-username-generator" || op=="username-generator") count else 1) { "${pick(ADJ)}${pick(NOUN)}${rnd(100)}" }.joinToString("\n")
            "number-generator","number-picker","number-randomizer","number-wheel","number-list-generator" -> List(if (op.endsWith("list-generator") || op=="number-generator") count else 1) { rnd(1000).toString() }.joinToString("\n")
            "emoji-generator","emoji-picker","emoji-randomizer","emoji-wheel","emoji-list-generator" -> List(if (op.endsWith("list-generator")) count else 1) { pick(EMOJIS) }.joinToString(" ")
            "date-generator","date-picker","date-randomizer","date-wheel","date-list-generator" -> List(if (op.endsWith("list-generator")) count else 1) { "%04d-%02d-%02d".format(Locale.US,1990+rnd(36),1+rnd(12),1+rnd(28)) }.joinToString("\n")
            "time-generator","time-picker","time-randomizer","time-wheel","time-list-generator" -> List(if (op.endsWith("list-generator")) count else 1) { "%02d:%02d".format(Locale.US,rnd(24),rnd(60)) }.joinToString("\n")
            "character-generator","character-picker","character-randomizer","character-wheel","character-list-generator" -> List(if (op.endsWith("list-generator")) count else 1) { "${pick(FIRST)} — ${pick(ADJ)} ${pick(ROLES)}" }.joinToString("\n")
            "gamer-name-generator","gamer-generator","gamer-picker","gamer-randomizer","gamer-wheel","gamer-list-generator" -> List(if (op.endsWith("list-generator")) count else if (op=="gamer-name-generator") count else 1) { "${pick(ADJ)}${pick(NOUN)}${rnd(999)}" }.joinToString("\n")
            "test-address" -> List(count) { "${100+rnd(900)} ${pick(NOUN).replaceFirstChar { it.uppercase() }} Street, ${pick(CITIES)}" }.joinToString("\n")
            "test-email" -> List(count) { i -> "${pick(FIRST).lowercase()}.${pick(LAST).lowercase()}${i}@example.com" }.joinToString("\n")
            "test-phone" -> List(count) { "+1-555-01${rnd(100).toString().padStart(2,'0')}" }.joinToString("\n")
            "group-generator","group-picker","group-randomizer","group-wheel","group-list-generator" -> buildGroups(lines(opts["names"] ?: ""), max(2,num(opts,"groups",2)))
            "story-generator","story-picker","story-randomizer","story-wheel","story-list-generator" -> List(if (op.endsWith("list-generator")) count else 1) { "Story seed: ${pick(FIRST)} discovers a ${pick(NOUN)} that could change everything." }.joinToString("\n")
            else -> error("Unknown generator operation: $op")
        }
    }

    private fun buildTeams(names: List<String>, k: Int): String {
        require(names.size >= k) { "Need at least as many names as teams." }
        val shuffled = names.shuffled(); val teams = List(k) { mutableListOf<String>() }
        shuffled.forEachIndexed { i,n -> teams[i%k].add(n) }
        return teams.mapIndexed { i,t -> "Team ${i+1}\n${t.joinToString("\n")}" }.joinToString("\n\n")
    }
    private fun buildGroups(names: List<String>, groups: Int): String {
        require(names.isNotEmpty()) { "Enter names, one per line." }
        val buckets=List(groups.coerceAtMost(names.size)) { mutableListOf<String>() }; names.shuffled().forEachIndexed { i,n -> buckets[i%buckets.size].add(n) }
        return buckets.mapIndexed { i,b -> "Group ${i+1}\n${b.joinToString("\n")}" }.joinToString("\n\n")
    }
    private fun secretSanta(names: List<String>): String {
        require(names.size>=2) { "Enter at least two names." }
        repeat(40) {
            val recv=names.shuffled(); if (recv.indices.all { recv[it] != names[it] }) return names.mapIndexed { i,n -> "$n → ${recv[i]}" }.joinToString("\n")
        }
        error("Could not build a derangement. Add more names.")
    }
    private fun trimNumber(value: Double): String = if (value % 1.0 == 0.0) value.toLong().toString() else "%.10g".format(Locale.US,value)

    private fun runNetwork(op: String, input0: String, opts: Map<String, String>): String {
        val input = input0.trim()
        when {
            op.startsWith("ipv4-") || op in setOf("ipv4-calculator","subnet-calculator","cidr-calculator") -> {
                val raw = (opts["address"] ?: input).ifBlank { "192.168.1.10/24" }
                val parsed = parseIPv4Prefix(raw); val prefix = parsed.second ?: (opts["prefix"]?.toIntOrNull() ?: 24); val ip = parsed.first; val r=ipv4Result(ip,prefix)
                return when(op){
                    "ipv4-calculator","subnet-calculator","cidr-calculator" -> "Address: ${ip.joinToString(".")}/$prefix\nNetwork: ${r.network}\nBroadcast: ${r.broadcast}\nFirst usable: ${r.first}\nLast usable: ${r.last}\nSubnet mask: ${r.mask}\nWildcard mask: ${r.wildcard}\nTotal addresses: ${r.total}\nUsable hosts: ${r.usable}"
                    "ipv4-binary" -> "Address: ${bits(ipToInt(ip))}\nMask: ${bits(maskInt(prefix))}"
                    "ipv4-decimal" -> ipToInt(ip).toString()
                    "ipv4-network-address" -> r.network
                    "ipv4-broadcast-address" -> r.broadcast
                    "ipv4-host-range" -> "${r.first} - ${r.last}"
                    "ipv4-wildcard-mask" -> r.wildcard
                    "ipv4-mask-from-prefix" -> r.mask
                    "ipv4-prefix-from-mask" -> maskPrefix(parseIPv4(opts["mask"] ?: input)).toString()
                    "ipv4-host-count" -> r.usable.toString()
                    "ipv4-subnet-count" -> "Addresses per /$prefix: ${r.total}\nUsable hosts: ${r.usable}"
                    "ipv4-split-subnets" -> "Subnet /$prefix -> network ${r.network}, broadcast ${r.broadcast}"
                    else -> r.toString()
                }
            }
            op.startsWith("ipv6-") -> return runIPv6(op, (opts["address"] ?: input).ifBlank { "2001:db8::1" }, opts["prefix"]?.toIntOrNull() ?: 64)
        }
        return when(op){
            "url-parser","url-query-parser","url-origin","url-path-analyzer" -> {
                val u=URI((opts["url"] ?: input).ifBlank { "https://example.com/path?x=1" }); val host=u.host ?: ""; val query=u.rawQuery ?: ""; val path=u.path.ifBlank { "/" }
                when(op){"url-parser" -> "Protocol: ${u.scheme ?: ""}\nUsername: ${u.userInfo?.substringBefore(":") ?: "—"}\nHost: ${u.rawAuthority ?: ""}\nHostname: $host\nPort: ${if(u.port==-1) "default" else u.port}\nPath: $path\nQuery: ${if(query.isBlank()) "—" else "?$query"}\nHash: ${if(u.rawFragment==null) "—" else "#${u.rawFragment}"}\nOrigin: ${(if(u.scheme!=null) "${u.scheme}://" else "")}${u.rawAuthority ?: ""}";"url-origin" -> "${u.scheme}://${u.rawAuthority}";"url-path-analyzer" -> "Path: $path\nSegments: ${path.split("/").filter{it.isNotEmpty()}.size}\nLast segment: ${path.split("/").filter{it.isNotEmpty()}.lastOrNull() ?: "—"}"; else -> if(query.isBlank()) "No query parameters." else query.split("&").filter{it.isNotBlank()}.joinToString("\n") { val p=it.split("=",limit=2); "${decodeURIComponent(p[0])} = ${if(p.size>1) decodeURIComponent(p[1]) else ""}" }}
            }
            "url-query-builder" -> { val u=URI(opts["url"] ?: input.ifBlank { "https://example.com/search" }); val name=opts["name"] ?: "q"; val value=opts["value"] ?: ""; val existing=u.rawQuery?.let{ "$it&" } ?: ""; "${u.scheme}://${u.rawAuthority}${u.rawPath}?${existing}${encodeURIComponent(name)}=${encodeURIComponent(value)}${if(u.rawFragment!=null) "#${u.rawFragment}" else ""}" }
            "url-encode" -> encodeURIComponent(opts["text"] ?: input)
            "url-decode" -> decodeURIComponent(opts["text"] ?: input)
            "port-lookup","port-reference" -> { val name=opts["name"]?.trim()?.lowercase(); if(!name.isNullOrBlank()) commonPorts.entries.filter { it.value.lowercase().contains(name) }.joinToString("\n") { "${it.key}: ${it.value}" }.ifBlank { "No match in the common-port reference." } else { val p=(opts["port"] ?: input).toIntOrNull() ?: 443; commonPorts[p]?.let { "$p/TCP or UDP: $it" } ?: "$p: not in the built-in common-port reference." } }
            "http-status-reference" -> httpStatuses.joinToString("\n") { "${it.first}: ${it.second}" }
            "header-format","header-parser" -> lines(opts["headers"] ?: input.ifBlank { "Content-Type: application/json\nAuthorization: Bearer YOUR_TOKEN" }).map { line -> val i=line.indexOf(":"); if(i>0) "${line.substring(0,i).trim()}: ${line.substring(i+1).trim()}" else line }.let { rows -> if(op=="header-parser") rows.map { val i=it.indexOf(":"); if(i>0) "${it.substring(0,i)} → ${it.substring(i+1).trim()}" else it }.joinToString("\n") else rows.joinToString("\n") }
            "basic-auth-header" -> "Basic ${Base64.encodeToString("${opts["username"] ?: ""}:${opts["password"] ?: ""}".toByteArray(StandardCharsets.UTF_8), Base64.NO_WRAP)}"
            "bearer-header" -> "Bearer ${opts["token"] ?: input}"
            "connection-info" -> "Online status is device/runtime dependent; native engine cannot expose browser Network Information API fields."
            "http-method-reference" -> httpMethods.joinToString("\n") { "${it.first}: ${it.second}" }
            "content-type-reference" -> contentTypes.joinToString("\n")
            "websocket-url-builder" -> { val host=(opts["host"] ?: input).removePrefix("http://").removePrefix("https://").trimEnd('/').ifBlank { "example.com" }; val path=(opts["path"] ?: "/socket").let { if(it.startsWith("/")) it else "/$it" }; val secure=(opts["secure"] ?: "true").lowercase() != "false"; "${if(secure)"wss" else "ws"}://$host$path" }
            "localhost-url-builder" -> { val protocol=opts["protocol"].orEmpty().ifBlank{"http"}; val host=opts["host"].orEmpty().ifBlank{"localhost"}; val port=opts["port"].orEmpty().ifBlank{"3000"}; val path=opts["path"].orEmpty().ifBlank{"/"}; "$protocol://$host:$port${if(path.startsWith("/"))path else "/$path"}" }
            else -> error("Unknown network operation: $op")
        }
    }

    private data class IPv4Result(val network:String,val broadcast:String,val first:String,val last:String,val mask:String,val wildcard:String,val total:Long,val usable:Long)
    private fun parseIPv4(value:String): IntArray { val p=value.trim().split('.'); require(p.size==4 && p.all { it.matches(Regex("\\d+")) && it.toInt() in 0..255 }) { "Enter a valid IPv4 address." }; return p.map{it.toInt()}.toIntArray() }
    private fun parseIPv4Prefix(value:String): Pair<IntArray,Int?> { val raw=value.trim().split('/'); return parseIPv4(raw[0]) to raw.getOrNull(1)?.toIntOrNull() }
    private fun ipToInt(p:IntArray):Long = ((p[0].toLong() shl 24) or (p[1].toLong() shl 16) or (p[2].toLong() shl 8) or p[3].toLong()) and 0xffffffffL
    private fun intToIp(n:Long) = listOf((n ushr 24) and 255,(n ushr 16) and 255,(n ushr 8) and 255,n and 255).joinToString(".")
    private fun maskInt(prefix:Int):Long { require(prefix in 0..32){"Prefix must be between 0 and 32."}; return if(prefix==0)0 else (0xffffffffL shl (32-prefix)) and 0xffffffffL }
    private fun bits(n:Long) = n.toString(2).padStart(32,'0').chunked(8).joinToString(" ")
    private fun ipv4Result(ip:IntArray,prefix:Int):IPv4Result { val n=ipToInt(ip); val mask=maskInt(prefix); val network=n and mask; val broadcast=network or (mask.inv() and 0xffffffffL); val total=1L shl (32-prefix); val usable=if(prefix>=31) total else max(0L,total-2); return IPv4Result(intToIp(network),intToIp(broadcast),if(prefix>=31)intToIp(network) else intToIp(network+1),if(prefix>=31)intToIp(broadcast) else intToIp(broadcast-1),intToIp(mask),intToIp(mask.inv() and 0xffffffffL),total,usable) }
    private fun maskPrefix(ip:IntArray):Int { val n=ipToInt(ip); return n.toString(2).padStart(32,'0').indexOf('0').let { if(it<0) 32 else it } }

    private fun runIPv6(op:String, raw:String, prefix:Int):String {
        val n=parseIPv6(raw.substringBefore('/'))
        return when(op){
            "ipv6-expand" -> expand6(n)
            "ipv6-compress" -> compress6(n)
            "ipv6-binary" -> n.joinToString("") { it.toString(2).padStart(16,'0') }.chunked(16).joinToString(" ")
            "ipv6-address-type" -> { val first=n[0].toInt(); when { n.all{it==0.toUShort()} -> "Unspecified (::)"; n.dropLast(1).all{it==0.toUShort()} && n.last()==1.toUShort() -> "Loopback (::1)"; (first and 0xfe00)==0xfc00 -> "Unique local (fc00::/7)"; (first and 0xff00)==0xff00 -> "Multicast (ff00::/8)"; n[0]==0.toUShort() && n[1]==0.toUShort() && n[2]==0.toUShort() && n[3]==0.toUShort() && n[4]==0.toUShort() && n[5]==0xffff.toUShort() -> "IPv4-mapped IPv6"; else -> "Global/unicast or other address" } }
            else -> { require(prefix in 0..128); val split=prefix/16; val rem=prefix%16; val network=n.copyOf(); if(split<8){ if(rem==0){ for(i in split until 8) network[i]=0u } else { network[split]=(network[split].toInt() and (0xffff shl (16-rem))).toUShort(); for(i in split+1 until 8) network[i]=0u } }; val first=network.copyOf(); val last=network.copyOf(); var idx=7; var bitsToSet=128-prefix; while(bitsToSet>0 && idx>=0){ val take=min(16,bitsToSet); val mask=((1 shl take)-1); last[idx]=(last[idx].toInt() or mask).toUShort(); bitsToSet-=take; idx-- }; "Network: ${compress6(network)}/$prefix\nFirst: ${compress6(first)}\nLast: ${compress6(last)}\nAddresses: 2^${128-prefix}" }
        }
    }
    private fun parseIPv6(raw:String):UShortArray { val value=raw.trim().lowercase().substringBefore('%'); val halves=value.split("::"); require(halves.size<=2){"Invalid IPv6 address."}; val left=if(halves[0].isBlank())emptyList() else halves[0].split(':'); val right=if(halves.size==2 && halves[1].isNotBlank())halves[1].split(':') else emptyList(); val total=left.size+right.size; require(total<=8){"Invalid IPv6 address."}; val fill=if(halves.size==2)8-total else 0; require(halves.size==1 && total==8 || halves.size==2){"Invalid IPv6 address."}; val parts=(left+List(fill){"0"}+right).map{it.toIntOrNull(16)?.takeIf{v->v in 0..65535}?.toUShort() ?: error("Invalid IPv6 address.")}; return parts.toUShortArray() }
    private fun expand6(g:UShortArray) = g.joinToString(":") { it.toString().padStart(4,'0') }
    private fun compress6(g: UShortArray): String {
        val groups = g.map { it.toInt().toString(16) }
        var bestStart = -1
        var bestLen = 0
        var i = 0
        while (i < 8) {
            if (groups[i] == "0") {
                var j = i
                while (j < 8 && groups[j] == "0") j++
                if (j - i > bestLen) {
                    bestStart = i
                    bestLen = j - i
                }
                i = j
            } else i++
        }
        if (bestLen < 2) return groups.joinToString(":")
        val left = groups.take(bestStart).joinToString(":")
        val right = groups.drop(bestStart + bestLen).joinToString(":")
        return when {
            left.isEmpty() && right.isEmpty() -> "::"
            left.isEmpty() -> "::$right"
            right.isEmpty() -> "$left::"
            else -> "$left::$right"
        }
    }

    private fun encodeURIComponent(input: String): String {
        val safe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()"
        val bytes = input.toByteArray(StandardCharsets.UTF_8)
        val sb = StringBuilder()
        bytes.forEach { b ->
            val c = (b.toInt() and 255).toChar()
            if (c in safe) sb.append(c)
            else sb.append('%').append("%02X".format(Locale.US, b.toInt() and 255))
        }
        return sb.toString()
    }

    private fun decodeURIComponent(input: String): String {
        val out = java.io.ByteArrayOutputStream()
        var i = 0
        while (i < input.length) {
            val c = input[i]
            if (c == '%' && i + 2 < input.length) {
                out.write(input.substring(i + 1, i + 3).toInt(16))
                i += 3
            } else {
                out.write(c.code)
                i++
            }
        }
        return out.toByteArray().toString(StandardCharsets.UTF_8)
    }

    private fun esc(s: String): String = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

    private fun runDeveloper(op: String, input: String, opts: Map<String, String>): String {
        val secondary = opts["secondary"] ?: opts["test"] ?: opts["second"] ?: ""
        val flags = opts["flags"] ?: "g"
        fun b64UrlDecode(value: String): String {
            val normalized = value.replace('-', '+').replace('_', '/').let { it + "=".repeat((4 - it.length % 4) % 4) }
            return String(Base64.decode(normalized, Base64.DEFAULT), StandardCharsets.UTF_8)
        }
        fun pretty(raw: String, indent: Int = 2): String = JSONObject(raw).toString(indent)
        fun jsonMin(raw: String): String = JSONObject(raw).toString()
        fun uuidValid(raw: String): String = if (Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][89ab][0-9a-f]{3}-[89ab][0-9a-f]{4}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE).matches(raw.trim())) "Valid UUID" else "Invalid UUID"
        fun uuid(): String = UUID.randomUUID().toString()
        fun decode(kind: String, raw: String): String = when(kind) {
            "base64" -> String(Base64.decode(raw.replace(Regex("\\s"), ""), Base64.DEFAULT), StandardCharsets.UTF_8)
            "uri" -> URLDecoder.decode(raw.replace("+", "%20"), StandardCharsets.UTF_8.name())
            "unicode" -> raw.replace(Regex("\\u([0-9a-fA-F]{4})")) { it.groupValues[1].toInt(16).toChar().toString() }
            "html" -> raw.replace("&lt;","<").replace("&gt;",">").replace("&quot;", "\"").replace("&#39;", "'").replace("&amp;", "&")
            else -> raw
        }
        fun encode(kind: String, raw: String): String = when(kind) {
            "base64" -> Base64.encodeToString(raw.toByteArray(StandardCharsets.UTF_8), Base64.NO_WRAP)
            "uri" -> encodeURIComponent(raw)
            "unicode" -> raw.map { "\\u%04x".format(it.code) }.joinToString("")
            "html" -> raw.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;")
            else -> raw
        }
        fun jsonToCsv(raw: String): String {
            val arr = JSONArray(raw); if (arr.length()==0) return ""
            val keys = linkedSetOf<String>(); for (i in 0 until arr.length()) { val o=arr.optJSONObject(i) ?: continue; o.keys().forEach { keys += it } }
            val cols=keys.toList(); fun cell(v:Any?):String { val x=v?.toString() ?: ""; return if(Regex("[\",\n\r]").containsMatchIn(x)) "\"${x.replace("\"","\"\"")}\"" else x };
            return (listOf(cols.joinToString(",")) + (0 until arr.length()).map { i -> val o=arr.optJSONObject(i); cols.joinToString(","){k->cell(o?.opt(k))} }).joinToString("\n")
        }
        fun csvRows(raw:String): List<List<String>> {
            val rows=mutableListOf<MutableList<String>>(); var row=mutableListOf<String>(); var cell=StringBuilder(); var quoted=false; var i=0;
            while(i<raw.length){ val ch=raw[i]; if(ch=='\"'){ if(quoted && i+1<raw.length && raw[i+1]=='\"'){cell.append('\"');i++} else quoted=!quoted } else if(ch==',' && !quoted){row.add(cell.toString());cell=StringBuilder()} else if((ch=='\n'||ch=='\r')&&!quoted){ if(ch=='\r'&&i+1<raw.length&&raw[i+1]=='\n')i++;row.add(cell.toString());cell=StringBuilder();if(row.any{it.isNotEmpty()})rows.add(row);row=mutableListOf()} else cell.append(ch);i++ }
            row.add(cell.toString()); if(row.any{it.isNotEmpty()}) rows.add(row); return rows
        }
        fun csvToJson(raw:String):String { val rows=csvRows(raw); if(rows.isEmpty()) return "[]"; val h=rows.first(); val out=JSONArray(); rows.drop(1).forEach{r-> val o=JSONObject(); h.forEachIndexed{i,k->o.put(if(k.isBlank())"column_${i+1}" else k,r.getOrElse(i){""})}; out.put(o)}; return out.toString(2) }
        return when {
            op.startsWith("regex-") -> { val subject=secondary.ifBlank{input}; val re=Regex(input, regexOptions(flags)); val matches=re.findAll(subject).toList(); if(op=="regex-replace") subject.replace(re, opts["replacement"] ?: "") else "Pattern: /$input/\nMatches: ${matches.size}\n\n${matches.mapIndexed{i,m->"${i+1}. ${m.value} at index ${m.range.first}"}.joinToString("\n").ifBlank{"No matches"}}" }
            op=="jwt-decoder" || op=="jwt-expiration-checker" -> { val parts=input.trim().split('.'); require(parts.size==3){"A JWT must contain three dot-separated parts."}; val payload=JSONObject(b64UrlDecode(parts[1])); val exp=payload.optLong("exp",Long.MIN_VALUE); JSONObject(mapOf("payload" to payload.toString(),"signaturePresent" to parts[2].isNotBlank(),"expiresAt" to if(exp==Long.MIN_VALUE)"none" else java.time.Instant.ofEpochSecond(exp).toString(),"expired" to if(exp==Long.MIN_VALUE)null else System.currentTimeMillis()/1000 >= exp)).toString(2) }
            op=="uuid-generator" -> List(max(1, min(100, (opts["count"]?.toIntOrNull() ?: 10)))) { uuid() }.joinToString("\n")
            op=="uuid-validator" -> uuidValid(input)
            op=="json-beautifier" || op=="json-formatter" || op=="json-minifier" || op=="json-validator" -> { if(op=="json-validator"){JSONObject(input);"Valid JSON."} else if(op=="json-minifier") jsonMin(input) else pretty(input) }
            op=="query-string-parser" -> { val u=URI(input.ifBlank{"https://example.com/?a=1&b=2"}); (u.rawQuery ?: "").split('&').filter{it.isNotBlank()}.joinToString("\n"){val p=it.split('=',limit=2); "${decodeURIComponent(p[0])} = ${if(p.size>1)decodeURIComponent(p[1]) else ""}"} }
            op=="url-parser" -> runNetwork("url-parser", input, opts)
            op=="http-status-lookup" -> runNetwork("http-status-reference", "", opts).lineSequence().firstOrNull{it.startsWith(input.trim()+":") || it.startsWith(input.trim()+" ")} ?: "Unknown status code"
            op=="data-uri-generator" -> "data:text/plain;base64,${encode("base64",input)}"
            op=="markdown-preview" || op=="markdown-to-html" -> input.replace(Regex("\\*\\*(.+?)\\*\\*"),"<strong>$1</strong>").replace(Regex("`(.+?)`"),"<code>$1</code>").replace(Regex("^# (.+)$",RegexOption.MULTILINE),"<h1>$1</h1>").replace(Regex("\\n\\n+"),"<br><br>")
            op=="user-agent-parser" -> { val ua=if(input.isBlank())"Mozilla/5.0" else input; "User-Agent: $ua\nPlatform: ${when{ua.contains("Android",true)->"Android";ua.contains("iPhone",true)->"iOS";ua.contains("Windows",true)->"Windows";ua.contains("Mac OS",true)->"macOS";ua.contains("Linux",true)->"Linux";else->"Unknown"}}" }
            op=="cron-generator" || op=="cron-parser" -> "Cron: ${input.ifBlank{"* * * * *"}}\nFive-field format: minute hour day-of-month month day-of-week"
            else -> input
        }
    }

    private fun runSeo(op: String, opts: Map<String, String>): String {
        val title = opts["title"] ?: opts["name"] ?: "Page title"
        val desc = opts["description"] ?: "A short description."
        val url = opts["url"] ?: opts["canonical"] ?: "https://example.com/"
        return when (op) {
            "meta" -> listOf(
                "<title>${esc(title)}</title>",
                "<meta name=\"description\" content=\"${esc(desc)}\" />",
                opts["canonical"]?.takeIf { it.isNotBlank() }?.let { "<link rel=\"canonical\" href=\"${esc(it)}\" />" }
            ).filterNotNull().joinToString("\n")
            "serp" -> "$title\n$url\n$desc"
            "og" -> listOf(
                "<meta property=\"og:title\" content=\"${esc(title)}\" />",
                "<meta property=\"og:description\" content=\"${esc(desc)}\" />",
                "<meta property=\"og:image\" content=\"${esc(opts["image"] ?: "")}\" />",
                "<meta property=\"og:url\" content=\"${esc(url)}\" />",
                "<meta property=\"og:type\" content=\"website\" />"
            ).joinToString("\n")
            "twitter-card" -> listOf(
                "<meta name=\"twitter:card\" content=\"summary_large_image\" />",
                "<meta name=\"twitter:title\" content=\"${esc(title)}\" />",
                "<meta name=\"twitter:description\" content=\"${esc(desc)}\" />",
                "<meta name=\"twitter:image\" content=\"${esc(opts["image"] ?: "")}\" />"
            ).joinToString("\n")
            "schema" -> "<script type=\"application/ld+json\">\n${JSONObject(mapOf("@context" to "https://schema.org", "@type" to (opts["kind"] ?: "WebSite"), "name" to title, "description" to desc)).toString(2)}\n</script>"
            "sitemap" -> {
                val urls = lines(opts["urls"] ?: url)
                val body = urls.joinToString("\n") { "  <url>\n    <loc>${esc(it)}</loc>\n  </url>" }
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n$body\n</urlset>"
            }
            "robots" -> {
                val dis = lines(opts["disallow"] ?: "").joinToString("\n") { "Disallow: $it" }
                "User-agent: *\nAllow: /\n$dis${if (!opts["sitemap"].isNullOrBlank()) "\nSitemap: ${opts["sitemap"]}" else ""}".trim()
            }
            "canonical" -> "<link rel=\"canonical\" href=\"${esc(url)}\" />"
            "hreflang" -> {
                val rows = lines(opts["rows"] ?: "")
                require(rows.isNotEmpty()) { "Enter rows as lang,url" }
                rows.joinToString("\n") {
                    val p = it.split(',', limit = 2)
                    "<link rel=\"alternate\" hreflang=\"${esc((p.getOrNull(0) ?: "").trim())}\" href=\"${esc((p.getOrNull(1) ?: "").trim())}\" />"
                }
            }
            "utm" -> {
                val u = URI(opts["url"] ?: "https://example.com/")
                val q = mutableListOf<String>()
                if (!u.rawQuery.isNullOrBlank()) q += u.rawQuery
                listOf("utm_source" to opts["source"], "utm_medium" to opts["medium"], "utm_campaign" to opts["campaign"]).forEach { (k, v) ->
                    if (!v.isNullOrBlank()) q += "${encodeURIComponent(k)}=${encodeURIComponent(v)}"
                }
                "${u.scheme}://${u.rawAuthority}${u.rawPath}${if (q.isNotEmpty()) "?${q.joinToString("&")}" else ""}${u.rawFragment?.let { "#$it" } ?: ""}"
            }
            "redirect" -> {
                val from = opts["from"] ?: "/old"; val to = opts["to"] ?: "/"
                "# nginx\nrewrite ^$from$ $to permanent;\n\n# netlify\n$from $to 301\n\n<!-- meta -->\n<meta http-equiv=\"refresh\" content=\"0;url=${esc(to)}\">"
            }
            "robots-test" -> {
                val rules = lines(opts["robots"] ?: "")
                val path = opts["path"] ?: "/"
                val agent = (opts["agent"] ?: "*").lowercase()
                var allowed = true; var best = -1; var matched = ""; var agents = listOf<String>()
                rules.forEach { line ->
                    val pair = line.split(':', limit = 2); if (pair.size < 2) return@forEach
                    val k = pair[0].trim().lowercase(); val v = pair[1].trim()
                    if (k == "user-agent") { agents = listOf(v.lowercase()); return@forEach }
                    if ((k == "allow" || k == "disallow") && (agents.contains("*") || agents.contains(agent)) && v.isNotBlank()) {
                        val regex = Regex("^" + Regex.escape(v).replace("\\\\*", ".*"), RegexOption.IGNORE_CASE)
                        if (regex.containsMatchIn(path) && v.length >= best) { best = v.length; allowed = k == "allow"; matched = v }
                    }
                }
                JSONObject(mapOf("agent" to agent, "path" to path, "allowed" to allowed, "matchedRule" to if (matched.isBlank()) JSONObject.NULL else matched)).toString(2)
            }
            "sitemap-validator" -> {
                val xml = opts["xml"] ?: ""; require(xml.isNotBlank()) { "Paste sitemap XML first." }
                val root = Regex("<\\s*([A-Za-z0-9:_-]+)").find(xml)?.groupValues?.getOrNull(1)?.substringAfter(':')
                require(root == "urlset" || root == "sitemapindex") { "Root element must be <urlset> or <sitemapindex>." }
                val locs = Regex("<loc>(.*?)</loc>", RegexOption.DOT_MATCHES_ALL).findAll(xml).map { it.groupValues[1].trim() }.filter { it.isNotEmpty() }.toList()
                val invalid = locs.filter { runCatching { URI(it) }.isFailure }
                JSONObject(mapOf("valid" to invalid.isEmpty(), "type" to root, "urlCount" to locs.size, "duplicateCount" to locs.size - locs.toSet().size, "invalidUrlCount" to invalid.size, "invalidUrls" to invalid.take(20))).toString(2)
            }
            "jsonld-validator" -> {
                val raw = opts["jsonld"] ?: ""; require(raw.isNotBlank()) { "Paste JSON-LD first." }
                val parsedObject = runCatching { JSONObject(raw) }.getOrNull()
                val parsedArray = if (parsedObject == null) runCatching { JSONArray(raw) }.getOrNull() else null
                require(parsedObject != null || parsedArray != null) { "Invalid JSON: fix the JSON syntax before validating JSON-LD." }
                val nodes = if (parsedArray != null) (0 until parsedArray.length()).map { parsedArray.optJSONObject(it) } else listOf(parsedObject)
                val missing = nodes.count { node -> node == null || !node.has("@context") }
                val types = nodes.mapNotNull { node -> node?.optString("@type")?.takeIf { v -> v.isNotBlank() } }
                val typeArray = JSONArray(); types.forEach { typeArray.put(it) }
                JSONObject(mapOf("validJson" to true, "hasSchemaContext" to (missing == 0), "types" to typeArray, "nodeCount" to nodes.size)).toString(2)
            }
            "headings" -> {
                val html = opts["html"] ?: ""; require(html.isNotBlank()) { "Paste HTML containing your headings." }
                val headingRegex = Regex("<h([1-6])\\b[^>]*>(.*?)</h\\1>", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL))
                val hs = headingRegex.findAll(html).map { m -> mapOf("level" to m.groupValues[1].toInt(), "text" to Regex("<[^>]+>").replace(m.groupValues[2], "").trim()) }.toList()
                val h1 = hs.count { it["level"] == 1 }
                val skipped = hs.windowed(2).filter { pair -> (pair[1]["level"] as Int) > (pair[0]["level"] as Int) + 1 }
                val skippedArray = JSONArray(); skipped.forEach { pair -> skippedArray.put(JSONObject(pair[1].mapValues { entry -> entry.value as Any? })) }
                val emptyArray = JSONArray(); hs.filter { (it["text"] as String).isBlank() }.forEach { emptyArray.put(JSONObject(it.mapValues { it.value as Any? })) }
                val outlineArray = JSONArray(); hs.forEach { outlineArray.put(JSONObject(it.mapValues { it.value as Any? })) }
                JSONObject(mapOf("headingCount" to hs.size, "h1Count" to h1, "missingH1" to (h1 == 0), "multipleH1" to (h1 > 1), "skippedLevels" to skippedArray, "emptyHeadings" to emptyArray, "outline" to outlineArray)).toString(2)
            }
            "slug" -> {
                val text = Normalizer.normalize(opts["text"] ?: "", Normalizer.Form.NFKD).replace(Regex("\\p{M}+"), "").lowercase().trim()
                val stops = (opts["stopwords"] ?: "the,a,an,and,or,of,to,in,on,for,with,by").split(',').map { it.trim() }.filter { it.isNotBlank() }.toSet()
                text.replace(Regex("[^\\p{L}\\p{N}]+"), "-").trim('-').split('-').filter { it.isNotBlank() && !stops.contains(it) }.joinToString("-")
            }
            "title-length" -> lengthJson(opts["text"] ?: "", 60, "Within common working guidance; search engines may still rewrite it.", "Above common guidance; consider shortening the visible title.")
            "description-length" -> lengthJson(opts["text"] ?: "", 160, "Within common working guidance; snippets are not guaranteed.", "Above common guidance; search engines may truncate or rewrite it.")
            "robots-meta" -> {
                val parts = mutableListOf(if (opts["index"] == "noindex") "noindex" else "index", if (opts["follow"] == "nofollow") "nofollow" else "follow")
                if (opts["snippet"] == "nosnippet") parts += "nosnippet"
                if (!opts["maxSnippet"].isNullOrBlank()) parts += "max-snippet:${opts["maxSnippet"]}"
                if (!opts["maxImage"].isNullOrBlank()) parts += "max-image-preview:${opts["maxImage"]}"
                "<meta name=\"robots\" content=\"${esc(parts.joinToString(", "))}\" />"
            }
            "llms-txt" -> "# $title\n\n> $desc\n\n## About\n- $url\n\n## Important pages\n- ${opts["pages"] ?: "/"}"
            "manifest" -> JSONObject(mapOf("name" to (opts["name"] ?: "App"), "short_name" to (opts["short_name"] ?: "App"), "start_url" to "/", "display" to "standalone", "background_color" to "#ffffff", "theme_color" to (opts["theme"] ?: "#0d9f8a"))).toString(2)
            else -> error("Unknown SEO operation: $op")
        }
    }

    private fun lengthJson(text: String, maxChars: Int, ok: String, bad: String): String {
        val n = text.codePointCount(0, text.length)
        return JSONObject(mapOf("characters" to n, "guidance" to if (n <= maxChars) ok else bad)).toString(2)
    }

    private fun runCss(op0: String, opts: Map<String, String>): Output {
        val parts = op0.split(':')
        val rawFamily = parts[0]
        val family = if (rawFamily == "neumorphism") "neomorph" else rawFamily
        val workflow = parts.getOrElse(1) { "tool" }
        val v = opts.toMutableMap().apply {
            putIfAbsent("from", "#0d9f8a"); putIfAbsent("to", "#1db87a"); putIfAbsent("angle", "135")
            putIfAbsent("x", "0"); putIfAbsent("y", "8"); putIfAbsent("blur", "24"); putIfAbsent("spread", "0"); putIfAbsent("color", "rgba(22,24,29,.18)")
        }
        val pair = cssFor(family, v)
        val generatedSvg = if (workflow == "svg" && pair.second == null) {
            "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"480\" height=\"240\" viewBox=\"0 0 480 240\"><rect width=\"480\" height=\"240\" rx=\"24\" fill=\"#ffffff\"/><rect x=\"40\" y=\"40\" width=\"400\" height=\"160\" rx=\"20\" fill=\"#0d9f8a\"/><text x=\"240\" y=\"132\" text-anchor=\"middle\" fill=\"#ffffff\" font-family=\"system-ui, sans-serif\" font-size=\"28\">enV $family</text></svg>"
        } else pair.second
        val code = if (workflow == "token" && generatedSvg == null) {
            ":root {\n  --env-$family: ${pair.first.replace("\n", "\\n")};\n}"
        } else generatedSvg ?: pair.first
        return Output(code, "env-$family-$workflow.${if (generatedSvg != null) "svg" else "css"}")
    }

    private fun cssFor(family: String, v: Map<String, String>): Pair<String, String?> {
        fun num(key: String, defaultValue: Double): Double = v[key]?.toDoubleOrNull() ?: defaultValue
        fun first(key: String, fallback: String): String = v[key] ?: fallback
        return when (family) {
            "gradient" -> "background: linear-gradient(${num("angle", 135.0).let { if (it == 0.0) 135.0 else it }}deg, ${first("from", "#0d9f8a")}, ${first("to", "#1db87a")});" to null
            "shadow" -> {
                val sh = "${num("x", 0.0)}px ${num("y", 0.0)}px ${max(0.0, num("blur", 0.0))}px ${num("spread", 0.0)}px ${first("color", "rgba(22,24,29,.18)")}"
                "box-shadow: $sh;" to null
            }
            "border" -> "border: ${max(0.0, num("width", 0.0))}px solid ${first("color", "#e4e0d8")};\nborder-radius: ${max(0.0, num("radius", 0.0))}px;" to null
            "button" -> "background: ${first("bg", "#0d9f8a")};\ncolor: ${first("text", "#ffffff")};\nborder: 0;\nborder-radius: ${num("radius", 0.0)}px;\npadding: ${num("py", 0.0)}px ${num("px", 0.0)}px;\ncursor: pointer;" to null
            "card" -> "background: #ffffff;\nborder: 1px solid ${first("border", "#e7e5e4")};\nborder-radius: ${num("radius", 0.0)}px;\npadding: ${num("pad", 0.0)}px;\nbox-shadow: 0 8px 24px rgb(22 24 29 / 0.08);" to null
            "badge" -> "background: ${first("bg", "#e8f7f3")};\ncolor: ${first("text", "#087f6d")};\nborder-radius: ${num("radius", 0.0)}px;\npadding: ${num("py", 0.0)}px ${num("px", 0.0)}px;\ndisplay: inline-block;" to null
            "input" -> "border: 1px solid ${first("border", "#d6d3d1")};\nborder-radius: ${num("radius", 0.0)}px;\noutline: none;\nbox-shadow: 0 0 0 3px color-mix(in srgb, ${first("focus", "#0d9f8a")} 18%, transparent);" to null
            "avatar" -> {
                val size = max(24.0, num("size", 96.0)); val radius = max(0.0, min(50.0, num("radius", 50.0)))
                "width: ${trimNumber(size)}px;\nheight: ${trimNumber(size)}px;\nbackground: ${first("bg", "#e7f7f3")};\nborder-radius: ${trimNumber(radius)}%;\nobject-fit: cover;" to null
            }
            "glass" -> "background: rgb(255 255 255 / ${first("alpha", "0.16")});\nbackdrop-filter: blur(${num("blur", 0.0)}px);\n-webkit-backdrop-filter: blur(${num("blur", 0.0)}px);\nborder: 1px solid rgb(255 255 255 / ${first("borderAlpha", "0.35")});" to null
            "neomorph" -> {
                val d = max(1.0, num("dist", 10.0))
                "border-radius: ${num("radius", 0.0)}px;\nbox-shadow: ${trimNumber(d)}px ${trimNumber(d)}px ${trimNumber(d * 2)}px #d1d1d1, -${trimNumber(d)}px -${trimNumber(d * 2)}px #ffffff;" to null
            }
            "pattern" -> {
                val size = max(6.0, num("size", 24.0)); val sizeText = trimNumber(size)
                val svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"$sizeText\" height=\"$sizeText\" viewBox=\"0 0 $sizeText $sizeText\"><path d=\"M0 0L$sizeText $sizeText M$sizeText 0L0 $sizeText\" stroke=\"${first("color", "#0d9f8a")}\" stroke-opacity=\"${first("opacity", "0.14")}\" stroke-width=\"1\"/></svg>"
                val data = "url(\"data:image/svg+xml,${encodeURIComponent(svg)}\")"
                "background-image: $data;\nbackground-size: ${sizeText}px ${sizeText}px;" to svg
            }
            "blob" -> {
                val seed = num("seed", 1.0)
                val points = List(10) { i ->
                    val a = (i / 10.0) * Math.PI * 2
                    val r = 38 + ((seed * (i + 3) * 13) % 20)
                    "${50 + cos(a) * r} ${50 + sin(a) * r}"
                }.joinToString(" ")
                val svg = "<svg viewBox=\"0 0 100 100\" xmlns=\"http://www.w3.org/2000/svg\"><polygon fill=\"#0d9f8a\" points=\"$points\"/></svg>"
                svg to svg
            }
            "wave" -> {
                val amp = num("amp", 24.0)
                val svg = "<svg viewBox=\"0 0 1440 120\" xmlns=\"http://www.w3.org/2000/svg\" preserveAspectRatio=\"none\"><path fill=\"#0d9f8a\" d=\"M0,60 C360,${trimNumber(60 - amp)} 720,${trimNumber(60 + amp)} 1440,60 L1440,120 L0,120 Z\"/></svg>"
                svg to svg
            }
            "noise" -> {
                val opacity = max(0.0, min(1.0, num("opacity", 0.06)))
                ".noise{position:relative;overflow:hidden}\n.noise::after{content:\"\";position:absolute;inset:0;opacity:${trimNumber(opacity)};background-image:url(\"data:image/svg+xml,...\");pointer-events:none}" to null
            }
            else -> error("Unknown CSS family: $family")
        }
    }

}
