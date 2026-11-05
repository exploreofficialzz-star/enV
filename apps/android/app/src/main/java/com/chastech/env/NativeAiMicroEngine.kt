package com.chastech.env

data class NativeAiMicroField(
    val name: String,
    val label: String,
    val defaultValue: String,
    val multiline: Boolean = false,
)

object NativeAiMicroEngine {
    private val operations = mapOf(
        "ai-meeting-agenda-generator" to "agenda",
        "blog-outline-generator" to "blog-outline",
        "call-to-action-generator" to "cta",
        "expand-helper" to "expand",
        "faq-generator" to "faq",
        "feature-benefit-generator" to "feature-benefit",
        "meeting-action-items" to "actions",
        "product-title-generator" to "product-title",
        "pros-cons-generator" to "pros-cons",
        "shorten-helper" to "shorten",
        "tiktok-caption-helper" to "tt-caption",
        "youtube-description-helper" to "yt-desc",
        "youtube-title-helper" to "yt-title",
    )

    fun supports(toolId: String): Boolean = operations.containsKey(toolId)
    fun operationFor(toolId: String): String? = operations[toolId]

    fun fields(toolId: String): List<NativeAiMicroField> = when (operationFor(toolId)) {
        "blog-outline" -> listOf(topic(), audience(), NativeAiMicroField("goal", "Goal", "Help the reader understand the topic and take a useful next step"), NativeAiMicroField("angle", "Editorial angle", "Explain the practical problem before presenting the solution", multiline = true), NativeAiMicroField("keyPoints", "Verified facts / points to include", "", multiline = true), NativeAiMicroField("cta", "Reader next step", ""))
        "cta" -> listOf(topic(), audience(), NativeAiMicroField("action", "Action to ask for", "Learn more"), NativeAiMicroField("benefit", "Specific benefit (optional)", ""), NativeAiMicroField("tone", "Tone", "natural"))
        "expand" -> listOf(NativeAiMicroField("text", "Text / notes to expand", "", multiline = true), audience(), NativeAiMicroField("context", "Why does it matter?", "", multiline = true), NativeAiMicroField("example", "Real example / supporting detail", "", multiline = true), NativeAiMicroField("nextStep", "Next step for the reader", ""))
        "shorten" -> listOf(NativeAiMicroField("text", "Text", "We are launching a new product that helps people create useful content faster.", multiline = true), NativeAiMicroField("count", "Target words", "60"))
        "faq" -> listOf(topic(), audience(), NativeAiMicroField("points", "Questions (one per line)", "What it is\nWho it is for\nHow it works\nPricing or access", multiline = true), NativeAiMicroField("answers", "Verified answers (Question | Answer)", "", multiline = true))
        "feature-benefit" -> listOf(topic(), audience(), NativeAiMicroField("benefit", "Features (one per line)", "Shared workspace\nFast search\nVersion history", multiline = true), NativeAiMicroField("outcomes", "Actual customer outcomes (same order)", "", multiline = true))
        "agenda" -> listOf(NativeAiMicroField("goal", "Meeting goal", "Plan the next launch"), NativeAiMicroField("duration", "Meeting duration (minutes)", "30"), NativeAiMicroField("topics", "Topics", "Progress\nBlockers\nDecisions\nNext steps", multiline = true))
        "actions" -> listOf(NativeAiMicroField("notes", "Action items (Owner | Action | Due date | Priority)", "John | Finish landing page | Friday | High\nAda | Confirm pricing | Thursday | Medium\nTeam | Test checkout | Friday | High", multiline = true))
        "product-title" -> listOf(topic(), NativeAiMicroField("benefit", "Specific product benefit (optional)", ""), NativeAiMicroField("audience", "Target customer (optional)", ""), NativeAiMicroField("keyword", "Primary keyword (optional)", ""))
        "pros-cons" -> listOf(NativeAiMicroField("option", "Option / decision", "Launch now vs wait for more features"), NativeAiMicroField("upsides", "Observed upsides (one per line)", "", multiline = true), NativeAiMicroField("risks", "Known risks / costs (one per line)", "", multiline = true), NativeAiMicroField("criteria", "Decision criteria (one per line)", "", multiline = true))
        "tt-caption" -> listOf(topic(), audience(), NativeAiMicroField("tone", "Tone", "natural"), NativeAiMicroField("hook", "Opening angle", "A useful reminder"), NativeAiMicroField("cta", "Call to action", "What would you add?"), NativeAiMicroField("count", "Options", "5"))
        "yt-desc" -> listOf(topic(), audience(), NativeAiMicroField("tone", "Tone", "natural"), NativeAiMicroField("points", "Video points (one per line)", "", multiline = true), NativeAiMicroField("chapters", "Chapters / timestamps (optional)", "", multiline = true), NativeAiMicroField("links", "Links / resources (optional)", "", multiline = true), NativeAiMicroField("cta", "Viewer next step", ""))
        "yt-title" -> listOf(topic(), audience(), NativeAiMicroField("keyword", "Primary keyword (optional)", ""), NativeAiMicroField("angle", "Video angle", "a practical guide"), NativeAiMicroField("count", "Options", "8"))
        else -> emptyList()
    }

    fun initialValues(toolId: String): Map<String, String> = fields(toolId).associate { it.name to it.defaultValue }

    fun generate(toolId: String, values: Map<String, String>): String {
        val operation = operationFor(toolId) ?: throw IllegalArgumentException("Unsupported AI micro-tool: $toolId")
        val topic = clean(values["topic"], "your topic")
        val audience = clean(values["audience"], "your audience")
        val style = tonePhrase(clean(values["tone"], "natural"))
        val countRaw = values["count"]?.trim().orEmpty()
        val countNumber = countRaw.toDoubleOrNull() ?: 5.0
        val count = if (countNumber.isFinite()) countNumber.toInt().coerceIn(1, 20) else 5

        return when (operation) {
            "title", "yt-title" -> {
                val keyword = clean(values["keyword"], topic)
                val angle = clean(values["angle"], "a practical guide")
                val titles = listOf("$keyword: $angle for $audience", "How $audience can get started with $topic", "$topic, explained: $angle", "What to know before you try $topic", "The $topic checklist for $audience", "Common $topic mistakes and how to avoid them", "A step-by-step guide to $topic", "$topic: key ideas, examples and next steps").map { boundedYouTubeTitle(it) }.distinct()
                numbered(titles, count)
            }
            "tt-caption" -> numbered(listOf(
                clean(values["hook"], "A useful reminder") + ": $topic. " + clean(values["cta"], "What would you add?"),
                "A practical note for $audience: $topic is worth exploring one step at a time.",
                "Save this if $topic is on your list. " + clean(values["cta"], "What would you add?"),
                "One idea to take away about $topic: start small, then build on what works.",
                "For $audience: here is a fresh way to think about $topic. " + clean(values["cta"], "What would you add?"),
                "Quick breakdown: $topic. Keep what works for you and test the rest.",
                "What is one thing you would change about $topic? " + clean(values["cta"], "What would you add?"),
            ), count)
            "blog-outline" -> {
                val keyPoints = splitLines(values["keyPoints"].orEmpty())
                listOf(
                    "CONTENT BRIEF\nTopic: $topic\nAudience: $audience\nGoal: " + clean(values["goal"], "Help the reader understand the topic and take a useful next step") + "\nEditorial angle: " + clean(values["angle"], "Explain the practical problem before presenting the solution"),
                    "OUTLINE\n1. Opening: name the reader's problem and why it matters\n2. The essentials: define $topic in plain language\n3. The decision: explain the main choices, trade-offs or criteria\n4. Practical walkthrough: arrange the steps in the order a reader should use them\n5. Example or evidence: use a real example, source or supplied detail\n6. Common mistakes: explain what to check before acting\n7. Recap: summarise the useful points and answer the opening question\n8. Next step: " + clean(values["cta"], "[Add one relevant next step for the reader]"),
                    if (keyPoints.isNotEmpty()) "SUPPLIED FACTS / POINTS TO INCLUDE\n" + keyPoints.joinToString("\n") { "• $it" } else "RESEARCH CHECK\nAdd verified facts, examples and sources before making factual claims.",
                    "EDITORIAL CHECK\nKeep each section useful to the stated audience. Remove repeated points and do not present assumptions as evidence.",
                ).joinToString("\n\n")
            }
            "cta" -> {
                val action = clean(values["action"], "Learn more")
                val benefit = values["benefit"]?.trim().orEmpty()
                val promise = if (benefit.isNotEmpty()) " to $benefit" else ""
                val candidates = listOf(action + promise, "Ready to explore $topic? $action.", "Take the next step with $topic: $action.", "See whether $topic fits your needs. $action.", "$audience: make your next move on $topic. $action.")
                numbered(candidates.distinct(), 5) + if (benefit.isEmpty()) "\n\nAdd a specific, supportable benefit before publishing a stronger promise." else ""
            }
            "expand" -> {
                val source = values["text"]?.trim().orEmpty()
                if (source.isEmpty()) "Add the text or notes you want to expand, then generate again."
                else listOf(
                    source,
                    "WHY IT MATTERS\n" + clean(values["context"], "[Add why this matters. Do not publish this placeholder.]"),
                    "WHO IT AFFECTS\nWrite for: " + clean(values["audience"], "[Name the reader or audience.]"),
                    "EXAMPLE / SUPPORTING DETAIL\n" + clean(values["example"], "[Add a real example or remove this section.]"),
                    "NEXT STEP\n" + clean(values["nextStep"], "[Add the action, decision or response needed.]"),
                    "EDITORIAL NOTE\nReplace every bracketed prompt with verified, relevant detail. This local expansion scaffold does not invent supporting facts.",
                ).joinToString("\n\n")
            }
            "faq" -> {
                val questions = splitLines(values["points"].orEmpty())
                if (questions.isEmpty()) "Add one question per line, then generate the FAQ."
                else {
                    val answers = values["answers"].orEmpty().lines().mapNotNull { line ->
                        val separator = line.indexOf("|")
                        if (separator < 1) null else line.substring(0, separator).trim().lowercase() to line.substring(separator + 1).trim()
                    }.filter { it.first.isNotEmpty() && it.second.isNotEmpty() }.toMap()
                    val missing = mutableListOf<String>()
                    val output = questions.map { question ->
                        val answer = answers[question.lowercase()]
                        if (answer.isNullOrBlank()) missing += question
                        "Q: $question\nA: " + (answer ?: "[Add a verified answer before publishing.]")
                    }.joinToString("\n\n")
                    "FAQ: $topic\nAudience: $audience\n\n" + output + if (missing.isNotEmpty()) "\n\nNEEDS AN ANSWER\n" + missing.joinToString("\n") { "• $it" } + "\n\nOnly publish answers confirmed by your product, policy or source material." else ""
                }
            }
            "feature-benefit" -> {
                val features = splitLines(values["benefit"].orEmpty())
                if (features.isEmpty()) "Add one product feature per line."
                else {
                    val outcomes = splitLines(values["outcomes"].orEmpty())
                    "VALUE MAPPING\nProduct / service: $topic\nAudience: $audience\n\n" + features.mapIndexed { index, feature ->
                        "Feature: $feature\nCustomer outcome: " + (outcomes.getOrNull(index) ?: "[Add the specific result this feature creates.]") + "\nEvidence to support the claim: [Add a measured result, user example or verified product detail.]"
                    }.joinToString("\n\n") + if (outcomes.size > features.size) "\n\nNote: extra outcome entries were not matched to a feature and were left out." else ""
                }
            }
            "agenda" -> {
                val points = splitLines(clean(values["topics"], "Progress\nBlockers\nDecisions\nNext steps")).take(100)
                val requested = values["duration"]?.toIntOrNull() ?: 30
                val duration = requested.coerceIn(points.size.coerceAtLeast(1), 600)
                val base = duration / points.size
                val remainder = duration % points.size
                "Meeting goal: " + clean(values["goal"], "Make a clear decision") + "\nPlanned duration: $duration minutes\n\nAGENDA\n" +
                    points.mapIndexed { index, item -> (index + 1).toString() + ". $item — " + (base + if (index < remainder) 1 else 0) + " min" }.joinToString("\n") +
                    "\n\nCLOSE\nConfirm decisions, owners, deadlines and unresolved questions before ending."
            }
            "actions" -> {
                val lines = values["notes"].orEmpty().lines().map { it.trim() }.filter { it.isNotEmpty() }
                if (lines.isEmpty()) "Add one action item per line. Use Owner | Action | Due date | Priority where possible."
                else {
                    val parsed = lines.map { line ->
                        val parts = line.split("|").map { it.trim() }
                        if (parts.size == 1) listOf("[Assign owner]", parts[0], "[Add due date]", "Not set")
                        else listOf(parts.getOrElse(0) { "" }.ifBlank { "[Assign owner]" }, parts.getOrElse(1) { "" }.ifBlank { "[Describe action]" }, parts.getOrElse(2) { "" }.ifBlank { "[Add due date]" }, parts.getOrElse(3) { "Not set" }.ifBlank { "Not set" })
                    }
                    val incomplete = parsed.count { it[0].startsWith("[") || it[1].startsWith("[") || it[2].startsWith("[") }
                    "ACTION REGISTER\n" + parsed.mapIndexed { index, row -> (index + 1).toString() + ". Owner: " + row[0] + " | Action: " + row[1] + " | Due: " + row[2] + " | Priority: " + row[3] }.joinToString("\n") +
                        "\n\nFOLLOW-UP\n" + (if (incomplete > 0) "$incomplete item(s) need an owner, action or due date confirmed." else "Review owners and dates with the team before sharing.") +
                        "\nStatus has not been inferred; update it after the meeting."
                }
            }
            "product-title" -> {
                val benefit = values["benefit"]?.trim().orEmpty()
                val keyword = values["keyword"]?.trim().orEmpty().ifBlank { topic }
                val target = values["audience"]?.trim().orEmpty()
                val suffix = if (target.isNotEmpty()) " for $target" else ""
                numbered(listOf(if (benefit.isNotEmpty()) "$keyword — $benefit" else "$keyword: A practical guide", "The $keyword guide$suffix", "$keyword: Features, uses and key details", "Getting started with $keyword", "A closer look at $keyword", "$keyword: What to know before you choose"), 6)
            }
            "pros-cons" -> {
                val upsides = splitLines(values["upsides"].orEmpty())
                val risks = splitLines(values["risks"].orEmpty())
                val criteria = splitLines(values["criteria"].orEmpty())
                listOf(
                    "DECISION: " + clean(values["option"], "the option being considered"),
                    "UPSIDE TO VERIFY\n" + (if (upsides.isNotEmpty()) upsides.joinToString("\n") { "• $it" } else "• [Add observed advantages or expected benefits.]"),
                    "RISKS / COSTS TO CHECK\n" + (if (risks.isNotEmpty()) risks.joinToString("\n") { "• $it" } else "• [Add known risks, costs or trade-offs.]"),
                    "DECISION CRITERIA\n" + (if (criteria.isNotEmpty()) criteria.joinToString("\n") { "• $it" } else "• What measurable result would make this worthwhile?\n• What is the smallest safe test?\n• What evidence would make you stop or change course?"),
                    "EVIDENCE CHECK\nSeparate measured results from assumptions. Do not treat a blank section as proof that no risk or benefit exists.",
                ).joinToString("\n\n")
            }
            "shorten" -> {
                val text = values["text"]?.trim().orEmpty()
                if (text.isEmpty()) "Add the text you want to shorten."
                else shortenExtractively(text, values["count"]?.toIntOrNull() ?: 60)
            }
            "yt-desc" -> {
                val points = splitList(values["points"].orEmpty())
                val links = splitLines(values["links"].orEmpty())
                val chapters = splitLines(values["chapters"].orEmpty())
                val parts = mutableListOf(
                    topic,
                    "This video covers " + topic + (if (audience.isNotEmpty()) " for $audience" else "") + ". The description uses a $style tone and only relies on the details supplied here.",
                    if (points.isNotEmpty()) "WHAT YOU'LL LEARN\n" + points.joinToString("\n") { "• $it" } else "WHAT YOU'LL LEARN\n[Add the key points covered in the video.]",
                )
                if (chapters.isNotEmpty()) parts += "CHAPTERS\n" + chapters.joinToString("\n")
                if (links.isNotEmpty()) parts += "LINKS / RESOURCES\n" + links.joinToString("\n")
                parts += "NEXT STEP\n" + clean(values["cta"], "[Add one clear viewer action.]")
                parts += "Check every link, chapter time and factual claim before publishing."
                parts.joinToString("\n\n")
            }
            else -> throw IllegalArgumentException("Unsupported AI micro-tool operation: $operation")
        }
    }

    private fun boundedYouTubeTitle(value: String): String {
        val text = value.replace(Regex("\\s+"), " ").trim()
        if (text.length <= 100) return text
        val prefix = text.take(99)
        val boundary = prefix.lastIndexOf(' ')
        return (if (boundary > 45) prefix.take(boundary) else prefix).trim() + "…"
    }

    private fun shortenExtractively(value: String, requestedWords: Int): String {
        val text = value.replace(Regex("\\s+"), " ").trim()
        val target = requestedWords.coerceIn(10, 500)
        if (text.split(Regex("\\s+")).size <= target) return text
        val sentences = text.split(Regex("(?<=[.!?])\\s+")).map { it.trim() }.filter { it.isNotEmpty() }
        if (sentences.size > 1) {
            val selected = mutableListOf<String>()
            var total = 0
            for (sentence in sentences) {
                val words = sentence.split(Regex("\\s+")).size
                if (selected.isNotEmpty() && total + words > target) break
                selected += sentence
                total += words
                if (total >= target) break
            }
            return selected.joinToString(" ").trimEnd(' ', '.', '!', '?', '…') + "…"
        }
        return text.split(Regex("\\s+")).take(target).joinToString(" ") + "…"
    }

    private fun topic() = NativeAiMicroField("topic", "Topic / subject", "AI tools for creators")
    private fun audience() = NativeAiMicroField("audience", "Audience", "creators and small businesses")

    private fun clean(value: String?, fallback: String): String = value?.trim()?.takeIf { it.isNotEmpty() } ?: fallback
    private fun tonePhrase(tone: String): String = when (tone) {
        "professional" -> "clear and professional"
        "bold" -> "confident and direct"
        "playful" -> "light and playful"
        "friendly" -> "warm and friendly"
        else -> "natural and conversational"
    }
    private fun numbered(lines: List<String>, count: Int): String = lines.take(count.coerceIn(1, lines.size)).mapIndexed { index, line -> "${index + 1}. $line" }.joinToString("\n\n")
    private fun splitList(value: String): List<String> = value.split(Regex("[\n,]")).map { it.trim() }.filter { it.isNotEmpty() }
    private fun splitLines(value: String): List<String> = value.split(Regex("\\r?\\n")).map { it.trim() }.filter { it.isNotEmpty() }
}
