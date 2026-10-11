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
        "blog-outline" -> listOf(topic(), audience(), NativeAiMicroField("goal", "Goal", "Educate and give the reader a practical next step"))
        "cta" -> listOf(topic())
        "expand", "shorten" -> listOf(NativeAiMicroField("text", "Text", "We are launching a new product that helps people create useful content faster.", multiline = true))
        "faq" -> listOf(topic(), audience(), NativeAiMicroField("points", "Key points", "What it is\nWho it is for\nHow it works\nPricing or access", multiline = true))
        "feature-benefit" -> listOf(topic(), audience(), NativeAiMicroField("benefit", "Main benefit", "Save time and get started quickly"))
        "agenda" -> listOf(NativeAiMicroField("goal", "Meeting goal", "Plan the next launch"), NativeAiMicroField("topics", "Topics", "Progress\nBlockers\nDecisions\nNext steps", multiline = true))
        "actions" -> listOf(NativeAiMicroField("notes", "Rough notes", "John — finish landing page by Friday\nAda — confirm pricing\nTeam — test checkout", multiline = true))
        "product-title" -> listOf(topic(), NativeAiMicroField("benefit", "Main benefit", "Save time and get started quickly"))
        "pros-cons" -> listOf(topic(), NativeAiMicroField("option", "Option / decision", "Launch now vs wait for more features"))
        "tt-caption" -> listOf(topic(), audience(), NativeAiMicroField("count", "Options", "5"))
        "yt-desc" -> listOf(topic(), audience(), NativeAiMicroField("tone", "Tone", "natural"), NativeAiMicroField("points", "Key points", "Problem\nSolution\nPractical examples\nCall to action", multiline = true))
        "yt-title" -> listOf(topic(), audience(), NativeAiMicroField("count", "Options", "8"))
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
            "title", "yt-title" -> numbered(listOf(
                "$topic: What $audience Should Know",
                "How to Get Better Results With $topic",
                "The Simple Guide to $topic",
                "I Tried $topic — Here’s What I Learned",
                "$topic Explained Without the Jargon",
                "5 Things $audience Should Know About $topic",
                "Before You Start With $topic, Read This",
                "A Practical $topic Guide for $audience",
            ), count)
            "tt-caption" -> numbered(listOf(
                "$topic made simple. Save this for later.",
                "If you're into $topic, this one is for you.",
                "A quick reminder for $audience: you don't need to overcomplicate $topic.",
                "Learning $topic one step at a time. What would you add?",
                "Here's the part about $topic people usually skip.",
                "Small steps, better results. That's the goal with $topic.",
                "Trying to understand $topic? Start here.",
            ), count)
            "blog-outline" -> "Title: $topic\nAudience: $audience\nGoal: ${clean(values["goal"], "Educate the reader")}\n\nOutline\n1. Introduction — the problem and why it matters\n2. What $topic means\n3. The key ideas $audience should understand\n4. Practical steps or examples\n5. Common mistakes to avoid\n6. Checklist / next steps\n7. Conclusion and CTA"
            "cta" -> numbered(listOf("Get started with $topic", "Try $topic today", "See how $topic can help", "Learn more about $topic", "Start creating with $topic"), 5)
            "expand" -> "${clean(values["text"], "Your notes")}.\n\nKey context: explain why this matters, who it affects, and what should happen next. Add one practical example and finish with a clear next step."
            "faq" -> splitList(clean(values["points"], "What it is\nHow it works")).joinToString("\n\n") { point -> "Q: $point about $topic?\nA: Explain ${point.lowercase()} in a concise, factual way for $audience." }
            "feature-benefit" -> splitList(clean(values["benefit"], "Saves time")).joinToString("\n\n") { feature -> "Feature: $feature\nBenefit: Helps $audience get a clearer result with less friction." }
            "agenda" -> {
                val topics = splitList(clean(values["topics"], "Progress\nBlockers\nDecisions\nNext steps"))
                "Meeting goal: ${clean(values["goal"], "Make a clear decision")}\n\nAgenda\n${topics.mapIndexed { i, item -> "${i + 1}. $item" }.joinToString("\n")}\n\nClose with owners, deadlines, and unresolved questions."
            }
            "actions" -> {
                val notes = clean(values["notes"], "Person — task — deadline").lines().map { it.trim() }.filter { it.isNotEmpty() }
                "Action items\n${notes.mapIndexed { i, note -> "${i + 1}. $note" }.joinToString("\n")}\n\nBefore sharing, confirm each owner and deadline."
            }
            "product-title" -> {
                val benefit = clean(values["benefit"], "Simple and practical")
                numbered(listOf("$topic — $benefit", "$topic: ${clean(values["benefit"], "A better way to get started")}", "The $topic Starter Guide", "$topic Made Simple", "$topic Toolkit"), 5)
            }
            "pros-cons" -> "Decision worksheet: ${clean(values["option"], "your option")}\n\nPros\n• Potential upside: $topic may help achieve the stated goal.\n• Can be tested with a small, measurable experiment.\n• Creates information for the next decision.\n\nCons / risks\n• Requires time, money, or attention.\n• Results may differ from assumptions.\n• A larger commitment may reduce flexibility.\n\nQuestions to verify\n• What is the smallest useful test?\n• What metric decides whether to continue?\n• What would make you stop or change direction?"
            "shorten" -> {
                val text = clean(values["text"], "Your original text")
                val words = text.split(Regex("\\s+")).filter { it.isNotEmpty() }
                if (words.size > 28) words.take(28).joinToString(" ") + "…" else text
            }
            "yt-desc" -> {
                val points = splitList(clean(values["points"], "Key points and practical examples"))
                "$topic\n\nIn this video, we break down $topic for $audience in a $style way.\n\nWhat you'll cover:\n${points.joinToString("\n") { "• $it" }}\n\nIf you found this useful, save it for later and share it with someone working on the same goal."
            }
            else -> throw IllegalArgumentException("Unsupported AI micro-tool operation: $operation")
        }
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
}
