package com.chastech.env.data

/** Native Kotlin Studio definitions. These are catalog projections; source tools and IDs remain intact. */
data class NativeDeveloperStudioMode(val key: String, val label: String, val op: String, val decodeOp: String? = null)
data class NativeDeveloperStudioSpec(
    val id: String, val sourceId: String, val slug: String, val name: String,
    val description: String, val icon: String, val keywords: List<String>,
    val modes: List<NativeDeveloperStudioMode>,
)

object NativeDeveloperStudios {
    val specs = listOf(
        NativeDeveloperStudioSpec("json-studio", "json-formatter", "json-studio", "JSON Studio", "Format, validate, compare, inspect, and query JSON locally while preserving large integer tokens and explaining parser caveats.", "Braces", listOf("json", "format", "minify", "validate", "diff", "path", "tree", "large integer", "privacy"), listOf(
            NativeDeveloperStudioMode("format", "Format", "json-formatter"), NativeDeveloperStudioMode("minify", "Minify", "json-minifier"), NativeDeveloperStudioMode("validate", "Validate", "json-validator"), NativeDeveloperStudioMode("diff", "Diff", "json-diff"), NativeDeveloperStudioMode("path", "Path / Search", "json-path-query"), NativeDeveloperStudioMode("tree", "Tree / Inspect", "json-inspector"), NativeDeveloperStudioMode("schema", "Schema", "developer-json-schema-generator"), NativeDeveloperStudioMode("convert", "Convert to CSV", "json-to-csv"), NativeDeveloperStudioMode("csv", "CSV tools", "csv-formatter"))),
        NativeDeveloperStudioSpec("jwt-studio", "jwt-decoder", "jwt-studio", "JWT Studio", "Decode tokens and inspect registered claims locally. Decoding never proves trust or signature validity.", "ShieldCheck", listOf("jwt", "token", "claims", "expiration", "privacy"), listOf(NativeDeveloperStudioMode("decode", "Decode", "jwt-decoder"), NativeDeveloperStudioMode("expiration", "Expiration", "jwt-expiration-checker"), NativeDeveloperStudioMode("claims", "Claims inspector", "jwt-inspector"), NativeDeveloperStudioMode("payload", "Payload builder", "developer-jwt-payload-generator"))),
        NativeDeveloperStudioSpec("regex-studio", "regex-tester", "regex-studio", "Regex Studio", "Test and replace regular expressions, review captures and portability, and see engine-specific limitations.", "Regex", listOf("regex", "match", "replace", "capture", "flags"), listOf(NativeDeveloperStudioMode("match", "Match / Test", "regex-tester"), NativeDeveloperStudioMode("replace", "Replace", "regex-replace"), NativeDeveloperStudioMode("explain", "Explain", "developer-regex-explainer"))),
        NativeDeveloperStudioSpec("hash-studio", "sha256-hash", "hash-studio", "Hash Studio", "Calculate digest values, compare them, or hash local files without uploading their bytes. Hashes are not encryption.", "Fingerprint", listOf("hash", "sha256", "md5", "sha1", "sha384", "sha512", "file hash"), listOf(NativeDeveloperStudioMode("hash", "Multi-hash", "hash-generator"), NativeDeveloperStudioMode("compare", "Compare", "hash-compare"), NativeDeveloperStudioMode("file", "File hash", "file-hash-calculator"))),
        NativeDeveloperStudioSpec("encoding-studio", "base64-encoder", "encoding-studio", "Encoding Studio", "Encode and decode UTF-8 data across common web, text, and binary representations entirely on-device.", "ArrowLeftRight", listOf("encoding", "decoding", "base64", "url", "html", "hex", "binary", "unicode"), listOf(NativeDeveloperStudioMode("base64", "Base64", "base64-encoder", "base64-decoder"), NativeDeveloperStudioMode("url", "URL", "url-encoder", "url-decoder"), NativeDeveloperStudioMode("html", "HTML entities", "html-encoder", "html-decoder"), NativeDeveloperStudioMode("hex", "Hex", "hex-encoder", "hex-decoder"), NativeDeveloperStudioMode("binary", "Binary", "binary-encoder", "binary-decoder"), NativeDeveloperStudioMode("ascii", "ASCII", "ascii-encoder", "ascii-decoder"), NativeDeveloperStudioMode("unicode", "Unicode", "unicode-encoder", "unicode-decoder"), NativeDeveloperStudioMode("data-uri", "Data URI", "data-uri-generator", "developer-data-uri-decoder"))),
        NativeDeveloperStudioSpec("time-cron-studio", "cron-parser", "time-cron-studio", "Time & Cron Studio", "Convert Unix timestamps and explain five-field cron schedules with upcoming times without contacting a scheduler.", "Clock", listOf("cron", "timestamp", "unix", "UTC", "schedule"), listOf(NativeDeveloperStudioMode("timestamp", "Timestamp", "unix-timestamp-converter"), NativeDeveloperStudioMode("explain", "Cron explain", "cron-explainer"), NativeDeveloperStudioMode("next-runs", "Next runs", "cron-parser"), NativeDeveloperStudioMode("presets", "Presets", "cron-generator"))),
        NativeDeveloperStudioSpec("uuid-studio", "uuid-generator", "uuid-studio", "UUID Studio", "Generate UUID v4 batches and validate UUID shape, variant, and version bits locally.", "Fingerprint", listOf("uuid", "guid", "v4", "batch", "validate"), listOf(NativeDeveloperStudioMode("generate", "Generate batch", "uuid-generator"), NativeDeveloperStudioMode("validate", "Validate", "uuid-validator"))),
        NativeDeveloperStudioSpec("sql-studio", "sql-formatter", "sql-studio", "SQL Studio", "Format and minify SQL using an explicit dialect. Queries are never executed; formatting is not a full grammar validation.", "Database", listOf("sql", "format", "minify", "dialect", "join", "group by"), listOf(NativeDeveloperStudioMode("format", "Format", "sql-formatter"), NativeDeveloperStudioMode("minify", "Minify", "sql-minifier"), NativeDeveloperStudioMode("parse", "Parse feedback", "sql-parser"), NativeDeveloperStudioMode("query", "Query builder", "developer-sql-query-builder"), NativeDeveloperStudioMode("schema", "Schema generator", "developer-sql-schema-generator"))),
        NativeDeveloperStudioSpec("markup-studio", "javascript-formatter", "markup-studio", "Markup & Style Studio", "Format and inspect HTML, CSS, JavaScript, XML, YAML, and Markdown locally. Formatting is not code execution or a security audit.", "FileCode", listOf("html", "css", "javascript", "xml", "yaml", "markdown"), listOf(NativeDeveloperStudioMode("html", "HTML", "html-beautifier"), NativeDeveloperStudioMode("css", "CSS", "css-beautifier"), NativeDeveloperStudioMode("javascript", "JavaScript", "javascript-formatter"), NativeDeveloperStudioMode("xml", "XML", "xml-beautifier"), NativeDeveloperStudioMode("yaml", "YAML", "yaml-formatter"), NativeDeveloperStudioMode("markdown", "Markdown preview", "markdown-preview"), NativeDeveloperStudioMode("samples", "Sample content", "lorem-ipsum-generator"))),
        NativeDeveloperStudioSpec("http-api-studio", "http-status-lookup", "http-api-studio", "HTTP & API Studio", "Look up HTTP status codes, inspect query strings and content types, and draft header/security references locally.", "Network", listOf("http", "api", "status", "418", "headers", "query", "mime", "cors", "csp"), listOf(NativeDeveloperStudioMode("status", "Status codes", "http-status-lookup"), NativeDeveloperStudioMode("headers", "Headers", "developer-http-header-builder"), NativeDeveloperStudioMode("query", "Query string", "query-string-parser"), NativeDeveloperStudioMode("mime", "MIME types", "developer-content-type-lookup"), NativeDeveloperStudioMode("cors", "CORS", "developer-cors-header-helper"), NativeDeveloperStudioMode("csp", "CSP", "developer-csp-header-generator"), NativeDeveloperStudioMode("cookies", "Cookies", "developer-cookie-parser"), NativeDeveloperStudioMode("user-agent", "User-Agent", "user-agent-parser"))),
        NativeDeveloperStudioSpec("devops-studio", "developer-gitignore-generator", "devops-studio", "DevOps Config Studio", "Generate copy-ready project config, container files, starter docs, API schemas, and release metadata with editable presets.", "Container", listOf("devops", "docker", "compose", "nginx", "gitignore", "openapi", "graphql", "readme", "semver"), listOf(NativeDeveloperStudioMode("gitignore", ".gitignore", "developer-gitignore-generator"), NativeDeveloperStudioMode("dockerfile", "Dockerfile", "developer-dockerfile-helper"), NativeDeveloperStudioMode("compose", "Compose", "developer-docker-compose-generator"), NativeDeveloperStudioMode("nginx", "Nginx", "developer-nginx-config-generator"), NativeDeveloperStudioMode("editorconfig", "EditorConfig", "developer-editorconfig-generator"), NativeDeveloperStudioMode("env", ".env example", "developer-environment-variable-generator"), NativeDeveloperStudioMode("openapi", "OpenAPI", "developer-openapi-example-generator"), NativeDeveloperStudioMode("graphql", "GraphQL", "developer-graphql-query-builder"), NativeDeveloperStudioMode("license", "License", "developer-license-generator"), NativeDeveloperStudioMode("readme", "README", "developer-readme-generator"), NativeDeveloperStudioMode("commit", "Commit message", "developer-commit-message-helper"), NativeDeveloperStudioMode("branch", "Branch name", "developer-branch-name-generator"), NativeDeveloperStudioMode("changelog", "Changelog", "developer-changelog-generator"), NativeDeveloperStudioMode("semver", "Semver", "developer-semantic-version-calculator"), NativeDeveloperStudioMode("mock", "API / webhook fixtures", "developer-api-mock-response-generator"))),
        NativeDeveloperStudioSpec("diff-inspect-studio", "json-diff", "diff-inspect-studio", "Diff & Inspect Studio", "Compare text, JSON, and YAML; inspect structure; preview data; and compose bounded deterministic transforms into a per-step-audited local recipe.", "GitCompare", listOf("diff", "compare", "inspect", "structure", "preview", "recipe", "pipeline", "workflow"), listOf(NativeDeveloperStudioMode("text-diff", "Text diff", "text-diff"), NativeDeveloperStudioMode("json-diff", "JSON diff", "json-diff"), NativeDeveloperStudioMode("yaml-diff", "YAML diff", "yaml-diff"), NativeDeveloperStudioMode("inspect", "Structure inspector", "json-inspector"), NativeDeveloperStudioMode("preview", "Preview", "markdown-preview"), NativeDeveloperStudioMode("test", "JSON tester", "json-tester"), NativeDeveloperStudioMode("recipe", "Recipe pipeline", "developer-recipe-runner"))),
        NativeDeveloperStudioSpec("artboard-studio", "javascript-formatter", "artboard-studio", "Artboard Studio", "Preview 3D worlds and open projects created in Artboard Studio.", "Box", listOf("artboard", "3d", "game", "scene", "model"), listOf(NativeDeveloperStudioMode("workspace", "Workspace", "artboard-studio"))),
        NativeDeveloperStudioSpec("ux-ui-studio", "javascript-formatter", "ux-ui-studio", "UX/UI Studio", "Design mobile interfaces and desktop websites with exact layer geometry, typography, spacing, colors, searchable icon identifiers, and PDF/JSON AI handoff.", "PanelsTopLeft", listOf("ux", "ui", "design", "wireframe", "mobile", "desktop", "components", "icons", "typography", "spacing", "tokens", "PDF", "AI prompt"), listOf(
            NativeDeveloperStudioMode("workspace", "Workspace", "ux-ui-studio"),
            NativeDeveloperStudioMode("components", "Components", "ux-ui-components"),
            NativeDeveloperStudioMode("icons", "Icon library", "ux-ui-icons"),
            NativeDeveloperStudioMode("tokens", "Design tokens", "ux-ui-tokens"),
            NativeDeveloperStudioMode("presets", "Starter layouts", "ux-ui-presets"))),
    )

    fun forToolId(id: String): NativeDeveloperStudioSpec? = specs.firstOrNull { it.id == id || it.slug == id }

    /** Route a historical tool into its native parent Studio without changing the legacy tool itself. */
    fun forLegacySlug(rawSlug: String): NativeDeveloperStudioSpec {
        val slug = rawSlug.lowercase().removePrefix("developer-")
        fun starts(vararg prefixes: String) = prefixes.any { slug == it || slug.startsWith("$it-") }
        if (slug in setOf("yaml-diff", "text-diff", "csv-diff") || Regex("^(yaml|text|csv|xml|html|css|sql|base64|url|hex|binary|ascii|unicode|uuid|jwt|regex)-diff$").matches(slug)) return specs[11]
        if (starts("jwt")) return specs[1]
        if (starts("regex")) return specs[2]
        if (starts("hash", "md5", "file-hash", "sha1", "sha256", "sha384", "sha512") || Regex("^sha(1|256|384|512)-hash$").matches(slug)) return specs[3]
        if (starts("query-string", "url-query", "cookie", "cors", "csp", "ip-header", "status-code", "user-agent", "content-type", "mime", "http")) return specs[9]
        if (starts("base64", "url", "uri", "hex", "binary", "ascii", "unicode", "data-uri") || slug in setOf("json-decoder", "json-encoder", "html-decoder", "html-encoder")) return specs[4]
        if (starts("cron", "unix-timestamp", "timestamp", "epoch")) return specs[5]
        if (starts("uuid")) return specs[6]
        if (starts("sql")) return specs[7]
        if (starts("csv", "json", "dummy-json")) return specs[0]
        if (starts("html", "css", "javascript", "typescript", "xml", "svg", "yaml", "markdown", "lorem-ipsum")) return specs[8]
        if (starts("gitignore", "git", "docker", "dockerfile", "kubernetes", "nginx", "openapi", "graphql", "license", "readme", "editorconfig", "environment-variable", "semantic-version", "branch-name", "commit-message", "changelog", "webhook", "api-mock")) return specs[10]
        return specs[11]
    }

    /** Resolve an old tool slug to the matching visible mode inside its canonical Studio. */
    fun modeForLegacySlug(studio: NativeDeveloperStudioSpec, rawSlug: String): String {
        val slug = rawSlug.lowercase().removePrefix("developer-")
        val selected = when (studio.id) {
            "json-studio" -> when {
                slug.startsWith("csv-") -> "csv"
                slug.contains("diff") -> "diff"
                slug.contains("path") || slug.contains("query") -> "path"
                slug.contains("inspector") || slug.contains("parser") || slug.contains("tree") || slug.contains("preview") -> "tree"
                slug.contains("schema") -> "schema"
                slug.contains("to-csv") -> "convert"
                slug.contains("csv") -> "csv"
                slug.contains("validator") || slug.contains("tester") -> "validate"
                slug.contains("minifier") -> "minify"
                else -> "format"
            }
            "jwt-studio" -> when {
                slug.contains("expiration") || slug.contains("expiry") || slug.contains("exp-check") -> "expiration"
                slug.contains("payload") || slug.contains("builder") -> "payload"
                slug.contains("inspector") || slug.contains("claims") -> "claims"
                else -> "decode"
            }
            "regex-studio" -> when {
                slug.contains("replace") -> "replace"
                slug.contains("explain") -> "explain"
                else -> "match"
            }
            "hash-studio" -> when {
                slug.contains("file-hash") || slug.contains("file-hasher") -> "file"
                slug.contains("compare") -> "compare"
                else -> "hash"
            }
            "encoding-studio" -> when {
                slug.contains("data-uri") -> "data-uri"
                slug.contains("hex") -> "hex"
                slug.contains("binary") -> "binary"
                slug.contains("ascii") -> "ascii"
                slug.contains("unicode") -> "unicode"
                slug.startsWith("html-") -> "html"
                slug.contains("base64") || slug in setOf("json-decoder", "json-encoder") -> "base64"
                else -> "url"
            }
            "time-cron-studio" -> when {
                slug.contains("timestamp") || slug.contains("epoch") -> "timestamp"
                slug.contains("generator") || slug.contains("preset") -> "presets"
                slug.contains("explain") -> "explain"
                else -> "next-runs"
            }
            "uuid-studio" -> if (slug.contains("validator") || slug.contains("tester")) "validate" else "generate"
            "sql-studio" -> when {
                slug.contains("query-builder") -> "query"
                slug.contains("schema-generator") -> "schema"
                slug.contains("minifier") -> "minify"
                slug.contains("parser") || slug.contains("validator") || slug.contains("tester") -> "parse"
                else -> "format"
            }
            "markup-studio" -> when {
                slug.startsWith("css-") -> "css"
                slug.startsWith("javascript-") || slug.startsWith("typescript-") -> "javascript"
                slug.startsWith("xml-") || slug.startsWith("svg-") -> "xml"
                slug.startsWith("yaml-") -> "yaml"
                slug.startsWith("lorem-ipsum") -> "samples"
                slug.startsWith("markdown") -> "markdown"
                else -> "html"
            }
            "http-api-studio" -> when {
                slug.contains("query") -> "query"
                slug.contains("mime") || slug.contains("content-type") -> "mime"
                slug.contains("cors") -> "cors"
                slug.contains("csp") -> "csp"
                slug.contains("cookie") -> "cookies"
                slug.contains("user-agent") -> "user-agent"
                slug.contains("header") -> "headers"
                else -> "status"
            }
            "devops-studio" -> when {
                slug.contains("dockerfile") -> "dockerfile"
                slug.contains("docker-compose") || slug.contains("compose") -> "compose"
                slug.contains("nginx") -> "nginx"
                slug.contains("editorconfig") -> "editorconfig"
                slug.contains("environment") || slug.contains(".env") -> "env"
                slug.contains("openapi") -> "openapi"
                slug.contains("graphql") -> "graphql"
                slug.contains("license") -> "license"
                slug.contains("readme") -> "readme"
                slug.contains("commit") -> "commit"
                slug.contains("branch") -> "branch"
                slug.contains("changelog") -> "changelog"
                slug.contains("semantic-version") || slug.contains("semver") -> "semver"
                slug.contains("api-mock") || slug.contains("webhook") -> "mock"
                else -> "gitignore"
            }
            "diff-inspect-studio" -> when {
                slug.startsWith("json-") -> if (slug.contains("diff")) "json-diff" else if (Regex("(inspector|parser|preview|tester|explainer)").containsMatchIn(slug)) "inspect" else "text-diff"
                slug.startsWith("yaml-") -> "yaml-diff"
                slug.startsWith("markdown") -> "preview"
                slug.contains("inspector") || slug.contains("parser") || slug.contains("tester") -> "inspect"
                else -> "text-diff"
            }
            else -> studio.modes.firstOrNull()?.key.orEmpty()
        }
        return selected.takeIf { key -> studio.modes.any { it.key == key } } ?: studio.modes.firstOrNull()?.key.orEmpty()
    }

    fun tools(catalog: Catalog): List<ToolRecord> = specs.mapNotNull { spec ->
        val source = (catalog.tools + catalog.relatedReferenceTools).firstOrNull { it.id == spec.sourceId } ?: return@mapNotNull null
        val firstOp = spec.modes.firstOrNull()?.op ?: source.engine.extras["op"].orEmpty()
        source.copy(id = spec.id, slug = spec.slug, name = spec.name, description = NativeCopy.text(spec.description), category = "developer",
            keywords = (source.keywords + spec.keywords + "studio" + "offline" + "privacy").distinct(),
            tags = (source.tags + "developer-studio" + spec.id).distinct(), icon = spec.icon,
            popularity = 1_000_000 - specs.indexOf(spec), featured = true, clientSide = true, requiresBackend = false, requiresAuth = false,
            related = specs.filterNot { it.id == spec.id }.map { it.id }, engine = source.engine.copy(type = "developer", extras = source.engine.extras + ("op" to firstOp)))
    }
}

fun Catalog.developerStudioTools(): List<ToolRecord> = NativeDeveloperStudios.tools(this)
fun Catalog.developerStudioForId(toolId: String): ToolRecord? = NativeDeveloperStudios.tools(this).firstOrNull { it.id == toolId || it.slug == toolId }


/** Returns the native Studio entry point for a historical Developer tool; virtual Studios have no parent. */
fun Catalog.developerStudioForLegacyTool(tool: ToolRecord): ToolRecord? {
    if (tool.category != "developer" || "developer-studio" in tool.tags) return null
    val target = NativeDeveloperStudios.forLegacySlug(tool.slug)
    return developerStudioTools().firstOrNull { it.id == target.id }
}
