package com.chastech.env

import com.chastech.env.data.ToolRecord
import org.json.JSONObject

object NativeAiEngine {
    private val captionTools = setOf("instagram-caption-generator", "tiktok-caption-generator", "x-caption-generator", "youtube-caption-generator", "linkedin-caption-generator", "facebook-caption-generator", "caption-generator")
    private val promptTools = setOf("prompt-generator")
    private val bioTools = setOf("bio-generator")
    private val titleTools = setOf("youtube-title-generator", "tiktok-title-generator", "instagram-title-generator", "podcast-title-generator", "title-generator")
    private val exactTasks = mapOf(
        "regex-tester" to "developer.regex.explain",
        "sql-formatter" to "developer.sql.explain",
        "json-validator" to "developer.json.explain",
        "alt-text-generator" to "image.alt.generate",
        "video-audio-extractor" to "video.transcript.generate",
    )

    fun supports(tool: ToolRecord): Boolean = captionTools.contains(tool.id) || promptTools.contains(tool.id) || bioTools.contains(tool.id) || titleTools.contains(tool.id) || exactTasks.containsKey(tool.id)

    fun isLocalCaption(toolId: String): Boolean = captionTools.contains(toolId)
    fun isLocalPrompt(toolId: String): Boolean = promptTools.contains(toolId)
    fun isLocalBio(toolId: String): Boolean = bioTools.contains(toolId)
    fun isLocalTitle(toolId: String): Boolean = toolId == "title-generator"

    fun localCaption(values: Map<String, Any?>): String {
        val topic = values["topic"]?.toString()?.trim().takeUnless { it.isNullOrEmpty() } ?: "your topic"
        val audience = values["audience"]?.toString()?.trim().takeUnless { it.isNullOrEmpty() } ?: "your audience"
        val count = (values["count"] as? Number)?.toInt()?.coerceIn(1, 15) ?: 5
        val lines = listOf(
            "$topic made simple. Save this for later.",
            "If you're into $topic, this one is for you.",
            "A quick reminder for $audience: you don't need to overcomplicate $topic.",
            "Learning $topic one step at a time. What would you add?",
            "Here's the part about $topic people usually skip.",
            "Small steps, better results. That's the goal with $topic.",
            "Trying to understand $topic? Start here."
        )
        return lines.take(count).mapIndexed { index, line -> "${index + 1}. $line" }.joinToString("\n\n")
    }

    fun localPrompt(values: Map<String, Any?>): String {
        val task = values["task"]?.toString()?.trim().takeUnless { it.isNullOrEmpty() } ?: "Complete the requested task"
        val audience = values["audience"]?.toString()?.trim().takeUnless { it.isNullOrEmpty() } ?: "your audience"
        val tone = when (values["tone"]?.toString()) { "professional" -> "clear and professional"; "bold" -> "confident and direct"; "playful" -> "light and playful"; "friendly" -> "warm and friendly"; else -> "natural and conversational" }
        return "ROLE\nYou are a helpful specialist supporting $audience.\n\nTASK\n$task.\n\nSTYLE\nUse a $tone style.\n\nCONTEXT\nFocus on practical, accurate output. Avoid unnecessary filler and clearly state assumptions.\n\nOUTPUT\nReturn a useful, structured answer with headings or bullets where they improve readability.\n\nCHECK\nBefore answering, verify that the response directly addresses the task and is suitable for $audience."
    }

    fun localBio(values: Map<String, Any?>): String {
        val role = values["role"]?.toString()?.trim().takeUnless { it.isNullOrEmpty() } ?: "creator"
        val audience = values["audience"]?.toString()?.trim().takeUnless { it.isNullOrEmpty() } ?: "your audience"
        val topic = values["topic"]?.toString()?.trim().takeUnless { it.isNullOrEmpty() } ?: "your topic"
        val count = (values["count"] as? Number)?.toInt()?.coerceIn(1, 5) ?: 5
        return listOf("$role | Helping $audience learn, create & grow.", "$role • $topic • Building in public.", "Creating around $topic. Sharing what I learn along the way.", "$role | Making $topic easier to understand.", "$role focused on practical ideas for $audience.").take(count).mapIndexed { index, line -> "${index + 1}. $line" }.joinToString("\n\n")
    }

    fun localTitle(values: Map<String, Any?>): String {
        val topic = values["topic"]?.toString()?.trim().takeUnless { it.isNullOrEmpty() } ?: "your topic"
        val audience = values["audience"]?.toString()?.trim().takeUnless { it.isNullOrEmpty() } ?: "your audience"
        val count = (values["count"] as? Number)?.toInt()?.coerceIn(1, 8) ?: 8
        val lines = listOf("$topic: What $audience Should Know", "How to Get Better Results With $topic", "The Simple Guide to $topic", "I Tried $topic — Here’s What I Learned", "$topic Explained Without the Jargon", "5 Things $audience Should Know About $topic", "Before You Start With $topic, Read This", "A Practical $topic Guide for $audience")
        return lines.take(count).mapIndexed { index, line -> "${index + 1}. $line" }.joinToString("\n\n")
    }

    fun taskFor(toolId: String): String? = when {
        captionTools.contains(toolId) -> "creator.caption.generate"
        promptTools.contains(toolId) -> "local.prompt"
        bioTools.contains(toolId) -> "local.bio"
        titleTools.contains(toolId) -> "creator.title.generate"
        else -> exactTasks[toolId]
    }

    fun fixedPlatform(toolId: String): String = when (toolId) {
        "instagram-caption-generator", "instagram-title-generator" -> "instagram"
        "tiktok-caption-generator", "tiktok-title-generator" -> "tiktok"
        "youtube-caption-generator", "youtube-title-generator" -> "youtube"
        "linkedin-caption-generator" -> "linkedin"
        "facebook-caption-generator" -> "facebook"
        "x-caption-generator" -> "x"
        "podcast-title-generator" -> "podcast"
        else -> "generic"
    }

    fun buildInput(tool: ToolRecord, values: Map<String, Any?>): JSONObject {
        val id = tool.id
        return when (taskFor(id)) {
            "creator.caption.generate" -> JSONObject().apply {
                put("topic", values["topic"] ?: "")
                put("tone", values["tone"] ?: "friendly")
                put("language", values["language"] ?: "en")
                put("variants", (values["variants"] as? Number)?.toInt() ?: 3)
                put("includeHashtags", values["includeHashtags"] as? Boolean ?: true)
                put("platform", fixedPlatform(id))
            }
            "creator.title.generate" -> JSONObject().apply {
                put("topic", values["topic"] ?: "")
                put("tone", values["tone"] ?: "friendly")
                put("language", values["language"] ?: "en")
                put("variants", (values["variants"] as? Number)?.toInt() ?: 5)
                put("platform", fixedPlatform(id))
            }
            "developer.regex.explain" -> JSONObject().apply {
                put("pattern", values["pattern"] ?: "")
                put("flags", values["flags"] ?: "")
                put("sampleText", values["sampleText"] ?: "")
            }
            "developer.sql.explain" -> JSONObject().apply {
                put("sql", values["sql"] ?: "")
                put("dialect", values["dialect"] ?: "generic")
            }
            "developer.json.explain" -> JSONObject().apply {
                put("json", values["json"] ?: "")
                put("goal", values["goal"] ?: "describe")
            }
            "image.alt.generate" -> JSONObject().apply {
                val file = values["image"] as JSONObject
                put("imageBase64", file.optString("base64"))
                put("mimeType", file.optString("mimeType"))
                put("context", values["context"] ?: "")
                put("style", values["style"] ?: "concise")
                put("language", values["language"] ?: "en")
            }
            "video.transcript.generate" -> JSONObject().apply {
                val file = values["audio"] as JSONObject
                put("audioBase64", file.optString("base64"))
                put("mimeType", file.optString("mimeType"))
                put("filename", file.optString("filename"))
                if (!values["language"].toString().isBlank()) put("language", values["language"])
            }
            else -> error("Unsupported native AI tool: $id")
        }
    }

    fun formatResult(taskId: String, result: JSONObject): String = when (taskId) {
        "creator.caption.generate" -> {
            val variants = result.optJSONArray("variants") ?: return "No captions were returned."
            buildString {
                for (i in 0 until variants.length()) {
                    val item = variants.optJSONObject(i) ?: continue
                    append(i + 1).append(". ").append(item.optString("caption"))
                    val hashtags = item.optJSONArray("hashtags")
                    if (hashtags != null && hashtags.length() > 0) {
                        append("\n").append((0 until hashtags.length()).joinToString(" ") { hashtags.optString(it) })
                    }
                    append("\n\n")
                }
            }.trim()
        }
        "creator.title.generate" -> NativeAiClient.toList(result, "titles").mapIndexed { i, v -> "${i + 1}. $v" }.joinToString("\n\n")
        "developer.regex.explain" -> buildString {
            appendLine(result.optString("summary"))
            result.optJSONArray("parts")?.let { array -> if (array.length() > 0) { appendLine(); appendLine("Parts"); for (i in 0 until array.length()) { val p=array.optJSONObject(i); appendLine("• ${p?.optString("token")}: ${p?.optString("meaning")}") } } }
            result.optJSONArray("pitfalls")?.let { array -> if (array.length() > 0) { appendLine(); appendLine("Pitfalls"); for (i in 0 until array.length()) appendLine("• ${array.optString(i)}") } }
        }.trim()
        "developer.sql.explain" -> buildString {
            appendLine(result.optString("summary")); result.optJSONArray("steps")?.let { array -> appendLine(); appendLine("Steps"); for (i in 0 until array.length()) { val p=array.optJSONObject(i); appendLine("• ${p?.optString("clause")}: ${p?.optString("explanation")}") } }
            result.optJSONArray("warnings")?.let { array -> if (array.length() > 0) { appendLine(); appendLine("Warnings"); for (i in 0 until array.length()) appendLine("• ${array.optString(i)}") } }
            result.optJSONArray("performanceNotes")?.let { array -> if (array.length() > 0) { appendLine(); appendLine("Performance"); for (i in 0 until array.length()) appendLine("• ${array.optString(i)}") } }
        }.trim()
        "developer.json.explain" -> buildString {
            appendLine(result.optString("summary")); result.optJSONArray("structure")?.let { array -> appendLine(); appendLine("Structure"); for (i in 0 until array.length()) { val p=array.optJSONObject(i); appendLine("• ${p?.optString("path")}: ${p?.optString("type")} — ${p?.optString("note")}") } }
            result.optJSONArray("issues")?.let { array -> if (array.length() > 0) { appendLine(); appendLine("Issues"); for (i in 0 until array.length()) appendLine("• ${array.optString(i)}") } }
        }.trim()
        "image.alt.generate" -> buildString { appendLine(result.optString("altText")); if (result.optString("longDescription").isNotBlank()) { appendLine(); appendLine(result.optString("longDescription")) }; if (result.optBoolean("containsText")) { appendLine(); appendLine("Text in image: ${result.optString("textInImage")}") } }.trim()
        "video.transcript.generate" -> buildString { append(result.optString("text")); val segments=result.optJSONArray("segments"); if (segments != null && segments.length()>0) { appendLine(); appendLine(); appendLine("Timestamped segments"); for (i in 0 until minOf(segments.length(), 1000)) { val s=segments.optJSONObject(i) ?: continue; appendLine("${formatTime(s.optDouble("start"))} → ${formatTime(s.optDouble("end"))}: ${s.optString("text")}") } } }.trim()
        else -> result.toString()
    }

    private fun formatTime(seconds: Double): String {
        val totalMs = (seconds.coerceAtLeast(0.0) * 1000).toLong(); val h=totalMs/3_600_000; val m=(totalMs%3_600_000)/60_000; val s=(totalMs%60_000)/1000; val ms=totalMs%1000
        return "%02d:%02d:%02d.%03d".format(h,m,s,ms)
    }
}
