package com.chastech.env.engine

import com.chastech.env.data.ToolRecord
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import java.io.StringReader
import java.io.InputStream
import java.nio.charset.StandardCharsets
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.text.Normalizer
import java.time.LocalDate
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Locale
import java.util.UUID
import javax.xml.parsers.DocumentBuilderFactory
import org.xml.sax.InputSource
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

    private val cssFamilies = setOf("avatar","badge","blob","border","button","card","glass","gradient","input","neomorph","noise","pattern","shadow","wave")

    private val commonPorts = linkedMapOf(
        20 to "FTP data",21 to "FTP control",22 to "SSH",23 to "Telnet",25 to "SMTP",53 to "DNS",67 to "DHCP server",68 to "DHCP client",80 to "HTTP",110 to "POP3",123 to "NTP",143 to "IMAP",161 to "SNMP",194 to "IRC",389 to "LDAP",443 to "HTTPS",445 to "SMB",465 to "SMTPS",587 to "SMTP submission",636 to "LDAPS",993 to "IMAPS",995 to "POP3S",1433 to "MS SQL Server",1521 to "Oracle",2049 to "NFS",2375 to "Docker",2376 to "Docker TLS",3000 to "Development HTTP",3306 to "MySQL",3389 to "RDP",5432 to "PostgreSQL",5672 to "AMQP",6379 to "Redis",8080 to "HTTP alternate",8443 to "HTTPS alternate",9200 to "Elasticsearch"
    )

    private val httpStatuses = listOf(200 to "OK",201 to "Created",204 to "No Content",301 to "Moved Permanently",302 to "Found",304 to "Not Modified",400 to "Bad Request",401 to "Unauthorized",403 to "Forbidden",404 to "Not Found",405 to "Method Not Allowed",409 to "Conflict",422 to "Unprocessable Content",429 to "Too Many Requests",500 to "Internal Server Error",502 to "Bad Gateway",503 to "Service Unavailable",504 to "Gateway Timeout")
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
            "developer" -> true
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
            "developer" -> Output(runDeveloperParity(op, input, opts), "env-$op.txt")
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

    private val secureRandom = SecureRandom()

    private fun num(opts: Map<String, String>, key: String, defaultValue: Int): Int = opts[key]?.toDoubleOrNull()?.toInt() ?: defaultValue
    private fun pick(values: List<String>) = values[Random.nextInt(values.size)]
    private fun rnd(n: Int): Int = if (n <= 0) 0 else Random.nextInt(n)
    private fun token(length: Int): String {
        require(length in 0..500) { "Token length must be between 0 and 500 characters." }
        val chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        return buildString { repeat(length) { append(chars[rnd(chars.length)]) } }
    }

    /** Parse security-sensitive length without the lossy truncation used by casual generator options. */
    private fun secureTokenLength(opts: Map<String, String>): Int {
        val raw = opts["length"]?.trim().orEmpty()
        if (raw.isEmpty()) return 32
        val value = raw.toDoubleOrNull()
        require(value != null && value.isFinite() && value % 1.0 == 0.0 && value in 1.0..500.0) {
            "Secure token length must be an integer from 1 through 500 characters."
        }
        return value.toInt()
    }

    /** Security-sensitive tokens use SecureRandom, never the casual pseudo-random generator above. */
    private fun secureToken(length: Int): String {
        require(length in 1..500) { "Secure token length must be between 1 and 500 characters." }
        val chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
        return buildString(length) { repeat(length) { append(chars[secureRandom.nextInt(chars.length)]) } }
    }

    /** Strict text decode: reject bad padding, noncanonical pad bits, and invalid UTF-8. */
    private fun encodeBase64NoWrap(bytes: ByteArray): String = java.util.Base64.getEncoder().encodeToString(bytes)

    private fun decodeBase64Text(input: String, urlSafe: Boolean = false): String {
        val compact = input.filterNot { it.isWhitespace() }
        val alphabet = if (urlSafe) "[A-Za-z0-9_-]" else "[A-Za-z0-9+/]"
        require(Regex("^(?:$alphabet)*(?:={0,2})$").matches(compact)) { "Invalid ${if (urlSafe) "Base64URL" else "Base64"} alphabet or padding." }
        val padIndex = compact.indexOf('=')
        val core = if (padIndex < 0) compact else compact.substring(0, padIndex)
        val padding = if (padIndex < 0) 0 else compact.length - padIndex
        require(core.length % 4 != 1 && (padding == 0 || (compact.length % 4 == 0 && ((padding == 1 && core.length % 4 == 3) || (padding == 2 && core.length % 4 == 2))))) {
            "Invalid ${if (urlSafe) "Base64URL" else "Base64"} length or padding."
        }
        val normalized = core + "=".repeat((4 - core.length % 4) % 4)
        val decoder = if (urlSafe) java.util.Base64.getUrlDecoder() else java.util.Base64.getDecoder()
        val bytes = try { decoder.decode(normalized) } catch (_: IllegalArgumentException) {
            throw IllegalArgumentException("Invalid ${if (urlSafe) "Base64URL" else "Base64"} input.")
        }
        val canonical = (if (urlSafe) java.util.Base64.getUrlEncoder() else java.util.Base64.getEncoder()).withoutPadding().encodeToString(bytes)
        require(canonical == core) { "Non-canonical ${if (urlSafe) "Base64URL" else "Base64"} trailing bits." }
        return try {
            StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()
        } catch (_: java.nio.charset.CharacterCodingException) {
            throw IllegalArgumentException("Decoded bytes are not valid UTF-8 text.")
        }
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
            "secure-token" -> secureToken(secureTokenLength(opts))
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
                when(op){"url-parser" -> "Protocol: ${u.scheme ?: ""}\nUsername: ${u.userInfo?.substringBefore(":") ?: "—"}\nHost: ${u.rawAuthority ?: ""}\nHostname: $host\nPort: ${if(u.port==-1) "default" else u.port}\nPath: $path\nQuery: ${if(query.isBlank()) "—" else "?$query"}\nHash: ${if(u.rawFragment==null) "—" else "#${u.rawFragment}"}\nOrigin: ${(if(u.scheme!=null) "${u.scheme}://" else "")}${u.rawAuthority ?: ""}";"url-origin" -> "${u.scheme}://${u.rawAuthority}";"url-path-analyzer" -> "Path: $path\nSegments: ${path.split("/").filter{it.isNotEmpty()}.size}\nLast segment: ${path.split("/").filter{it.isNotEmpty()}.lastOrNull() ?: "—"}"; else -> if(query.isBlank()) "No query parameters." else query.split("&").filter{it.isNotBlank()}.joinToString("\n") { val p=it.split("=",limit=2); "${decodeURIComponent(p[0].replace("+", "%20"))} = ${if(p.size>1) decodeURIComponent(p[1].replace("+", "%20")) else ""}" }}
            }
            "url-query-builder" -> { val u=URI(opts["url"] ?: input.ifBlank { "https://example.com/search" }); val name=opts["name"] ?: "q"; val value=opts["value"] ?: ""; val existing=u.rawQuery?.let{ "$it&" } ?: ""; "${u.scheme}://${u.rawAuthority}${u.rawPath}?${existing}${encodeURIComponent(name)}=${encodeURIComponent(value)}${if(u.rawFragment!=null) "#${u.rawFragment}" else ""}" }
            "url-encode" -> encodeURIComponent(opts["text"] ?: input)
            "url-decode" -> decodeURIComponent(opts["text"] ?: input)
            "port-lookup","port-reference" -> { val name=opts["name"]?.trim()?.lowercase(); if(!name.isNullOrBlank()) commonPorts.entries.filter { it.value.lowercase().contains(name) }.joinToString("\n") { "${it.key}: ${it.value}" }.ifBlank { "No match in the common-port reference." } else { val p=(opts["port"] ?: input).toIntOrNull() ?: 443; commonPorts[p]?.let { "$p/TCP or UDP: $it" } ?: "$p: not in the built-in common-port reference." } }
            "http-status-reference" -> httpStatuses.joinToString("\n") { "${it.first}: ${it.second}" }
            "header-format","header-parser" -> lines(opts["headers"] ?: input.ifBlank { "Content-Type: application/json\nAuthorization: Bearer YOUR_TOKEN" }).map { line -> val i=line.indexOf(":"); if(i>0) "${line.substring(0,i).trim()}: ${line.substring(i+1).trim()}" else line }.let { rows -> if(op=="header-parser") rows.map { val i=it.indexOf(":"); if(i>0) "${it.substring(0,i)} → ${it.substring(i+1).trim()}" else it }.joinToString("\n") else rows.joinToString("\n") }
            "basic-auth-header" -> "Basic ${encodeBase64NoWrap("${opts["username"] ?: ""}:${opts["password"] ?: ""}".toByteArray(StandardCharsets.UTF_8))}"
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

    private fun decodeURIComponent(input: String): String = NativeCodecEngine.run("url-decoder", input).output

    private fun esc(s: String): String = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

    private fun developerUuidValidation(raw: String): String {
        val value = raw.trim()
        if (value.equals("00000000-0000-0000-0000-000000000000", true)) return "Valid Nil UUID (all-zero identifier)."
        if (value.equals("ffffffff-ffff-ffff-ffff-ffffffffffff", true)) return "Valid Max UUID (all-one identifier)."
        val match = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-([1-8])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE).matchEntire(value)
        return match?.groupValues?.get(1)?.let { "Valid UUID v$it" } ?: "Invalid UUID"
    }

    private fun runDeveloper(op: String, input: String, opts: Map<String, String>): String {
        val secondary = opts["secondary"] ?: opts["test"] ?: opts["second"] ?: ""
        val flags = opts["flags"] ?: "g"
        fun b64UrlDecode(value: String): String {
            return decodeBase64Text(value, urlSafe = true)
        }
        fun parseJson(raw: String): Any {
            StrictJsonValidator(raw).validate()
            val tokener = JSONTokener(raw)
            val value = tokener.nextValue()
            require(tokener.nextClean() == '\u0000') { "Unexpected content after JSON value." }
            return value
        }
        fun stringifyJson(raw: String, indent: Int): String = when (val value = parseJson(raw)) {
            is JSONObject -> if (indent > 0) value.toString(indent) else value.toString()
            is JSONArray -> if (indent > 0) value.toString(indent) else value.toString()
            JSONObject.NULL -> "null"
            is String -> JSONObject.quote(value)
            else -> value.toString()
        }
        fun pretty(raw: String, indent: Int = 2): String = stringifyJson(raw, indent)
        fun jsonMin(raw: String): String = stringifyJson(raw, 0)
        fun uuidValid(raw: String): String = developerUuidValidation(raw)
        fun uuid(): String = UUID.randomUUID().toString()
        fun decode(kind: String, raw: String): String = when(kind) {
            "base64" -> decodeBase64Text(raw)
            "base64url" -> decodeBase64Text(raw, urlSafe = true)
            "uri" -> decodeURIComponent(raw)
            "unicode" -> raw.replace(Regex("\\u([0-9a-fA-F]{4})")) { it.groupValues[1].toInt(16).toChar().toString() }
            "html" -> raw.replace("&lt;","<").replace("&gt;",">").replace("&quot;", "\"").replace("&#39;", "'").replace("&amp;", "&")
            else -> raw
        }
        fun encode(kind: String, raw: String): String = when(kind) {
            "base64" -> java.util.Base64.getEncoder().encodeToString(raw.toByteArray(StandardCharsets.UTF_8))
            "base64url" -> java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(raw.toByteArray(StandardCharsets.UTF_8))
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
            op.startsWith("regex-") -> {
                require(secondary.isNotEmpty()) { "Enter a regular expression in the second field." }
                val re = Regex(input, regexOptions(flags))
                val matches = re.findAll(secondary).toList()
                "Pattern: /$input/\nMatches: ${matches.size}\n\n${matches.mapIndexed { i, m -> "${i + 1}. ${m.value} at index ${m.range.first}" }.joinToString("\n").ifBlank { "No matches" }}"
            }
            op=="jwt-decoder" || op=="jwt-expiration-checker" -> {
                val parts=input.trim().split('.')
                require(parts.size==3){"A JWT compact token must contain three dot-separated parts."}
                val header=parseJson(b64UrlDecode(parts[0])) as? JSONObject ?: error("JWT header must be a JSON object.")
                val payloadText=b64UrlDecode(parts[1])
                val payload=parseJson(payloadText) as? JSONObject ?: error("JWT payload must be a JSON object.")
                val now=System.currentTimeMillis()/1000.0
                fun timeClaim(key:String): Any {
                    val seconds=(payload.opt(key) as? Number)?.toDouble() ?: return JSONObject.NULL
                    if (!seconds.isFinite()) return JSONObject().put("unixSeconds", JSONObject.NULL).put("iso", JSONObject.NULL).put("status", "out-of-range")
                    val iso: Any = if (kotlin.math.abs(seconds) < 253_402_300_800.0) runCatching {
                        java.time.format.DateTimeFormatter.ISO_INSTANT.format(java.time.Instant.ofEpochMilli((seconds*1000).toLong()))
                    }.getOrNull() ?: JSONObject.NULL else JSONObject.NULL
                    val status = if (iso === JSONObject.NULL) "out-of-range" else when(key) {
                        "exp" -> if(now >= seconds) "expired" else "valid"
                        "nbf" -> if(now < seconds) "not-yet-valid" else "active"
                        "iat" -> if(seconds > now) "issued-in-the-future" else "informational"
                        else -> "informational"
                    }
                    return JSONObject().put("unixSeconds", seconds).put("iso", iso).put("status", status)
                }
                val claims=JSONObject().put("exp",timeClaim("exp")).put("iat",timeClaim("iat")).put("nbf",timeClaim("nbf"))
                    .put("sub",payload.opt("sub") ?: JSONObject.NULL).put("iss",payload.opt("iss") ?: JSONObject.NULL).put("aud",payload.opt("aud") ?: JSONObject.NULL)
                val unsafe=scanUnsafeJsonIntegerTokens(payloadText)
                JSONObject().put("warning","DECODE ONLY — signature not verified. Decoding does not prove the token is authentic or trusted.")
                    .put("header",header).put("payload",payload).put("claims",claims).put("signaturePresent",parts[2].isNotEmpty()).put("signatureVerified",false)
                    .put("largeIntegerPrecisionWarning",if(unsafe.length()>0) "Payload includes integer tokens beyond JavaScript's exact integer range; viewers using binary floating point may lose precision." else JSONObject.NULL).put("largeIntegerTokens",unsafe).toString(2)
            }
            op=="uuid-generator" -> List(max(1, min(100, (opts["count"]?.toIntOrNull() ?: 10)))) { uuid() }.joinToString("\n")
            op=="uuid-validator" -> uuidValid(input)
            op=="json-beautifier" || op=="json-formatter" || op=="json-minifier" || op=="json-validator" -> { if(op=="json-validator"){parseJson(input);"Valid JSON (RFC 8259-compatible parser)."} else if(op=="json-minifier") jsonMin(input) else pretty(input) }
            op=="query-string-parser" -> input
            op=="url-parser" -> developerUrlInfo(input)
            op=="http-status-lookup" -> {
                val code=input.trim()
                httpStatuses.firstOrNull { it.first.toString()==code }?.let { "$code ${it.second}" }
                    ?: httpStatuses.joinToString("\n") { "${it.first} ${it.second}" }
            }
            op=="data-uri-generator" -> "data:text/plain;base64,${encode("base64",input)}"
            op=="markdown-preview" || op=="markdown-to-html" -> formatDeveloperMarkup(input)
            op=="user-agent-parser" -> input
            op=="cron-generator" || op=="cron-parser" -> "Cron: ${input.trim()}\nFive-field format: minute hour day-of-month month day-of-week"
            else -> input
        }
    }

    private data class DeveloperCronField(val values: Set<Int>, val wildcard: Boolean)

    private fun parseDeveloperCronField(raw: String, min: Int, max: Int, names: Map<String, Int> = emptyMap(), dayOfWeek: Boolean = false): DeveloperCronField {
        // Vixie-style cron treats a leading wildcard (including */step) as wildcard-driven for DOM/DOW semantics.
        // Other schedulers can differ; keep this behavior documented in the returned explanation.
        val selected = linkedSetOf<Int>(); val wildcard = raw.startsWith("*")
        for (segment in raw.lowercase(Locale.US).split(',')) {
            require(segment.isNotBlank()) { "Empty value in cron field." }
            val slash = segment.split('/')
            require(slash.size <= 2) { "Cron field contains more than one '/'." }
            val step = slash.getOrNull(1)?.toIntOrNull() ?: if (slash.size == 2) 0 else 1
            require(step > 0) { "Cron step must be a positive integer." }
            val part = slash[0]
            val range = when {
                part == "*" -> min..max
                part.contains('-') -> {
                    val ends = part.split('-'); require(ends.size == 2) { "Invalid cron range '$part'." }
                    val first = names[ends[0]] ?: ends[0].toIntOrNull() ?: -1
                    val last = names[ends[1]] ?: ends[1].toIntOrNull() ?: -1
                    require(first in min..max && last in min..max && first <= last) { "Cron range '$part' must be from $min through $max." }
                    first..last
                }
                else -> {
                    val n = names[part] ?: part.toIntOrNull() ?: -1
                    require(n in min..max) { "Cron value '$part' must be from $min through $max." }
                    if (slash.size == 2) n..max else n..n
                }
            }
            range.filterIndexed { index, _ -> index % step == 0 }.forEach { n -> selected += if (dayOfWeek && n == 7) 0 else n }
        }
        require(selected.isNotEmpty()) { "Cron field did not select any values." }
        return DeveloperCronField(selected, wildcard)
    }

    private fun developerCron(expression: String): String {
        val parts = expression.trim().split(Regex("\\s+")).filter(String::isNotEmpty)
        require(parts.size == 5) { "Expected exactly five cron fields (minute hour day-of-month month day-of-week); received ${parts.size}." }
        val monthNames = mapOf("jan" to 1,"feb" to 2,"mar" to 3,"apr" to 4,"may" to 5,"jun" to 6,"jul" to 7,"aug" to 8,"sep" to 9,"oct" to 10,"nov" to 11,"dec" to 12)
        val dayNames = mapOf("sun" to 0,"mon" to 1,"tue" to 2,"wed" to 3,"thu" to 4,"fri" to 5,"sat" to 6)
        val minute = parseDeveloperCronField(parts[0],0,59)
        val hour = parseDeveloperCronField(parts[1],0,23)
        val day = parseDeveloperCronField(parts[2],1,31)
        val month = parseDeveloperCronField(parts[3],1,12,monthNames)
        val weekday = parseDeveloperCronField(parts[4],0,7,dayNames,true)
        val zone = ZoneId.systemDefault()
        var cursor = ZonedDateTime.now(zone).withSecond(0).withNano(0).plusMinutes(1)
        val until = cursor.plusDays(366); val runs = JSONArray()
        fun matches(c: ZonedDateTime): Boolean {
            if (c.minute !in minute.values || c.hour !in hour.values || c.monthValue !in month.values) return false
            val dom = c.dayOfMonth in day.values; val dow = c.dayOfWeek.value % 7 in weekday.values
            val dateMatch = when { day.wildcard -> dow; weekday.wildcard -> dom; else -> dom || dow }
            return dateMatch
        }
        while (cursor <= until && runs.length() < 10) {
            if (matches(cursor)) {
                val local = cursor.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm z", Locale.US))
                val utc = cursor.withZoneSameInstant(ZoneOffset.UTC).format(DateTimeFormatter.ISO_INSTANT)
                runs.put(JSONObject().put("local",local).put("utc",utc))
            }
            cursor = cursor.plusMinutes(1)
        }
        require(runs.length() > 0) { "No runs found in the next 366 days for this expression." }
        return JSONObject().put("normalized",parts.joinToString(" "))
            .put("timezone",zone.id)
            .put("explanation","Five-field cron: minute hour day-of-month month day-of-week. Values use the device time zone. Vixie-style semantics: if both day fields are restricted (neither starts with *), either matching field triggers; a leading * including */step marks that field wildcard-driven. Confirm this edge case with your target scheduler.")
            .put("nextRuns",runs).toString(2)
    }

    /**
     * Inspect parsed JSON without eagerly constructing a UI tree. The explicit node/byte caps matter:
     * issue reports on JSON editors describe large documents freezing while thousands of collapsed
     * nodes are built. This traversal counts the structure but never mutates or uploads the document.
     */
    private fun developerJsonInspector(raw: String, maxNodes: Int = 100_000): String {
        val byteCount = raw.toByteArray(StandardCharsets.UTF_8).size
        require(byteCount <= 50 * 1024 * 1024) {
            "JSON input exceeds the 50 MiB inspection safety limit; inspect smaller sections."
        }
        // Validate syntax without materializing an object: Android JSONTokener rejects duplicate
        // object keys, but inspection must report them rather than fail on otherwise-valid JSON.
        StrictJsonValidator(raw).validate()
        var index = 0
        var nodes = 0; var maxDepth = 0; var objects = 0; var arrays = 0
        var properties = 0; var arrayItems = 0; var strings = 0
        var truncated = false; var stopped = false
        val duplicates = mutableListOf<String>()
        fun whitespace() { while (index < raw.length && raw[index] in charArrayOf(' ', '\t', '\r', '\n')) index++ }
        fun readString(): String {
            val start = index++
            while (index < raw.length) {
                val ch = raw[index++]
                if (ch == '\\' && index < raw.length) index++
                else if (ch == '"') break
            }
            return org.json.JSONTokener(raw.substring(start, index)).nextValue() as String
        }
        fun value(path: String, depth: Int) {
            whitespace()
            if (stopped) return
            if (nodes >= maxNodes || depth > 100) { truncated = true; stopped = true; return }
            nodes++; maxDepth = maxOf(maxDepth, depth)
            when (raw[index]) {
                '"' -> { strings++; readString() }
                '{' -> {
                    objects++; index++; whitespace()
                    val keys = mutableSetOf<String>()
                    if (index < raw.length && raw[index] == '}') index++ else while (!stopped) {
                        whitespace(); val key = readString(); properties++
                        val child = "$path[${JSONObject.quote(key)}]"
                        if (!keys.add(key)) duplicates += child
                        whitespace(); index++ // colon; syntax was already checked above
                        value(child, depth + 1); whitespace()
                        if (stopped) break
                        if (raw[index] == '}') { index++; break }
                        index++ // comma
                    }
                }
                '[' -> {
                    arrays++; index++; whitespace(); var item = 0
                    if (index < raw.length && raw[index] == ']') index++ else while (!stopped) {
                        arrayItems++; value("$path[$item]", depth + 1); item++; whitespace()
                        if (stopped) break
                        if (raw[index] == ']') { index++; break }
                        index++ // comma
                    }
                }
                else -> while (index < raw.length && raw[index] !in charArrayOf(',', ']', '}', ' ', '\t', '\r', '\n')) index++
            }
        }
        value("$", 0)
        val rootIndex = raw.indexOfFirst { !it.isWhitespace() }
        val rootType = when (raw[rootIndex]) { '{' -> "object"; '[' -> "array"; '"' -> "string"; 't','f' -> "boolean"; 'n' -> "null"; else -> "number" }
        val unsafe = scanUnsafeJsonIntegerTokens(raw)
        val warnings = JSONArray()
        if (unsafe.length() > 0) warnings.put("Raw integer tokens exceed JavaScript's exact integer range; keep exact identifiers as strings when interoperating with JavaScript.")
        if (duplicates.isNotEmpty()) warnings.put("Duplicate object keys are ambiguous; parsers commonly keep only the last occurrence.")
        if (truncated) warnings.put("Structural inspection or duplicate-key scan stopped at its safety limit.")
        warnings.put("This is structural inspection, not JSON Schema validation.")
        return JSONObject().put("rootType", rootType).put("characters", raw.length).put("utf8Bytes", byteCount)
            .put("nodeCount", nodes).put("maximumDepth", maxDepth).put("objectCount", objects).put("arrayCount", arrays)
            .put("propertyCount", properties).put("arrayItems", arrayItems).put("stringCount", strings).put("unsafeIntegerTokens", unsafe)
            .put("duplicateKeys", JSONArray(duplicates.distinct().take(100))).put("duplicateScanTruncated", truncated)
            .put("truncated", truncated).put("warnings", warnings).put("privacy", "Inspection is local; no network request is made.").toString(2)
    }

    /** Parse JSON container structure only to detect duplicate decoded key strings without scanning quoted text as syntax. */
    private fun scanDuplicateJsonKeyPaths(raw: String, maxNodes: Int = 100_000): Pair<List<String>, Boolean> {
        var i=0; var visited=0; var truncated=false; val duplicates=mutableListOf<String>()
        fun ws() { while(i<raw.length && raw[i] in charArrayOf(' ', '\t', '\r', '\n')) i++ }
        fun string(): String {
            val start=i; require(i<raw.length && raw[i]=='"') { "Invalid JSON key scan." }; i++
            while(i<raw.length) { val c=raw[i++]; if(c=='\\') { if(i<raw.length) i++ } else if(c=='"') break }
            return org.json.JSONTokener(raw.substring(start,i)).nextValue() as? String ?: raw.substring(start,i)
        }
        lateinit var value: (String,Int)->Unit
        value = { path, depth ->
            ws()
            if(i>=raw.length || visited>=maxNodes || depth>100) { truncated=true }
            else {
                visited++
                when(raw[i]) {
                    '"' -> { string(); Unit }
                    '{' -> {
                        i++; ws(); if(i<raw.length && raw[i]=='}') i++ else {
                            val keys=mutableSetOf<String>(); var memberCount=0
                            while(i<raw.length && visited<maxNodes) {
                                ws(); if(i>=raw.length || raw[i]!='"') break
                                val key=string(); val child="$path[${JSONObject.quote(key)}]"
                                if(!keys.add(key)) duplicates += child
                                ws(); if(i<raw.length && raw[i]==':') i++ else break
                                value(child,depth+1); memberCount++; ws()
                                if(i<raw.length && raw[i]=='}') { i++; break }
                                if(i<raw.length && raw[i]==',') i++ else break
                            }
                            if(visited>=maxNodes && i<raw.length) truncated=true
                        }
                    }
                    '[' -> {
                        i++; ws(); if(i<raw.length && raw[i]==']') i++ else {
                            var item=0
                            while(i<raw.length && visited<maxNodes) {
                                value("$path[$item]",depth+1); item++; ws()
                                if(i<raw.length && raw[i]==']') { i++; break }
                                if(i<raw.length && raw[i]==',') i++ else break
                            }
                            if(visited>=maxNodes && i<raw.length) truncated=true
                        }
                    }
                    else -> { while(i<raw.length && raw[i] !in charArrayOf(',',']','}',' ','\t','\r','\n')) i++ }
                }
            }
        }
        value("$",0)
        return duplicates to truncated
    }

    /** Scan JSON number tokens outside quoted strings, so an ID embedded in text is not a false positive. */
    private fun scanUnsafeJsonIntegerTokens(raw: String, limit: Int = 50): JSONArray {
        val result=JSONArray(); var i=0; var line=1; var column=1
        fun advance() { if(raw[i]=='\n') { line++; column=1 } else column++; i++ }
        val safe=java.math.BigInteger("9007199254740991")
        while(i<raw.length && result.length()<limit) {
            if(raw[i]=='"') { advance(); while(i<raw.length) { val ch=raw[i]; if(ch=='\\') { advance(); if(i<raw.length) advance(); continue }; advance(); if(ch=='"') break }; continue }
            if(raw[i]=='-' || raw[i].isDigit()) {
                val start=i; val startLine=line; val startColumn=column
                if(raw[i]=='-') advance()
                while(i<raw.length && raw[i].isDigit()) advance()
                var integerOnly=true
                if(i<raw.length && raw[i]=='.') { integerOnly=false; advance(); while(i<raw.length && raw[i].isDigit()) advance() }
                if(i<raw.length && (raw[i]=='e'||raw[i]=='E')) { integerOnly=false; advance(); if(i<raw.length && (raw[i]=='+'||raw[i]=='-')) advance(); while(i<raw.length && raw[i].isDigit()) advance() }
                val token=raw.substring(start,i)
                if(integerOnly && runCatching { java.math.BigInteger(token).abs() > safe }.getOrDefault(false)) result.put(JSONObject().put("token",token).put("line",startLine).put("column",startColumn))
                continue
            }
            advance()
        }
        return result
    }

    private fun developerHashBytes(op: String, bytes: ByteArray): String {
        val lower = op.lowercase(Locale.US)
        val algorithms = when {
            lower.contains("md5") -> listOf("MD5")
            lower.contains("sha256") || lower.contains("sha-256") -> listOf("SHA-256")
            lower.contains("sha1") || lower.contains("sha-1") -> listOf("SHA-1")
            lower.contains("sha384") || lower.contains("sha-384") -> listOf("SHA-384")
            lower.contains("sha512") || lower.contains("sha-512") -> listOf("SHA-512")
            else -> listOf("MD5","SHA-1","SHA-256","SHA-384","SHA-512")
        }
        val encoding = if (lower.contains("base64")) "base64" else "hex"
        val values = JSONArray()
        algorithms.forEach { algorithm ->
            val digest = MessageDigest.getInstance(algorithm).digest(bytes)
            val value = if (encoding == "base64") encodeBase64NoWrap(digest) else digest.joinToString("") { "%02x".format(Locale.US,it.toInt() and 0xff) }
            values.put(JSONObject().put("algorithm",algorithm).put("encoding",encoding).put("digest",value))
        }
        return JSONObject().put("localOnly",true).put("note","MD5 and SHA-1 are legacy checksums, not password-hashing algorithms.").put("hashes",values).toString(2)
    }

    /** Used by native local file pickers; streams raw file bytes and never uploads them or buffers the full file. */
    fun hashDeveloperFileStream(op: String, stream: InputStream): String {
        val lower = op.lowercase(Locale.US)
        val algorithms = when {
            lower.contains("md5") -> listOf("MD5")
            lower.contains("sha256") || lower.contains("sha-256") -> listOf("SHA-256")
            lower.contains("sha1") || lower.contains("sha-1") -> listOf("SHA-1")
            lower.contains("sha384") || lower.contains("sha-384") -> listOf("SHA-384")
            lower.contains("sha512") || lower.contains("sha-512") -> listOf("SHA-512")
            else -> listOf("MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512")
        }
        val digests = algorithms.associateWith { MessageDigest.getInstance(it) }
        val buffer = ByteArray(64 * 1024); var total = 0L
        while (true) {
            val count = stream.read(buffer)
            if (count < 0) break
            if (count == 0) continue
            total += count
            require(total <= 2L * 1024 * 1024 * 1024) { "File exceeds the 2 GiB local hashing safety limit." }
            digests.values.forEach { it.update(buffer, 0, count) }
        }
        val encoding = if (lower.contains("base64")) "base64" else "hex"
        val rows = JSONArray()
        digests.forEach { (algorithm, digest) ->
            val bytes = digest.digest()
            val value = if (encoding == "base64") encodeBase64NoWrap(bytes) else bytes.joinToString("") { "%02x".format(Locale.US, it.toInt() and 0xff) }
            rows.put(JSONObject().put("algorithm", algorithm).put("encoding", encoding).put("digest", value))
        }
        return JSONObject().put("localOnly", true).put("bytesRead", total).put("note", "MD5 and SHA-1 are legacy checksums, not password-hashing algorithms.").put("hashes", rows).toString(2)
    }

    /** Compatibility helper for tests and in-memory bytes. */
    fun hashDeveloperFileBytes(op: String, bytes: ByteArray): String = developerHashBytes(op, bytes)

    private fun developerTimestamp(input: String): String {
        val raw = input.trim()
        val date = if (raw.isEmpty()) Instant.now() else {
            val numeric = raw.toDoubleOrNull()
            if (numeric != null && numeric.isFinite()) Instant.ofEpochMilli((if (kotlin.math.abs(numeric) < 100_000_000_000.0) numeric * 1000 else numeric).toLong())
            else runCatching { Instant.parse(raw) }.getOrElse { runCatching { java.time.OffsetDateTime.parse(raw).toInstant() }.getOrElse { throw IllegalArgumentException("Enter Unix seconds/milliseconds or an ISO-8601 date.") } }
        }
        val local = date.atZone(ZoneId.systemDefault())
        return JSONObject().put("epochSeconds",date.epochSecond).put("epochMilliseconds",date.toEpochMilli()).put("iso",DateTimeFormatter.ISO_INSTANT.format(date)).put("utc",date.toString()).put("local",local.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss z",Locale.US))).put("timezone",ZoneId.systemDefault().id).toString(2)
    }

    private fun developerJsonPath(raw: String, path: String): String {
        StrictJsonValidator(raw).validate()
        val tokener = JSONTokener(raw)
        val root: Any = tokener.nextValue()
        var normalized = path.trim()
        if (normalized.isEmpty() || normalized == "$" || normalized == ".") return when (root) {
            is JSONObject -> root.toString(2)
            is JSONArray -> root.toString(2)
            else -> root.toString()
        }
        require(normalized.startsWith("$") || normalized.startsWith(".")) { "JSON path must start with '$' or '.'." }
        if (normalized.startsWith("$")) normalized = normalized.drop(1)
        if (normalized.startsWith(".")) normalized = normalized.drop(1)
        val tokenRegex = Regex("\\.?([A-Za-z0-9_$-]+)|\\[(\\d+|\\*|'[^']+'|\"[^\"]+\")\\]")
        val matches = tokenRegex.findAll(normalized).toList()
        require(matches.isNotEmpty() && matches.joinToString("") { it.value }.replace(".", "") == normalized.replace(".", "")) {
            "Unsupported JSON path. Use $.user.name, $.items[0].id, or $['display-name']."
        }
        val tokens = matches.map { match ->
            val key = match.groups[1]?.value
            val bracket = match.groups[2]?.value
            when {
                key != null -> key
                bracket == "*" -> "*"
                bracket?.toIntOrNull() != null -> bracket.toInt()
                else -> bracket?.removeSurrounding("'")?.removeSurrounding("\"") ?: ""
            }
        }
        var values: List<Any> = listOf(root)
        tokens.forEach { token -> values = values.flatMap { value ->
            when {
                token == "*" && value is JSONArray -> (0 until value.length()).map { value.get(it) }
                token == "*" && value is JSONObject -> value.keys().asSequence().sorted().mapNotNull { value.opt(it) }.toList()
                token is Int && value is JSONArray && token >= 0 && token < value.length() -> listOf(value.get(token))
                token is String && value is JSONObject && value.has(token) -> listOf(value.get(token))
                else -> emptyList()
            }
        } }
        require(values.isNotEmpty()) { "JSON path '$path' did not match any value." }
        val result: Any = if (values.size == 1) values[0] else JSONArray(values)
        return when (result) { is JSONObject -> result.toString(2); is JSONArray -> result.toString(2); else -> result.toString() }
    }

    private fun developerTemplate(op: String, input: String, secondary: String): String? {
        val lower = op.lowercase(Locale.US); val subject = input.trim().ifBlank { secondary.trim() }
        return when {
            lower.contains("gitignore") && lower.contains("generator") -> {
                val stack = subject.ifBlank { "node" }.lowercase(Locale.US)
                val specific = when (stack) {
                    "python" -> "__pycache__/\n*.py[cod]\n.venv/\nvenv/\n.pytest_cache/\n.mypy_cache/\n"
                    "android","kotlin","java" -> ".gradle/\nbuild/\nlocal.properties\n*.class\n"
                    "swift" -> ".build/\nDerivedData/\nxcuserdata/\n*.xcuserstate\n"
                    "go","golang" -> "/bin/\n/vendor/\n*.test\n"
                    "rust" -> "target/\n"
                    else -> "node_modules/\ndist/\nbuild/\ncoverage/\n*.tsbuildinfo\n"
                }
                "# OS/editor\n.DS_Store\nThumbs.db\n.vscode/\n.idea/\n\n# Secrets\n.env\n.env.*\n!.env.example\n*.pem\n*.key\n\n# Logs\n*.log\nlogs/\n\n# Stack: $stack\n$specific"
            }
            (lower.contains("docker-compose") && (lower.contains("generator") || lower.contains("builder"))) -> "services:\n  app:\n    build:\n      context: .\n      dockerfile: Dockerfile\n    restart: unless-stopped\n    ports:\n      - \"3000:3000\"\n    environment:\n      NODE_ENV: production\n    # Inject secrets through your deployment environment; do not commit them.\n"
            (lower.contains("dockerfile") && (lower.contains("generator") || lower.contains("helper"))) || (lower.contains("docker") && lower.contains("generator")) -> if (subject.equals("python",true)) "FROM python:3.12-slim\nENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1\nWORKDIR /app\nCOPY requirements.txt ./\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE 8000\nCMD [\"uvicorn\",\"main:app\",\"--host\",\"0.0.0.0\",\"--port\",\"8000\"]\n" else "FROM node:22-alpine AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\nFROM node:22-alpine AS runtime\nENV NODE_ENV=production\nWORKDIR /app\nCOPY --from=build /app/package*.json ./\nRUN npm ci --omit=dev\nCOPY --from=build /app/dist ./dist\nUSER node\nEXPOSE 3000\n# Adjust CMD to your real application entry point.\nCMD [\"node\",\"dist/server.js\"]\n"
            lower.contains("editorconfig") && lower.contains("generator") -> "root = true\n\n[*]\ncharset = utf-8\nend_of_line = lf\ninsert_final_newline = true\ntrim_trailing_whitespace = true\n\n[*.{js,jsx,ts,tsx,json,css,html,yml,yaml,md}]\nindent_style = space\nindent_size = 2\n\n[*.{kt,kts,java,swift,py,go,rs}]\nindent_style = space\nindent_size = 4\n\n[Makefile]\nindent_style = tab\n"
            (lower.contains("environment-variable") || lower.contains("env-var")) && lower.contains("generator") -> "# Example only; never put actual credentials here.\n" + (subject.lines().filter { it.isNotBlank() }.map { it.trim().replace(Regex("[^A-Za-z0-9_]"),"_").uppercase(Locale.US) }.filter { it.matches(Regex("[A-Z_][A-Z0-9_]*")) }.distinct().ifEmpty { listOf("APP_ENV","API_BASE_URL","LOG_LEVEL") }.joinToString("\n") { "$it=" }) + "\n"
            lower.contains("openapi") && lower.contains("generator") -> "openapi: 3.1.0\ninfo:\n  title: ${subject.ifBlank { "Example API" }}\n  version: 1.0.0\n  description: Example contract; review paths and schemas before publishing.\nservers:\n  - url: https://api.example.com\npaths:\n  /health:\n    get:\n      operationId: getHealth\n      responses:\n        '200':\n          description: Service is healthy\n          content:\n            application/json:\n              schema:\n                type: object\n                properties:\n                  status:\n                    type: string\n                    const: ok\n"
            lower.contains("readme") && lower.contains("generator") -> "# ${subject.ifBlank { "Project Name" }}\n\nDescribe what this project does and who it is for.\n\n## Features\n- Main capability\n- Key constraints and privacy model\n\n## Requirements\n- Supported runtime and tool versions\n\n## Getting started\n\n```sh\n# Replace with the project's documented install command\nnpm ci\nnpm run dev\n```\n\n## Configuration\nCopy .env.example to your local environment and provide the required values. Never commit secrets.\n\n## Tests\n```sh\nnpm test\n```\n\n## License\nDocument the license applied to this repository.\n"
            lower.contains("license") && lower.contains("generator") -> "MIT License\n\nCopyright (c) ${java.time.Year.now().value} ${subject.ifBlank { "[Copyright holder]" }}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY.\n\nReview the license and replace the placeholder before use.\n"
            lower.contains("nginx") && lower.contains("generator") -> "server {\n    listen 80;\n    server_name example.com; # replace before deployment\n    root /usr/share/nginx/html;\n    index index.html;\n    location / { try_files \$uri \$uri/ /index.html; }\n    location = /health { access_log off; add_header Content-Type text/plain; return 200 \"ok\\n\"; }\n}\n"
            lower.contains("cors") && (lower.contains("generator") || lower.contains("builder") || lower.contains("helper")) -> "Access-Control-Allow-Origin: https://app.example.com\nVary: Origin\nAccess-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS\nAccess-Control-Allow-Headers: Content-Type, Authorization\nAccess-Control-Max-Age: 600\n\nUse an explicit origin allow-list. Avoid '*' for credentialed requests.\n"
            lower.contains("csp") && (lower.contains("generator") || lower.contains("builder") || lower.contains("helper")) -> "Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests\n\nTailor this policy to the application's required scripts, styles, fonts, images, APIs and embedding.\n"
            lower.contains("graphql-query-builder") -> "query GetExample(${ '$' }id: ID!) {\n  node(id: ${ '$' }id) {\n    id\n    __typename\n  }\n}\n\n# Replace node and fields with operations supported by your schema.\n"
            lower.contains("graphql-variables") -> runCatching { JSONObject(subject.ifBlank { "{\\\"id\\\":\\\"REPLACE_WITH_ID\\\"}" }).toString(2) }.getOrElse { throw IllegalArgumentException("GraphQL variables must be valid JSON.") }
            lower.contains("jwt-claim-builder") || lower.contains("jwt-payload-generator") -> runCatching { JSONObject(subject.ifBlank { "{\\\"sub\\\":\\\"user-id\\\",\\\"iat\\\":${System.currentTimeMillis()/1000},\\\"exp\\\":${System.currentTimeMillis()/1000+3600}}" }).toString(2) }.getOrElse { throw IllegalArgumentException("JWT claims/payload must be valid JSON.") } + "\n\nPayload preview only: no signature was created or verified. Do not use as an authentication token."
            lower.contains("branch-name") -> subject.lowercase(Locale.US).replace(Regex("[^a-z0-9]+"),"-").trim('-')
            lower.contains("commit-message") -> "chore: ${subject.ifBlank { "describe the change" }.replace(Regex("[\\r\\n]+")," ").trim()}\n\nReview the Conventional Commit type (feat, fix, docs, refactor, test, chore, etc.) before committing."
            lower.contains("changelog") -> "# Changelog\n\n## Unreleased\n\n" + (subject.lines().filter { it.isNotBlank() }.joinToString("\n") { "- ${it.trim()}" }.ifBlank { "### Changed\n- Describe the user-visible change.\n\n### Fixed\n- Describe the bug fixed." }) + "\n"
            lower.contains("semantic-version") && (lower.contains("calculator") || lower.contains("generator") || lower.contains("helper")) -> { val parts=subject.split(Regex("[ ,]+")); val m=Regex("^(\\d+)\\.(\\d+)\\.(\\d+)$").matchEntire(parts.firstOrNull() ?: "0.1.0") ?: throw IllegalArgumentException("Enter a version like 1.2.3 followed by major, minor, or patch."); var major=m.groupValues[1].toInt(); var minor=m.groupValues[2].toInt(); var patch=m.groupValues[3].toInt(); when(parts.getOrNull(1) ?: "patch") { "major" -> {major++;minor=0;patch=0}; "minor" -> {minor++;patch=0}; "patch" -> patch++; else -> throw IllegalArgumentException("Increment must be major, minor, or patch.") }; "$major.$minor.$patch" }
            lower.contains("api-mock-response") -> runCatching { JSONObject().put("data",if(subject.isBlank()) JSONObject().put("id","example-1").put("message","Mock response") else JSONObject(subject)).put("meta",JSONObject().put("mock",true).put("generatedLocally",true)).put("error",JSONObject.NULL).toString(2) }.getOrElse { throw IllegalArgumentException("Provide a valid JSON object for the mock response data.") }
            lower.contains("webhook-payload") -> {
                val suppliedData = runCatching { JSONObject(subject) }.getOrNull()
                val eventType = if (suppliedData == null) subject.trim().ifBlank { "resource.updated" } else "resource.updated"
                JSONObject().put("id", "evt_example").put("type", eventType)
                    .put("createdAt", "2026-01-01T00:00:00Z")
                    .put("data", suppliedData ?: JSONObject().put("id", "record_123").put("status", "created"))
                    .put("meta", JSONObject().put("generatedLocally", true).put("signature", JSONObject.NULL)).toString(2) + "\n"
            }
            lower.contains("sql-schema-generator") -> "CREATE TABLE example_records (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\n"
            lower.contains("sql-query-builder") && lower.contains("generator") -> "SELECT id, name, created_at\nFROM example_records\nWHERE id = :id\nORDER BY created_at DESC;\n\n-- Replace the table, columns and parameter names for your schema.\n"
            lower.contains("regex-generator") -> "Common Java/Kotlin-compatible starter patterns (review for your exact requirements):\nEmail-like text: [^\\s@]+@[^\\s@]+\\.[^\\s@]+\nDigits: \\d+\nWhitespace: \\s+\nStart: ^\nEnd: $\n"
            else -> null
        }
    }

    private fun runDeveloperParity(op: String, input: String, opts: Map<String, String>): String {
        val lower = op.lowercase(Locale.US)
        val secondary = opts["secondary"] ?: opts["test"] ?: opts["second"] ?: ""
        val flags = opts["flags"] ?: "g"
        fun b64UrlDecode(value: String): String {
            return decodeBase64Text(value, urlSafe = true)
        }
        val base = lower.removePrefix("developer-").substringBefore('-')
        val suffix = Regex("(?:^|-)(formatter|validator|beautifier|minifier|parser|converter|generator|diff|inspector|preview|tester|decoder|encoder|explainer|helper|builder|calculator|lookup|checker|compare)$").find(lower)?.groupValues?.get(1) ?: ""

        fun parseJson(raw: String): Any {
            StrictJsonValidator(raw).validate()
            val tokener = JSONTokener(raw)
            val value = tokener.nextValue()
            require(tokener.nextClean() == '\u0000') { "Unexpected content after JSON value." }
            return value
        }
        fun stringifyJson(value: Any, indent: Int = 2): String = when (value) {
            is JSONObject -> if (indent > 0) value.toString(indent) else value.toString()
            is JSONArray -> if (indent > 0) value.toString(indent) else value.toString()
            JSONObject.NULL -> "null"
            is String -> JSONObject.quote(value)
            else -> value.toString()
        }
        fun pretty(raw: String, indent: Int = 2): String = stringifyJson(parseJson(raw), indent)
        fun sortValue(value: Any): Any = when (value) {
            is JSONObject -> JSONObject().apply { value.keys().asSequence().toList().sorted().forEach { put(it, sortValue(value.get(it))) } }
            is JSONArray -> JSONArray().apply { for (i in 0 until value.length()) put(sortValue(value.get(i))) }
            else -> value
        }
        fun jsonDiff(leftRaw: String, rightRaw: String): String {
            // Structural JSON diff ignores object key ordering and whitespace. Paths use JSONPath-like
            // bracket notation so punctuation in property names does not create ambiguous reports.
            val left = parseJson(leftRaw); val right = parseJson(rightRaw); val missing = Any()
            fun canonical(value: Any): String = when (value) {
                is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(prefix="{",postfix="}",separator=",") { key -> JSONObject.quote(key)+":"+canonical(value.get(key)) }
                is JSONArray -> (0 until value.length()).joinToString(prefix="[",postfix="]",separator=",") { canonical(value.get(it)) }
                is String -> JSONObject.quote(value)
                JSONObject.NULL -> "null"
                else -> value.toString()
            }
            val changes = JSONArray(); var truncated = false
            fun add(type:String, path:String, before:Any?, after:Any?) {
                if (changes.length() >= 500) { truncated = true; return }
                val row = JSONObject().put("type", type).put("path", path)
                if (before !== missing) row.put("before", before ?: JSONObject.NULL)
                if (after !== missing) row.put("after", after ?: JSONObject.NULL)
                changes.put(row)
            }
            fun walk(a:Any?, b:Any?, path:String, depth:Int) {
                if (changes.length() >= 500) { truncated = true; return }
                if (depth > 100) { add("depth-limit", path, a, b); return }
                if (a === missing) { add("added", path, a, b); return }
                if (b === missing) { add("removed", path, a, b); return }
                if (a is JSONObject && b is JSONObject) {
                    val keys = (a.keys().asSequence().toSet() + b.keys().asSequence().toSet()).sorted()
                    for (key in keys) walk(if (a.has(key)) a.get(key) else missing, if (b.has(key)) b.get(key) else missing, "$path[${JSONObject.quote(key)}]", depth + 1)
                } else if (a is JSONArray && b is JSONArray) {
                    for (i in 0 until max(a.length(), b.length())) walk(if (i < a.length()) a.get(i) else missing, if (i < b.length()) b.get(i) else missing, "$path[$i]", depth + 1)
                } else if (canonical(a!!) != canonical(b!!)) add("changed", path, a, b)
            }
            walk(left, right, "$", 0)
            return JSONObject().put("equal", changes.length()==0 && !truncated).put("changeCount", changes.length()).put("changes", changes).put("truncated", truncated)
                .put("note", "Whitespace and object key order are ignored. Arrays are compared by index; this is not a move-aware diff.").toString(2)
        }
        fun minifyText(raw: String): String = raw.replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("<!--[\\s\\S]*?-->"), "").replace(Regex("\\s+"), " ").trim()
        fun formatSql(raw: String): String {
            val normalized = raw.trim().replace(Regex("\\s+"), " ")
            if (normalized.isEmpty()) return ""
            var formatted = normalized.replace(Regex("(?i)\\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|VALUES|SET|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|ON|UNION|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE)\\b"), "\n$1")
                .replace(Regex("\\s*,\\s*"), ", ").trim()
            formatted = formatted.replace(Regex("(?m)^\\s*"), "")
            return formatted.removePrefix("\n").trim()
        }
        fun formatCss(raw: String): String {
            var text = raw.replace(Regex("/\\*[\\s\\S]*?\\*/"), "").trim()
            text = text.replace(Regex("\\s*\\{\\s*"), " {\n  ")
                .replace(Regex("\\s*;\\s*"), ";\n  ")
                .replace(Regex("\\s*\\}\\s*"), "\n}\n\n")
            return text.lines().joinToString("\n") { it.trimEnd() }.trim() + if (text.isBlank()) "" else "\n"
        }
        fun markdownToHtml(raw: String): String {
            fun escape(text: String) = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")
            return raw.replace("\r\n", "\n").split(Regex("\n{2,}")).filter { it.isNotBlank() }.joinToString("\n") { block ->
                val line = block.trim()
                val heading = Regex("^(#{1,6})\\s+(.+)$").matchEntire(line)
                if (heading != null) { val level = heading.groupValues[1].length; "<h$level>${escape(heading.groupValues[2])}</h$level>" }
                else if (line.startsWith("- ")) "<ul>" + line.lines().joinToString("") { "<li>${escape(it.removePrefix("- "))}</li>" } + "</ul>"
                else "<p>${escape(line).replace(Regex("\\*\\*(.+?)\\*\\*"), "<strong>$1</strong>").replace(Regex("\\*(.+?)\\*"), "<em>$1</em>")}</p>"
            }
        }
        fun validateMarkup(raw: String): Boolean = runCatching {
            val factory = DocumentBuilderFactory.newInstance().apply {
                setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
                setFeature("http://xml.org/sax/features/external-general-entities", false)
                setFeature("http://xml.org/sax/features/external-parameter-entities", false)
                isExpandEntityReferences = false
            }
            factory.newDocumentBuilder().parse(InputSource(StringReader(raw)))
        }.isSuccess
        fun csvString(rows: List<List<String>>): String = rows.joinToString("\n") { row -> row.joinToString(",") { value -> if (Regex("[,\"\\n\\r]").containsMatchIn(value)) "\"${value.replace("\"", "\"\"")}\"" else value } }
        fun jsonToCsv(raw: String): String {
            val array = JSONArray(raw)
            if (array.length() == 0) return ""
            val keys = linkedSetOf<String>()
            for (i in 0 until array.length()) array.optJSONObject(i)?.keys()?.forEach { keys += it }
            if (keys.isEmpty()) return ""
            fun cell(value: Any?): String {
                val text = if (value == null || value === JSONObject.NULL) "" else value.toString()
                return if (Regex("[,\"\\n\\r]").containsMatchIn(text)) "\"${text.replace("\"", "\"\"")}\"" else text
            }
            return (listOf(keys.toList()) + (0 until array.length()).map { i -> keys.map { key -> cell(array.optJSONObject(i)?.opt(key)) } }).let(::csvString)
        }
        fun csvRows(raw: String): List<List<String>> {
            val rows = mutableListOf<MutableList<String>>()
            var row = mutableListOf<String>(); val cell = StringBuilder(); var quoted = false; var i = 0
            while (i < raw.length) {
                val ch = raw[i]
                if (ch == '"') {
                    if (quoted && i + 1 < raw.length && raw[i + 1] == '"') { cell.append('"'); i++ } else quoted = !quoted
                } else if (ch == ',' && !quoted) { row.add(cell.toString()); cell.setLength(0) }
                else if ((ch == '\n' || ch == '\r') && !quoted) {
                    if (ch == '\r' && i + 1 < raw.length && raw[i + 1] == '\n') i++
                    row.add(cell.toString()); cell.setLength(0)
                    if (row.any { it.isNotEmpty() }) rows.add(row)
                    row = mutableListOf()
                } else cell.append(ch)
                i++
            }
            row.add(cell.toString()); if (row.any { it.isNotEmpty() }) rows.add(row)
            return rows
        }
        fun csvToJson(raw: String): String {
            val rows = csvRows(raw); if (rows.isEmpty()) return "[]"
            val headers = rows.first(); val result = JSONArray()
            rows.drop(1).forEach { values ->
                val item = JSONObject()
                headers.forEachIndexed { index, key -> item.put(if (key.isEmpty()) "column_${index + 1}" else key, values.getOrElse(index) { "" }) }
                result.put(item)
            }
            return result.toString(2)
        }
        fun decode(kind: String, raw: String): String = when (kind) {
            "base64" -> decodeBase64Text(raw)
            "uri" -> decodeURIComponent(raw)
            "unicode" -> raw.replace(Regex("\\\\u([0-9a-fA-F]{4})")) { it.groupValues[1].toInt(16).toChar().toString() }
            "html" -> raw.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").replace("&amp;", "&")
            else -> raw
        }
        fun encode(kind: String, raw: String): String = when (kind) {
            "base64" -> encodeBase64NoWrap(raw.toByteArray(StandardCharsets.UTF_8))
            "uri" -> encodeURIComponent(raw)
            "unicode" -> raw.codePoints().toArray().joinToString("") { "\\u%04x".format(Locale.US, it) }
            "html" -> raw.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;")
            else -> raw
        }
        fun uuidEncode(raw: String): String {
            val compact = raw.trim().replace("-", "")
            require(compact.matches(Regex("^[0-9a-fA-F]{32}$"))) { "Enter a canonical UUID in 8-4-4-4-12 hexadecimal form." }
            return compact.chunked(2).joinToString(" ") { it.toInt(16).toString(2).padStart(8, '0') }
        }
        fun uuidDecode(raw: String): String {
            val compact = raw.trim().replace(Regex("[\\s,:-]"), "")
            val hex = when {
                compact.matches(Regex("^[01]{128}$")) -> compact.chunked(8).joinToString("") { it.toInt(2).toString(16).padStart(2, '0') }
                compact.matches(Regex("^[0-9a-fA-F]{32}$")) -> compact.lowercase(Locale.US)
                else -> throw IllegalArgumentException("Enter exactly 128 binary digits or 32 hexadecimal digits to decode a UUID.")
            }
            return "${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20)}"
        }
        fun cssEncode(raw: String): String = buildString {
            raw.codePoints().toArray().forEach { cp -> when (cp) {
                0x5c -> append("\\\\")
                0x22 -> append("\\\"")
                0x27 -> append("\\27 ")
                0x0a -> append("\\a ")
                0x0d -> append("\\d ")
                0x0c -> append("\\c ")
                0 -> append("\\fffd ")
                in 1..0x1f, 0x7f -> append("\\${cp.toString(16)} ")
                else -> append(String(Character.toChars(cp)))
            } }
        }
        fun cssDecode(raw: String): String = Regex("\\\\([0-9a-fA-F]{1,6})[ \t\r\n\u000c]?|\\\\(.)").replace(raw) { m ->
            val hex = m.groups[1]?.value
            if (hex != null) { val cp = hex.toInt(16); String(Character.toChars(if (cp == 0 || cp > 0x10ffff || cp in 0xd800..0xdfff) 0xfffd else cp)) }
            else m.groups[2]?.value ?: ""
        }
        fun localSuffixFallback(familyName: String = base): String {
            val family = familyName.replace("developer-", "").lowercase(Locale.US)
            val bytes = input.toByteArray(StandardCharsets.UTF_8).size
            val note = when {
                family.contains("yaml") -> "YAML checks are lightweight and do not replace a full parser or schema validator."
                family.contains("sql") -> "SQL syntax varies by dialect; this does not execute SQL or inspect a database schema."
                family.contains("graphql") -> "GraphQL type validation requires the target schema; this operation performs structure checks only."
                family.contains("jwt") -> "JWT decoding is not signature verification. Do not trust claims unless a separate verifier validates issuer, audience, algorithm and signature."
                family.contains("docker") || family.contains("nginx") || family.contains("kubernetes") || family.contains("openapi") -> "Review this local result against your toolchain and deployed version; it does not execute or fully validate the configuration."
                family.contains("hash") -> "Hashes are one-way digests, not encryption; MD5 and SHA-1 are legacy algorithms."
                else -> "This local utility does not execute code or send the input to a server."
            }
            return when (suffix) {
                "explainer" -> "${family.uppercase(Locale.US)} — local explanation\n\n$note\n\nInput: ${input.length} characters, $bytes UTF-8 bytes, ${if(input.isEmpty()) 0 else input.lineSequence().count()} lines."
                "inspector" -> JSONObject().put("tool",op).put("family",family).put("characters",input.length).put("utf8Bytes",bytes).put("lines",if(input.isEmpty()) 0 else input.lineSequence().count()).put("words",input.trim().split(Regex("\\s+")).count { it.isNotEmpty() }).put("delimiterCounts",JSONObject().put("openCurly",input.count{it=='{' }).put("closeCurly",input.count{it=='}'}).put("openRound",input.count{it=='('}).put("closeRound",input.count{it==')'})).put("preview",input.take(500)).put("note",note).toString(2)
                "parser" -> JSONObject().put("family",family).put("lineCount",input.lineSequence().count()).put("lines",JSONArray(input.replace("\r\n","\n").split('\n').mapIndexed { index,line -> JSONObject().put("line",index+1).put("empty",line.isEmpty()).put("text",line) })).put("note","Line-oriented local parse view; no full domain parser is bundled for this mode.").toString(2)
                "preview" -> JSONObject().put("family",family).put("preview",input.take(2000)).put("truncated",input.length>2000).put("characters",input.length).put("utf8Bytes",bytes).put("note",note).toString(2)
                "validator", "tester" -> {
                    require(input.isNotBlank()) { "Enter $family input to check." }
                    val stack=ArrayDeque<Char>(); var quote='\u0000'; var escaped=false
                    for ((index,ch) in input.withIndex()) { if (quote!='\u0000') { if(escaped) escaped=false else if(ch=='\\') escaped=true else if(ch==quote) quote='\u0000'; continue }; if(ch=='\"' || ch=='\'') quote=ch else if(ch in "([{ ".trim()) stack.addLast(ch) else if(ch in ")]}") { val expected=when(ch){')'->'(';']'->'[';else->'{'}; require(stack.isNotEmpty() && stack.removeLast()==expected) { "Unmatched or misordered closing delimiter '$ch' at character ${index+1}." } } }
                    require(quote=='\u0000') { "Unterminated quoted string; this is a basic structure check, not a language parser." }; require(stack.isEmpty()) { "Unclosed delimiter '${stack.last()}'." }; "$family structural check passed: quotes and delimiters are balanced. This is not full syntax, schema, type or runtime validation."
                }
                "formatter", "beautifier" -> input.replace("\r\n","\n").replace('\r','\n').lines().joinToString("\n") { it.trimEnd() }.replace(Regex("\n{3,}"),"\n\n").trimEnd()
                "minifier" -> input.replace("\r\n","\n").replace('\r','\n').lines().map{it.trim()}.filter{it.isNotEmpty()}.joinToString("\n")
                "generator" -> when(family) {
                    "json" -> "{\"id\":\"example-1\",\"active\":true,\"items\":[]}"
                    "sql" -> "CREATE TABLE example_records (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\n"
                    "css" -> ":root {\n  --primary: #0d9f8a;\n}\n\n.example { color: var(--primary); padding: 1rem; }\n"
                    "javascript", "typescript" -> "export function main() {\n  return { ok: true };\n}\n"
                    "docker" -> "FROM node:22-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev\nCOPY . .\nCMD [\"node\", \"server.js\"]\n"
                    "openapi" -> "openapi: 3.1.0\ninfo:\n  title: Example API\n  version: 1.0.0\npaths: {}\n"
                    "git" -> "# Common generated files\n.env\n*.log\n.DS_Store\n"
                    "nginx" -> "server {\n  listen 80;\n  server_name example.test;\n  location / { try_files \$uri \$uri/ =404; }\n}\n"
                    "csv" -> "id,name,active\n1,Ada,true\n2,Grace,true"
                    "yaml" -> "app:\n  name: example\n  enabled: true\n"
                    "markdown" -> "# Project title\n\nDescribe the purpose of this project.\n"
                    "graphql" -> "query Example(${'$'}id: ID!) {\n  node(id: ${'$'}id) { id __typename }\n}\n"
                    "kubernetes" -> "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: example-config\ndata:\n  APP_ENV: \"development\"\n"
                    "uuid" -> UUID.randomUUID().toString()
                    "http" -> "GET /health HTTP/1.1\nHost: api.example.com\nAccept: application/json\n"
                    else -> throw IllegalArgumentException("No domain-specific generator preset is defined for $family; use a supported preset or related generator.")
                }
                "converter" -> input.replace("\r\n","\n").replace('\r','\n')
                "encoder" -> encode("base64",input)
                "decoder" -> decode("base64",input)
                else -> input
            }
        }

        developerTemplate(op, input, secondary)?.let { return it }
        if (lower.contains("uuid") && suffix == "encoder") return uuidEncode(input)
        if (lower.contains("uuid") && suffix == "decoder") return uuidDecode(input)
        if (lower.contains("hash") && suffix == "decoder") throw IllegalArgumentException("Cryptographic hashes are one-way digests and cannot be decoded to the original input.")
        if (lower.contains("hash") && suffix == "explainer") return "A hash maps input bytes to a fixed-length digest; it is not encryption. MD5 and SHA-1 are legacy algorithms and unsuitable for modern collision-resistant security. Passwords require a dedicated password-hashing scheme. Processing remains local."
        if (lower.contains("hash") && (suffix == "inspector" || suffix == "parser")) {
            val compact = input.filterNot(Char::isWhitespace)
            val algorithms = mapOf(32 to "MD5", 40 to "SHA-1", 64 to "SHA-256", 96 to "SHA-384", 128 to "SHA-512")
            return JSONObject().put("characters", input.length).put("hexadecimal", compact.isNotEmpty() && compact.all { it in "0123456789abcdefABCDEF" }).put("possibleAlgorithm", algorithms[compact.length] ?: JSONObject.NULL).put("note", "Digest length suggests a format; it does not verify authenticity.").toString(2)
        }
        if (lower.contains("hash") && (suffix == "formatter" || suffix == "beautifier")) {
            val compact = input.filterNot(Char::isWhitespace)
            require(compact.isNotEmpty() && compact.all { it in "0123456789abcdefABCDEF" }) { "A hash digest must contain hexadecimal characters only." }
            return compact.lowercase(Locale.US).chunked(8).joinToString(" ")
        }
        if (lower.contains("developer-sql-query-builder") || lower.contains("sql-query-builder")) {
            val spec = if (input.isBlank()) JSONObject() else runCatching { JSONObject(input) }.getOrElse { throw IllegalArgumentException("Enter query options as JSON with table, columns, filters and limit.") }
            fun identifier(raw: String, label: String): String { require(Regex("^[A-Za-z_][A-Za-z0-9_]*$").matches(raw)) { "$label must be a simple SQL identifier." }; return "\"$raw\"" }
            val table = identifier(spec.optString("table", "users"), "Table")
            val columns = spec.optJSONArray("columns")?.let { arr -> (0 until arr.length()).map { identifier(arr.getString(it), "Column") }.joinToString(", ") }?.takeIf { it.isNotBlank() } ?: "*"
            val filters = spec.optJSONArray("filters") ?: org.json.JSONArray(); val params = org.json.JSONArray(); val clauses = mutableListOf<String>()
            for (i in 0 until filters.length()) { val f = filters.optJSONObject(i) ?: throw IllegalArgumentException("Each filter must be an object."); val col = identifier(f.optString("column"), "Filter column"); val operator = f.optString("operator", "=").uppercase(Locale.US); require(operator in setOf("=", "!=", "<>", "<", "<=", ">", ">=", "LIKE", "IN", "IS NULL", "IS NOT NULL")) { "Unsupported filter operator: $operator" }; if (operator == "IS NULL" || operator == "IS NOT NULL") clauses += "$col $operator" else if (operator == "IN") { val arr = f.optJSONArray("value") ?: throw IllegalArgumentException("IN requires a non-empty array."); require(arr.length() > 0) { "IN requires a non-empty array." }; clauses += "$col IN (${(0 until arr.length()).joinToString(", ") { "?" }})"; for (j in 0 until arr.length()) params.put(arr.get(j)) } else { clauses += "$col $operator ?"; params.put(f.opt("value")) } }
            val limit = spec.optInt("limit", 100); require(limit in 1..10000) { "Limit must be an integer from 1 through 10000." }
            return JSONObject().put("sql", "SELECT $columns FROM $table${if (clauses.isEmpty()) "" else " WHERE ${clauses.joinToString(" AND ")}"} LIMIT $limit;").put("parameters", params).put("note", "Uses ? placeholders for values; adapt quoting and placeholders to your database driver/dialect.").toString(2)
        }
        if (lower.contains("http-request-builder")) {
            val url = runCatching { URI(input.trim().ifBlank { "https://api.example.com/health" }) }.getOrElse { throw IllegalArgumentException("Enter an absolute http or https URL.") }
            require(url.scheme?.lowercase(Locale.US) in setOf("http", "https") && !url.host.isNullOrBlank()) { "Enter an absolute http or https URL." }
            val method = secondary.trim().substringBefore(" ").ifBlank { "GET" }.uppercase(Locale.US); require(method in setOf("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS")) { "Unsupported HTTP method." }
            return "$method ${url.rawPath.ifBlank { "/" }}${url.rawQuery?.let { "?$it" } ?: ""} HTTP/1.1\nHost: ${url.host}\nAccept: application/json\nUser-Agent: enV-Developer-Studio/1.0\n"
        }
        if (lower.contains("status-code-explainer") || lower.contains("http-status-explainer")) {
            val code = input.trim().toIntOrNull() ?: throw IllegalArgumentException("Enter an HTTP status code from 100 through 599."); require(code in 100..599) { "Enter an HTTP status code from 100 through 599." }
            val description = httpStatuses.firstOrNull { it.first == code }?.second ?: "Unassigned or extension status code"
            val category = when (code / 100) { 1 -> "Informational"; 2 -> "Success"; 3 -> "Redirection"; 4 -> "Client error"; else -> "Server error" }
            return JSONObject().put("code",code).put("name",description).put("category",category).put("note","This lookup is local and sends no request.").toString(2)
        }
        if (lower.contains("ip-header-parser")) {
            val headers = JSONArray()
            input.lineSequence().forEach { line -> val match = Regex("^\\s*(x-forwarded-for|x-real-ip|cf-connecting-ip|forwarded)\\s*:\\s*(.*)$", RegexOption.IGNORE_CASE).matchEntire(line); if (match != null) { val name=match.groupValues[1]; val raw=match.groupValues[2].trim(); val row=JSONObject().put("name",name).put("value",raw); if (name.equals("x-forwarded-for",true)) row.put("addresses",JSONArray(raw.split(',').map { it.trim() }.filter { it.isNotEmpty() })); headers.put(row) } }
            return JSONObject().put("headers",headers).put("note","Forwarding headers are attacker-controlled unless a trusted proxy strips and rewrites them.").toString(2)
        }
        if (lower.contains("json-path") || lower.contains("jsonpath")) return developerJsonPath(input, secondary.ifBlank { "$" })
        if (lower.contains("query-string-parser") || lower.contains("query-parser") || lower == "url-query-parser") {
            val rawInput = input.trim()
            val rawQuery = (if (rawInput.contains("?")) rawInput.substringAfter("?") else rawInput).substringBefore("#").removePrefix("?")
            val entries = JSONArray(); val grouped = JSONObject()
            if (rawQuery.isNotEmpty()) rawQuery.split('&').forEach { part ->
                if (part.isEmpty()) return@forEach
                val split = part.split('=', limit = 2)
                val key = runCatching { URLDecoder.decode(split[0], StandardCharsets.UTF_8.name()) }.getOrElse { throw IllegalArgumentException("Invalid percent escape in query parameter name.") }
                val value = runCatching { URLDecoder.decode(split.getOrElse(1) { "" }, StandardCharsets.UTF_8.name()) }.getOrElse { throw IllegalArgumentException("Invalid percent escape in query parameter '$key'.") }
                entries.put(JSONObject().put("key", key).put("value", value))
                (grouped.optJSONArray(key) ?: JSONArray().also { grouped.put(key, it) }).put(value)
            }
            return JSONObject().put("count", entries.length()).put("entries", entries).put("grouped", grouped).toString(2)
        }
        if ((lower.contains("query-string-builder") || lower.contains("query-builder")) && !lower.contains("sql") && !lower.contains("graphql")) {
            val pairs = mutableListOf<Pair<String,String>>()
            if (input.isNotBlank()) {
                when (val parsed = runCatching { parseJson(input) }.getOrNull()) {
                    is JSONObject -> parsed.keys().asSequence().toList().sorted().forEach { key -> val v = parsed.get(key); if (v is JSONArray) for (i in 0 until v.length()) pairs += key to (v.opt(i)?.takeUnless { it === JSONObject.NULL }?.toString() ?: "") else pairs += key to if (v === JSONObject.NULL) "" else v.toString() }
                    is JSONArray -> for (i in 0 until parsed.length()) when (val row = parsed.opt(i)) {
                        is JSONArray -> { require(row.length() >= 2) { "Each query pair must contain a key and value." }; pairs += row.opt(0).toString() to row.opt(1).toString() }
                        is JSONObject -> pairs += row.optString("key") to row.optString("value")
                        else -> throw IllegalArgumentException("Use arrays of [key, value] pairs or {key, value} objects.")
                    }
                    else -> input.lines().filter { it.isNotBlank() && it.contains('=') }.forEach { line -> val p = line.split('=', limit=2); pairs += p[0].trim() to p.getOrElse(1) { "" }.trim() }
                }
            }
            require(pairs.isNotEmpty()) { "Enter a JSON object, array of key/value pairs, or one key=value pair per line." }
            return pairs.joinToString("&") { (key,value) -> "${URLEncoder.encode(key, StandardCharsets.UTF_8.name())}=${URLEncoder.encode(value, StandardCharsets.UTF_8.name())}" }
        }
        if (lower.contains("cookie-parser")) {
            val cookies = input.split(';').map { it.trim() }.filter { it.isNotEmpty() }.map { part -> val idx=part.indexOf('='); if (idx<0) JSONObject().put("name",part).put("value","").put("hasValue",false) else JSONObject().put("name",part.substring(0,idx).trim()).put("value",part.substring(idx+1).trim()).put("hasValue",true) }
            return JSONObject().put("count",cookies.size).put("cookies",JSONArray(cookies)).toString(2)
        }
        if (lower.contains("header-builder")) {
            val headers=linkedMapOf<String,String>(); val parsed=runCatching { parseJson(input) }.getOrNull()
            if (parsed is JSONObject) parsed.keys().forEach { key -> headers[key]=if(parsed.opt(key)===JSONObject.NULL) "" else parsed.opt(key).toString() }
            else input.lineSequence().filter { it.isNotBlank() }.forEach { line -> val idx=line.indexOf(':'); require(idx>0) { "Enter headers as JSON or Header-Name: value lines." }; headers[line.substring(0,idx).trim()]=line.substring(idx+1).trim() }
            require(headers.isNotEmpty()) { "Enter headers as JSON or one Header-Name: value per line." }
            return headers.entries.joinToString("\n") { (name,value) -> require(Regex("^[!#$%&'*+.^_`|~0-9A-Za-z-]+$").matches(name)) { "Invalid HTTP header name: $name" }; require(!value.contains('\r')&&!value.contains('\n')) { "Header '$name' contains a line break, which is not allowed." }; "$name: $value" }
        }
        if (lower.contains("user-agent-parser")) {
            val ua=input.trim();val l=ua.lowercase(Locale.US)
            val browser=when { l.contains("edg/")->"Microsoft Edge";l.contains("opr/")||l.contains("opera")->"Opera";l.contains("firefox/")->"Firefox";l.contains("chrome/")||l.contains("crios/")->"Chrome/Chromium";l.contains("safari/")->"Safari";else->"Unknown" }
            val os=when { l.contains("android")->"Android";l.contains("iphone")||l.contains("ipad")||l.contains("cpu os")->"iOS/iPadOS";l.contains("windows")->"Windows";l.contains("mac os")||l.contains("macintosh")->"macOS";l.contains("linux")->"Linux";else->"Unknown" }
            val version=Regex("(?i)(?:edg|opr|firefox|chrome|crios|version)/([0-9.]+)").find(ua)?.groupValues?.get(1)
            return JSONObject().put("browser",browser).put("browserVersion",version ?: JSONObject.NULL).put("operatingSystem",os).put("mobile",l.contains("mobile")||l.contains("android")||l.contains("iphone")||l.contains("ipad")).put("raw",ua).put("note","User-agent strings are self-reported and can be spoofed; classification is heuristic.").toString(2)
        }
        return when {
            lower.contains("file-hash") -> throw IllegalArgumentException("Choose a local file in the native file-hash picker; text input is not a substitute for file bytes.")
            lower.contains("hash-compare") || lower.contains("hash-diff") -> {
                val rawLeft = input.trim().replace(Regex("\\s+"), "")
                val rawRight = secondary.trim().replace(Regex("\\s+"), "")
                require(rawLeft.isNotEmpty() && rawRight.isNotEmpty()) { "Enter both hash values to compare." }
                val digestLengths = setOf(32, 40, 48, 64, 96, 128)
                fun isHexDigest(value: String) = value.length in digestLengths && value.all { it in '0'..'9' || it.lowercaseChar() in 'a'..'f' }
                val normalizeHex = isHexDigest(rawLeft) && isHexDigest(rawRight)
                val left = if (normalizeHex) rawLeft.lowercase(Locale.US) else rawLeft
                val right = if (normalizeHex) rawRight.lowercase(Locale.US) else rawRight
                val equal = left == right
                JSONObject().put("equal",equal).put("leftLength",left.length).put("rightLength",right.length).put("comparison",if(normalizeHex) "hex-digest-case-insensitive" else "exact-string").put("note","Display comparison only; not a timing-safe authentication primitive or signature verification.").toString(2)
            }
            lower.contains("hash") || lower.contains("md5") || lower.contains("sha1") || lower.contains("sha-1") || lower.contains("sha256") || lower.contains("sha-256") || lower.contains("sha512") || lower.contains("sha-512") || lower.contains("sha384") || lower.contains("sha-384") -> developerHashBytes(op,input.toByteArray(StandardCharsets.UTF_8))
            lower.contains("data-uri") -> {
                if (suffix == "decoder") {
                    val comma = input.indexOf(',')
                    require(input.startsWith("data:") && comma >= 0) { "Enter a valid data URI containing a comma separator." }
                    val metadata = input.substring(0, comma)
                    val payload = input.substring(comma + 1)
                    if (metadata.endsWith(";base64", true)) decodeBase64Text(payload)
                    else decodeURIComponent(payload)
                } else "data:text/plain;base64,${encodeBase64NoWrap(input.toByteArray(StandardCharsets.UTF_8))}"
            }
            lower.contains("unix-timestamp") || lower.contains("timestamp-converter") || lower.contains("epoch-converter") -> developerTimestamp(input)
            lower.contains("cron") && suffix !in setOf("encoder", "decoder") -> developerCron(input.ifBlank { if(lower.contains("generator")) "*/5 * * * *" else "" }.ifBlank { throw IllegalArgumentException("Enter a five-field cron expression: minute hour day-of-month month day-of-week.") })
            listOf("regex-tester", "regex-replace", "regex-generator", "regex-explainer").any(lower::contains) -> {
                require(secondary.isNotEmpty()) { "Enter a sample string, or a JSON array of sample strings, in the second field." }
                val regexFlags = if (flags.contains('g')) flags else "${flags}g"
                // Multiple JSON-string samples address a recurring regex-tool complaint: toggling g/m
                // flags to test unrelated cases is cumbersome. Each sample is evaluated independently.
                val samples = if (secondary.trimStart().startsWith("[")) {
                    runCatching { JSONArray(secondary) }.getOrNull()?.let { arr ->
                        (0 until arr.length()).map { index -> arr.opt(index) }.also { values ->
                            require(values.all { it is String }) { "Regex batch input must be a JSON array containing only strings." }
                        }.map { it as String }
                    } ?: listOf(secondary)
                } else listOf(secondary)
                val batch = samples.size != 1 || secondary.trimStart().startsWith("[")
                require(!batch || samples.size in 1..100) { "Regex batch mode accepts between 1 and 100 sample strings." }
                require(samples.sumOf { it.toByteArray(StandardCharsets.UTF_8).size } <= 1_000_000) { "Regex sample input exceeds the 1 MB local processing limit." }
                val regex = Regex(input, regexOptions(regexFlags))
                val backtrackingRisk = Regex("""\([^)]*[+*][^)]*\)[+*{]""").containsMatchIn(input) || Regex("""(?:\.\*|\.\+).*(?:\.\*|\.\+)""").containsMatchIn(input)
                val replacement = opts["replacement"] ?: ""
                fun analyze(sample: String, index: Int): JSONObject {
                    // JVM Regex has no cross-platform hard timeout. Skip long samples for patterns
                    // matching the heuristic rather than making a false safety promise to users.
                    val skipped = backtrackingRisk && sample.length > 24
                    val matches = if (skipped) emptyList() else regex.findAll(sample).take(500).toList()
                    val row = JSONObject().put("sampleIndex", index).put("sample", sample).put("matchCount", matches.size)
                        .put("matches", JSONArray(matches.map { match -> JSONObject().put("match", match.value).put("index", match.range.first).put("endExclusive", match.range.last + 1).put("groups", JSONArray(match.groupValues.drop(1))) }))
                        .put("executionSkipped", skipped)
                    if (lower.contains("replace") && !skipped) row.put("preview", regex.replace(sample, replacement))
                    else if (lower.contains("replace")) row.put("preview", JSONObject.NULL)
                    return row
                }
                val rows = JSONArray(samples.mapIndexed { index, sample -> analyze(sample, index) })
                val totalMatches = (0 until rows.length()).sumOf { rows.getJSONObject(it).getInt("matchCount") }
                val riskNote = if (backtrackingRisk) "Potential catastrophic backtracking pattern detected heuristically. Matching is skipped for samples over 24 UTF-16 code units because JVM Regex has no portable timeout." else null
                if (batch) JSONObject().put("pattern", input).put("flags", regexFlags).put("engine", "Kotlin Regex (native JVM engine; syntax differs from JavaScript RegExp)")
                    .put("mode", "batch").put("sampleCount", samples.size).put("matchCount", totalMatches).put("results", rows)
                    .put("performanceRisk", riskNote ?: JSONObject.NULL).put("replacement", if (lower.contains("replace")) replacement else JSONObject.NULL).toString(2)
                else {
                    val result = rows.getJSONObject(0)
                    if (lower.contains("replace")) JSONObject().put("pattern", input).put("flags", regexFlags).put("replacement", replacement)
                        .put("preview", result.opt("preview")).put("executionSkipped", result.getBoolean("executionSkipped")).put("performanceRisk", riskNote ?: JSONObject.NULL)
                        .put("engine", "Kotlin Regex (native JVM engine; syntax differs from JavaScript RegExp)").put("matches", result.getJSONArray("matches")).toString(2)
                    else "Pattern: /$input/\nEngine: Kotlin Regex (native JVM engine; syntax differs from JavaScript RegExp)\nMatches: ${result.getInt("matchCount")}\n${riskNote?.let { "\nWarning: $it\n" } ?: ""}\n${result.getJSONArray("matches").let { arr -> (0 until arr.length()).map { i -> val m=arr.getJSONObject(i); "${i+1}. ${m.getString("match")} at index ${m.getInt("index")}" }.joinToString("\n").ifBlank { if (result.getBoolean("executionSkipped")) "Execution skipped for safety" else "No matches" } }}"
                }
            }
            lower.contains("jwt-") -> {
                val parts = input.trim().split('.')
                require(parts.size == 3) { "A JWT must contain three dot-separated parts." }
                val header = parseJson(b64UrlDecode(parts[0])) as? JSONObject ?: error("JWT header must be a JSON object.")
                val payload = parseJson(b64UrlDecode(parts[1])) as? JSONObject ?: error("JWT payload must be a JSON object.")
                val exp = (payload.opt("exp") as? Number)?.toDouble()
                val expiresAt = exp?.let { seconds -> runCatching { java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(java.time.ZoneOffset.UTC).format(java.time.Instant.ofEpochMilli((seconds * 1000).toLong())) }.getOrElse { "out-of-range" } } ?: "none"
                val expired: Any = exp?.let { System.currentTimeMillis() / 1000.0 >= it } ?: JSONObject.NULL
                fun claimTime(key: String): Any {
                    val raw = payload.opt(key); val seconds = (raw as? Number)?.toDouble() ?: return JSONObject.NULL
                    val instant = runCatching { Instant.ofEpochMilli((seconds * 1000).toLong()) }.getOrNull()
                        ?: return JSONObject().put("unixSeconds", seconds).put("status", "out-of-range")
                    val now = System.currentTimeMillis() / 1000.0
                    val status = when(key) { "exp" -> if(now >= seconds) "expired" else "valid"; "nbf" -> if(now < seconds) "not-yet-valid" else "active"; "iat" -> if(seconds > now) "issued-in-the-future" else "valid"; else -> "informational" }
                    return JSONObject().put("unixSeconds",seconds).put("iso",DateTimeFormatter.ISO_INSTANT.format(instant)).put("status",status)
                }
                val claims=JSONObject().put("exp",claimTime("exp")).put("iat",claimTime("iat")).put("nbf",claimTime("nbf")).put("sub",payload.opt("sub")).put("iss",payload.opt("iss")).put("aud",payload.opt("aud"))
                val largeIntegerWarning = Regex("""(?:"[^"]+"\s*:\s*)?-?\d{16,}(?:\D|$)""").containsMatchIn(b64UrlDecode(parts[1]))
                JSONObject().put("warning","DECODE ONLY — signature not verified. Do not treat this display as proof of authenticity.").put("header", header).put("payload", payload).put("claims",claims).put("signaturePresent", parts[2].isNotEmpty()).put("signatureVerified",false).put("expiresAt", expiresAt).put("expired", expired).put("largeIntegerPrecisionWarning",if(largeIntegerWarning) "Large integers may lose precision when parsed as JavaScript/Double numbers." else JSONObject.NULL).toString(2)
            }
            lower.contains("uuid-generator") || lower.contains("uuid-batch-generator") -> {
                val count = (secondary.toDoubleOrNull() ?: 10.0).toInt().coerceIn(1, 1000)
                List(count) { UUID.randomUUID().toString() }.joinToString("\n")
            }
            lower.contains("uuid") && (lower.contains("validator") || lower.contains("tester")) -> developerUuidValidation(input)
            lower.contains("uuid") && suffix in setOf("formatter", "beautifier", "minifier", "converter", "parser", "inspector", "preview", "explainer") -> {
                val compact = input.trim().replace("-", "").lowercase(Locale.US)
                when (suffix) {
                    "explainer" -> "UUIDs are 128-bit identifiers. This local tool validates their shape and reports the encoded form; uniqueness is not proven by inspection."
                    "inspector", "parser" -> JSONObject().put("valid", developerUuidValidation(input).startsWith("Valid UUID")).put("canonical", input.trim().lowercase(Locale.US)).put("hex", compact).put("bits", if (compact.matches(Regex("^[0-9a-f]{32}$"))) compact.chunked(8).joinToString(" ") { it } else JSONObject.NULL).put("note", "UUID structure is inspected locally; ownership or uniqueness cannot be inferred.").toString(2)
                    "preview" -> input.trim().take(100)
                    "minifier" -> compact
                    "converter" -> if (compact.matches(Regex("^[0-9a-f]{32}$"))) compact.chunked(8).joinToString("-") else throw IllegalArgumentException("Enter a valid UUID to convert.")
                    else -> developerUuidValidation(input).let { if (!it.startsWith("Valid UUID")) throw IllegalArgumentException(it); it }
                }
            }
            lower.contains("url-") || lower.contains("uri-") || lower.contains("cookie-parser") || lower.contains("query-builder") -> {
                when {
                    lower.contains("encoder") -> encode("uri", input)
                    lower.contains("decoder") -> decode("uri", input)
                    lower.contains("validator") || lower.contains("tester") -> {
                        val uri = runCatching { URI(input.trim()) }.getOrElse { throw IllegalArgumentException("Failed to construct 'URL': Invalid URL") }
                        if (uri.scheme.isNullOrEmpty()) throw IllegalArgumentException("Failed to construct 'URL': Invalid URL")
                        "Valid URL/URI"
                    }
                    else -> runCatching { developerUrlInfo(input) }.getOrElse { throw IllegalArgumentException("Failed to construct 'URL': Invalid URL") }
                }
            }
            lower.contains("base64") -> when {
                suffix == "encoder" || suffix == "generator" -> encode(if (lower.contains("url-safe") || lower.contains("urlsafe")) "base64url" else "base64", input)
                suffix == "decoder" -> decode(if (lower.contains("url-safe") || lower.contains("urlsafe")) "base64url" else "base64", input)
                suffix == "validator" || suffix == "tester" -> { val decoded = decode(if (lower.contains("url-safe") || lower.contains("urlsafe")) "base64url" else "base64", input); "Valid Base64. Decoded UTF-8 length: ${decoded.length} characters / ${decoded.toByteArray(StandardCharsets.UTF_8).size} bytes." }
                suffix == "formatter" || suffix == "beautifier" -> { val decoded = decode("base64", input); encode("base64", decoded) }
                suffix == "inspector" || suffix == "parser" || suffix == "preview" -> { val decoded = decode("base64", input); JSONObject().put("valid", true).put("encodedCharacters", input.length).put("decodedCharacters", decoded.length).put("decodedUtf8Bytes", decoded.toByteArray(StandardCharsets.UTF_8).size).put("preview", decoded.take(500)).put("note", "Base64 is encoding, not encryption.").toString(2) }
                suffix == "explainer" -> "Base64 maps bytes to printable text using a 64-character alphabet. It is not encryption; use URL-safe Base64 for URL contexts and validate untrusted input before use."
                else -> localSuffixFallback("base64")
            }
            lower.contains("unicode") -> when {
                suffix == "encoder" || suffix == "generator" -> encode("unicode", input)
                suffix == "decoder" -> decode("unicode", input)
                else -> localSuffixFallback("unicode")
            }
            lower.contains("ascii") || lower.contains("binary") || lower.contains("hex") -> when {
                suffix == "encoder" || suffix == "generator" || suffix == "converter" -> {
                    if (lower.contains("ascii")) { require(input.all { it.code <= 127 }) { "ASCII only supports code points U+0000–U+007F; use Hex or Binary for UTF-8 text." }; input.map { it.code.toString() }.joinToString(" ") }
                    else input.toByteArray(StandardCharsets.UTF_8).joinToString(" ") { byte -> val value = byte.toInt() and 0xff; if (lower.contains("binary")) value.toString(2).padStart(8,'0') else value.toString(16).padStart(2,'0') }
                }
                suffix == "decoder" -> {
                    val tokens = input.trim().split(Regex("[\\s,]+")).filter(String::isNotEmpty)
                    require(tokens.isNotEmpty()) { "Enter a code sequence to decode." }
                    if (lower.contains("ascii")) { val numbers=tokens.map { it.toIntOrNull() ?: -1 }; require(numbers.all { it in 0..127 }) { "ASCII codes must be decimal integers from 0 to 127." }; numbers.map { it.toChar() }.joinToString("") }
                    else { val radix=if(lower.contains("binary")) 2 else 16; val bytes=tokens.map { token -> val n=token.toIntOrNull(radix) ?: -1; require(n in 0..255 && (radix!=2 || token.length<=8)) { "Invalid ${if(radix==2) "binary byte" else "hex byte"}: $token" }; n.toByte() }.toByteArray(); StandardCharsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString() }
                }
                else -> localSuffixFallback(if (lower.contains("ascii")) "ascii" else if (lower.contains("binary")) "binary" else "hex")
            }
            lower.contains("json-schema") && (suffix == "generator" || suffix == "builder") -> {
                val sample = parseJson(input.ifBlank { "{\"name\":\"Ada\",\"count\":2,\"ratio\":1.5,\"active\":true}" })
                // Build a union-aware schema from every array example instead of assuming the first
                // element describes all records. Required object members are the intersection across samples.
                fun types(schema: JSONObject): Set<String> = when (val raw = schema.opt("type")) {
                    is JSONArray -> (0 until raw.length()).mapNotNull { raw.optString(it).takeIf(String::isNotBlank) }.toSet()
                    is String -> setOf(raw)
                    else -> emptySet()
                }
                fun mergeSchemas(left: JSONObject, right: JSONObject): JSONObject {
                    val mergedTypes = (types(left) + types(right)).toMutableSet()
                    // JSON Schema's number accepts integers too; emitting both is redundant.
                    if ("number" in mergedTypes) mergedTypes.remove("integer")
                    val out = JSONObject()
                    if (mergedTypes.isNotEmpty()) out.put("type", if (mergedTypes.size == 1) mergedTypes.first() else JSONArray(mergedTypes.sorted()))
                    if ("object" in mergedTypes) {
                        val leftProps = left.optJSONObject("properties") ?: JSONObject()
                        val rightProps = right.optJSONObject("properties") ?: JSONObject()
                        val keys = (leftProps.keys().asSequence().toSet() + rightProps.keys().asSequence().toSet()).sorted()
                        val props = JSONObject()
                        keys.forEach { key ->
                            val a = leftProps.optJSONObject(key); val b = rightProps.optJSONObject(key)
                            props.put(key, when { a != null && b != null -> mergeSchemas(a, b); a != null -> a; else -> b ?: JSONObject() })
                        }
                        out.put("properties", props)
                        val leftRequired = left.optJSONArray("required")?.let { array -> (0 until array.length()).map { array.optString(it) }.toSet() } ?: emptySet()
                        val rightRequired = right.optJSONArray("required")?.let { array -> (0 until array.length()).map { array.optString(it) }.toSet() } ?: emptySet()
                        out.put("required", JSONArray((leftRequired intersect rightRequired).sorted()))
                        if (left.optBoolean("additionalProperties", false) && right.optBoolean("additionalProperties", false)) out.put("additionalProperties", true)
                        else out.put("additionalProperties", false)
                    }
                    if ("array" in mergedTypes) {
                        val a = left.optJSONObject("items"); val b = right.optJSONObject("items")
                        out.put("items", when { a != null && b != null -> mergeSchemas(a, b); a != null -> a; b != null -> b; else -> JSONObject() })
                    }
                    return out
                }
                fun inferSchema(value: Any): JSONObject = when (value) {
                    is JSONObject -> {
                        val properties = JSONObject(); val required = JSONArray()
                        value.keys().asSequence().toList().sorted().forEach { key -> properties.put(key, inferSchema(value.get(key))); required.put(key) }
                        JSONObject().put("type", "object").put("properties", properties).put("required", required).put("additionalProperties", false)
                    }
                    is JSONArray -> {
                        var merged: JSONObject? = null
                        for (index in 0 until value.length()) {
                            val next = inferSchema(value.get(index))
                            merged = if (merged == null) next else mergeSchemas(merged, next)
                        }
                        JSONObject().put("type", "array").put("items", merged ?: JSONObject())
                    }
                    JSONObject.NULL -> JSONObject().put("type", "null")
                    is String -> JSONObject().put("type", "string")
                    is Boolean -> JSONObject().put("type", "boolean")
                    is Number -> JSONObject().put("type", if (value.toDouble().isFinite() && value.toDouble() % 1.0 == 0.0) "integer" else "number")
                    else -> JSONObject()
                }
                val inferred = inferSchema(sample)
                JSONObject().put("\$schema", "https://json-schema.org/draft/2020-12/schema").put("title", "Generated schema").also { schema -> inferred.keys().forEach { schema.put(it, inferred.get(it)) } }.toString(2)
            }
            lower.contains("json") -> when {
                lower.contains("to-csv") -> jsonToCsv(input)
                lower.contains("diff") -> jsonDiff(input, secondary)
                lower.contains("sort") -> stringifyJson(sortValue(parseJson(input)))
                suffix == "generator" && input.isBlank() -> "{\"id\":\"example-1\",\"name\":\"Example\",\"active\":true,\"items\":[]}"
                suffix == "minifier" -> pretty(input, 0)
                suffix == "inspector" || suffix == "parser" -> developerJsonInspector(input)
                suffix == "explainer" -> { val parsed=parseJson(input); val type=when(parsed){is JSONObject->"object";is JSONArray->"array";JSONObject.NULL->"null";is String->"string";is Number->"number";is Boolean->"boolean";else->"unknown"}; JSONObject().put("rootType",type).put("note","JSON parser semantics can overwrite duplicate keys; very large integers may lose precision in floating-point consumers.").toString(2) }
                suffix in setOf("formatter", "beautifier", "preview", "tester") -> pretty(input)
                suffix == "validator" -> { parseJson(input); val duplicates=scanDuplicateJsonKeyPaths(input).first.distinct(); if(duplicates.isEmpty()) "Valid JSON (RFC 8259-compatible parser)." else "Valid JSON syntax, but duplicate object keys were found at ${duplicates.take(20).joinToString(", ")}; common parsers keep only the final value." }
                suffix == "encoder" -> encode("base64", input)
                suffix == "decoder" -> decode("base64", input)
                suffix == "converter" -> pretty(input)
                else -> localSuffixFallback("json")
            }
            lower.contains("csv") -> when {
                lower.contains("to-json") -> csvToJson(input)
                suffix == "validator" || suffix == "tester" -> { val rows = csvRows(input); if (rows.isEmpty()) throw IllegalArgumentException("CSV is empty."); "Valid CSV with ${rows.size} rows and ${rows[0].size} columns." }
                suffix == "minifier" -> csvString(csvRows(input))
                suffix in setOf("decoder", "parser", "formatter", "beautifier", "preview", "inspector", "converter") -> csvString(csvRows(input))
                suffix == "generator" -> "id,name,active\n1,Ada,true\n2,Grace,true"
                else -> localSuffixFallback("csv")
            }
            lower.contains("markdown-to-html") -> markdownToHtml(input)
            lower.contains("xml") || lower.contains("html") || lower.contains("svg") -> when {
                suffix == "validator" || suffix == "tester" -> if (validateMarkup(input)) "Valid markup/XML." else throw IllegalArgumentException("Invalid markup/XML.")
                suffix == "minifier" -> minifyText(input)
                suffix == "encoder" && lower.contains("css") -> cssEncode(input)
                suffix == "decoder" && lower.contains("css") -> cssDecode(input)
                suffix == "encoder" -> encode("html", input)
                suffix == "decoder" -> decode("html", input)
                suffix == "explainer" -> "Markup formats represent structured elements. XML parsing checks well-formed structure; it does not prove HTML accessibility, sanitization, schema conformance, or SVG safety."
                suffix == "inspector" || suffix == "parser" -> JSONObject().put("tags", Regex("<([A-Za-z][\\w:.-]*)\\b").findAll(input).map { it.groupValues[1].lowercase(Locale.US) }.toList()).put("characters",input.length).put("lines",input.lineSequence().count()).toString(2)
                suffix == "preview" -> input.take(2000)
                suffix == "generator" -> "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><title>New page</title></head><body><main><h1>Hello world</h1></main></body></html>\n"
                suffix == "diff" -> localSuffixFallback("markup")
                else -> formatDeveloperMarkup(input)
            }
            listOf("sql", "graphql", "css", "javascript", "typescript", "docker", "nginx", "kubernetes", "git", "openapi", "markdown", "yaml").any(lower::contains) -> when {
                lower.contains("sql") && suffix in setOf("formatter", "beautifier") -> formatSql(input)
                lower.contains("sql") && suffix == "minifier" -> minifyText(input)
                lower.contains("css") && suffix in setOf("formatter", "beautifier") -> formatCss(input)
                lower.contains("css") && suffix == "minifier" -> minifyText(input)
                lower.contains("markdown") && suffix == "preview" -> markdownToHtml(input)
                lower.contains("markdown") && suffix in setOf("formatter", "beautifier") -> input.replace("\r\n", "\n").lines().joinToString("\n") { it.trimEnd() }.trim() + "\n"
                lower.contains("markdown") && suffix == "generator" -> "# Project title\n\nDescribe the purpose of this project.\n"
                suffix == "validator" || suffix == "tester" || suffix == "explainer" || suffix == "inspector" || suffix == "parser" || suffix == "preview" || suffix == "generator" || suffix == "converter" || suffix == "formatter" || suffix == "beautifier" || suffix == "minifier" || suffix == "diff" -> localSuffixFallback(base)
                suffix == "encoder" && lower.contains("css") -> cssEncode(input)
                suffix == "decoder" && lower.contains("css") -> cssDecode(input)
                suffix == "encoder" -> encode("base64", input)
                suffix == "decoder" -> decode("base64", input)
                else -> localSuffixFallback(base)
            }
            lower.contains("http-status") || lower.contains("status-code") -> {
                val code = input.trim()
                httpStatuses.firstOrNull { it.first.toString() == code }?.let { "$code ${it.second}" } ?: httpStatuses.joinToString("\n") { "${it.first} ${it.second}" }
            }
            lower.contains("mime") || lower.contains("content-type") -> {
                val map = linkedMapOf("json" to "application/json", "js" to "text/javascript", "css" to "text/css", "html" to "text/html", "csv" to "text/csv", "xml" to "application/xml", "pdf" to "application/pdf", "png" to "image/png", "jpg" to "image/jpeg", "jpeg" to "image/jpeg", "webp" to "image/webp", "svg" to "image/svg+xml", "txt" to "text/plain", "wasm" to "application/wasm")
                val extension = input.trim().replace(Regex("^.*\\."), "").lowercase(Locale.US)
                map[extension] ?: map.entries.joinToString("\n") { "${it.key}\t${it.value}" }
            }
            lower.contains("cron") -> when (suffix) {
                "encoder" -> { val expression = input.trim(); developerCron(expression); encode("base64", expression) }
                "decoder" -> { val expression = decode("base64", input).trim(); val report = developerCron(expression); "$expression\n\n$report" }
                else -> developerCron(input.trim().ifBlank { if (lower.contains("generator")) "*/5 * * * *" else "" }.ifBlank { throw IllegalArgumentException("Enter a five-field cron expression: minute hour day-of-month month day-of-week.") })
            }
            lower.contains("data-uri") -> encode("base64", input)
            lower.contains("file-hash") -> throw IllegalArgumentException("Use a local file input for the file hash tool.")
            listOf("generator", "builder", "helper").any(lower::contains) -> input.trim().ifEmpty { "Generated developer template ready. Replace the placeholders with your project values." }
            lower.contains("explainer") -> "Developer tool: $op\n\nInput length: ${input.length} characters."
            else -> input
        }
    }

    private fun formatDeveloperMarkup(input: String): String {
        val tokens = input.replace(Regex(">\\s+<"), "><").replace(Regex("(<[^>]+>)"), "\n$1\n")
            .split("\n").map(String::trim).filter(String::isNotEmpty)
        val voidish = Regex("^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$", RegexOption.IGNORE_CASE)
        var depth = 0
        return tokens.joinToString("\n") { token ->
            val close = token.startsWith("</")
            if (close) depth = max(0, depth - 1)
            val line = "  ".repeat(depth) + token
            val open = token.startsWith("<") && !token.startsWith("</") && !token.startsWith("<!") && !token.endsWith("/>")
            val name = token.replace(Regex("^</?([^\\s>/]+).*$"), "\$1")
            if (open && !voidish.matches(name)) depth += 1
            line
        }
    }

    private fun developerUrlInfo(raw: String): String {
        val uri = URI(raw.trim())
        val scheme = uri.scheme?.lowercase(Locale.US) ?: error("Enter a valid absolute URL.")
        val hostname = uri.host?.lowercase(Locale.US) ?: error("Enter a valid absolute URL.")
        val port = uri.port
        val effectivePort = if ((scheme == "http" && port == 80) || (scheme == "https" && port == 443)) -1 else port
        val portText = if (effectivePort < 0) "" else ":$effectivePort"
        val username = uri.rawUserInfo?.substringBefore(':') ?: ""
        val userInfo = uri.rawUserInfo?.let { "$it@" } ?: ""
        val path = uri.rawPath?.ifEmpty { "/" } ?: "/"
        val query = uri.rawQuery
        val hash = uri.rawFragment
        val href = "$scheme://${userInfo}${hostname}$portText$path${query?.let { "?$it" } ?: ""}${hash?.let { "#$it" } ?: ""}"
        val params = JSONObject()
        query?.split('&')?.filter { it.isNotEmpty() }?.forEach { pair ->
            val parts = pair.split('=', limit = 2)
            val key = URLDecoder.decode(parts[0], StandardCharsets.UTF_8.name())
            val value = if (parts.size > 1) URLDecoder.decode(parts[1], StandardCharsets.UTF_8.name()) else ""
            params.put(key, value)
        }
        return JSONObject().put("href", href).put("protocol", "$scheme:").put("username", username)
            .put("hostname", hostname).put("port", if (effectivePort < 0) "" else effectivePort.toString())
            .put("pathname", path).put("search", query?.takeIf { it.isNotEmpty() }?.let { "?$it" } ?: "")
            .put("hash", hash?.takeIf { it.isNotEmpty() }?.let { "#$it" } ?: "").put("origin", "$scheme://$hostname$portText")
            .put("params", params).toString(2)
    }

    private class StrictJsonValidator(private val source: String) {
        private var index = 0
        fun validate() {
            value()
            whitespace()
            require(index == source.length) { "Unexpected content after JSON value." }
        }
        private fun whitespace() { while (index < source.length && source[index] in charArrayOf(' ', '\t', '\r', '\n')) index++ }
        private fun take(char: Char): Boolean { if (index < source.length && source[index] == char) { index++; return true }; return false }
        private fun expect(char: Char) { require(take(char)) { "Invalid JSON." } }
        private fun value() {
            whitespace()
            require(index < source.length) { "Invalid JSON." }
            when (source[index]) {
                '{' -> obj()
                '[' -> array()
                '"' -> string()
                't' -> literal("true")
                'f' -> literal("false")
                'n' -> literal("null")
                '-', in '0'..'9' -> number()
                else -> error("Invalid JSON.")
            }
        }
        private fun obj() {
            expect('{'); whitespace(); if (take('}')) return
            while (true) {
                whitespace(); require(index < source.length && source[index] == '"') { "Invalid JSON object key." }
                string(); whitespace(); expect(':'); value(); whitespace()
                if (take('}')) return
                expect(',')
            }
        }
        private fun array() {
            expect('['); whitespace(); if (take(']')) return
            while (true) { value(); whitespace(); if (take(']')) return; expect(',') }
        }
        private fun string() {
            expect('"')
            while (index < source.length) {
                val c = source[index++]
                when {
                    c == '"' -> return
                    c == '\\' -> {
                        require(index < source.length) { "Invalid JSON string escape." }
                        when (source[index++]) {
                            '"', '\\', '/', 'b', 'f', 'n', 'r', 't' -> Unit
                            'u' -> repeat(4) { require(index < source.length && source[index].digitToIntOrNull(16) != null) { "Invalid JSON Unicode escape." }; index++ }
                            else -> error("Invalid JSON string escape.")
                        }
                    }
                    c.code < 0x20 -> error("Unescaped control character in JSON string.")
                }
            }
            error("Unterminated JSON string.")
        }
        private fun number() {
            take('-')
            require(index < source.length) { "Invalid JSON number." }
            if (take('0')) require(index == source.length || source[index] !in '0'..'9') { "Leading zero in JSON number." }
            else { require(index < source.length && source[index] in '1'..'9') { "Invalid JSON number." }; while (index < source.length && source[index] in '0'..'9') index++ }
            if (take('.')) { require(index < source.length && source[index] in '0'..'9') { "Invalid JSON fraction." }; while (index < source.length && source[index] in '0'..'9') index++ }
            if (index < source.length && source[index] in 'e'..'e' || index < source.length && source[index] in 'E'..'E') {
                index++; if (index < source.length && source[index] in "+-") index++
                require(index < source.length && source[index] in '0'..'9') { "Invalid JSON exponent." }; while (index < source.length && source[index] in '0'..'9') index++
            }
        }
        private fun literal(expected: String) { require(source.regionMatches(index, expected, 0, expected.length)) { "Invalid JSON literal." }; index += expected.length }
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
