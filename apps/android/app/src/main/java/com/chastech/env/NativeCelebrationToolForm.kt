package com.chastech.env

import android.net.Uri
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import java.time.Duration
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.ResolverStyle
import java.util.Locale
import kotlinx.coroutines.delay

internal object NativeCelebrationEngine {
    data class Parsed(val occasion: String, val experience: String)
    data class Result(val text: String, val html: String, val checks: List<String>)
    data class Countdown(val days: Long, val hours: Long, val minutes: Long, val seconds: Long, val complete: Boolean)

    private val occasions = setOf("birthday", "anniversary", "graduation", "valentine", "christmas", "new-year", "congratulations", "thank-you", "appreciation", "farewell", "achievement", "party")
    private val experiences = setOf("page-generator", "interactive-card", "invitation-generator", "countdown", "memory-page", "reveal-page", "quiz-generator", "surprise-page")
    private val unavailableToolIds = setOf("birthday-countdown", "valentine-reveal-page", "appreciation-reveal-page")
    private val labels = mapOf(
        "birthday" to "Birthday", "anniversary" to "Anniversary", "graduation" to "Graduation",
        "valentine" to "Valentine's Day", "christmas" to "Christmas", "new-year" to "New Year",
        "congratulations" to "Congratulations", "thank-you" to "Thank You", "appreciation" to "Appreciation",
        "farewell" to "Farewell", "achievement" to "Achievement", "party" to "Party"
    )
    private val messages = mapOf(
        "birthday" to "Another year, another reason to celebrate.",
        "anniversary" to "A meaningful milestone in a story worth celebrating.",
        "graduation" to "A milestone earned through effort, growth and persistence.",
        "valentine" to "A moment to celebrate care, connection and the people who matter.",
        "christmas" to "Wishing you a season filled with warmth and good company.",
        "new-year" to "A fresh chapter, new possibilities and a reason to gather.",
        "congratulations" to "Recognising a milestone and the work that made it possible.",
        "thank-you" to "A thoughtful moment to recognise someone's kindness and support.",
        "appreciation" to "Taking time to recognise the people who make a difference.",
        "farewell" to "Celebrating the memories made and the next chapter ahead.",
        "achievement" to "A milestone worth recognising and remembering.",
        "party" to "Good people, a shared moment and a reason to celebrate."
    )
    private val themes = mapOf(
        "Classic" to Triple("#F05A42", "#172334", "#F8F4EA"),
        "Rose" to Triple("#00B48A", "#321724", "#F3D9DE"),
        "Gold" to Triple("#D9A441", "#141B3A", "#F9F1D8"),
        "Garden" to Triple("#F04A24", "#1F4A3A", "#FEFCF5"),
        "Ocean" to Triple("#F02391", "#014342", "#FEFCF5"),
        "Midnight" to Triple("#B8F01E", "#0B1026", "#BCD4F2")
    )
    private val localFormatter = DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm", Locale.ROOT).withResolverStyle(ResolverStyle.STRICT)

    fun parse(toolId: String): Parsed {
        val normalized = toolId.trim().lowercase(Locale.ROOT)
        for (occasion in occasions) {
            val prefix = "$occasion-"
            if (!normalized.startsWith(prefix)) continue
            val experience = normalized.removePrefix(prefix)
            require(experience in experiences && normalized !in unavailableToolIds) { "This celebration tool is not supported." }
            return Parsed(occasion, experience)
        }
        throw IllegalArgumentException("This celebration tool is not supported.")
    }

    fun initialValues(toolId: String): MutableMap<String, String> {
        val parsed = parse(toolId)
        return mutableMapOf(
            "timezone" to ZoneId.systemDefault().id,
            "theme" to "Classic",
            "title" to (labels[parsed.occasion] ?: "Celebration") + " celebration"
        )
    }

    fun eventInstant(value: String, zoneName: String): java.time.Instant {
        val local = try { LocalDateTime.parse(value.trim(), localFormatter) }
        catch (_: Exception) { throw IllegalArgumentException("Enter a valid date and time in YYYY-MM-DDTHH:mm format.") }
        val zone = try { ZoneId.of(zoneName.trim()) }
        catch (_: Exception) { throw IllegalArgumentException("Choose a valid IANA time zone, such as Africa/Lagos or Europe/London.") }
        val offsets = zone.rules.getValidOffsets(local)
        if (offsets.isEmpty()) throw IllegalArgumentException("That local time does not exist because the clocks change. Choose another time.")
        if (offsets.size > 1) throw IllegalArgumentException("That local time occurs twice because the clocks change. Choose another time.")
        return local.atOffset(offsets.single()).toInstant()
    }

    fun countdown(values: Map<String, String>, now: java.time.Instant = java.time.Instant.now()): Countdown? = try {
        val target = eventInstant(values["date"].orEmpty(), values["timezone"].orEmpty())
        val duration = Duration.between(now, target)
        if (duration.isNegative || duration.isZero) Countdown(0, 0, 0, 0, true)
        else {
            val seconds = duration.seconds
            Countdown(seconds / 86400, (seconds % 86400) / 3600, (seconds % 3600) / 60, seconds % 60, false)
        }
    } catch (_: Exception) { null }

    private fun clean(values: Map<String, String>, key: String) = values[key].orEmpty().trim()
    private fun escape(value: String) = value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;")
    private fun safeUrl(value: String): String {
        val candidate = value.trim()
        if (candidate.any { it.isWhitespace() || it.isISOControl() }) return ""
        val uri = runCatching { Uri.parse(candidate) }.getOrNull() ?: return ""
        val allowedScheme = uri.scheme.equals("https", true) || uri.scheme.equals("http", true)
        return if (allowedScheme && !uri.host.isNullOrBlank() && uri.userInfo == null) uri.toString() else ""
    }
    private fun photoMarkup(values: Map<String, String>): String {
        val safeDataUrl = Regex("""^data:image/(?:png|jpeg|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$""", RegexOption.IGNORE_CASE)
        return lines(clean(values, "photosData")).asSequence()
            .filter { it.length <= 3_500_000 && safeDataUrl.matches(it) }
            .take(8).mapIndexed { index, uri ->
                "<figure><img alt=\"Memory ${index + 1}\" src=\"$uri\"><figcaption>Memory ${index + 1}</figcaption></figure>"
            }.joinToString("")
    }
    private fun dateLabel(values: Map<String, String>): String {
        if (clean(values, "date").isEmpty()) return ""
        return runCatching {
            val zone = ZoneId.of(clean(values, "timezone"))
            DateTimeFormatter.ofPattern("EEEE, d MMMM yyyy 'at' HH:mm", Locale.getDefault())
                .withZone(zone).format(eventInstant(clean(values, "date"), clean(values, "timezone")))
        }.getOrElse { clean(values, "date") }
    }
    private fun lines(value: String) = value.lines().map { it.trim() }.filter { it.isNotEmpty() }

    fun checks(parsed: Parsed, values: Map<String, String>): List<String> {
        val result = mutableListOf<String>()
        if (clean(values, "title").isEmpty()) result += "Add a title guests or the recipient will recognise."
        if (clean(values, "honoree").isEmpty() && parsed.experience != "countdown") result += "Add the person or group being celebrated."
        if (clean(values, "date").isNotEmpty()) {
            try { eventInstant(clean(values, "date"), clean(values, "timezone")) }
            catch (error: Exception) { result += (error.message ?: "Check the date and time.") }
        } else if (parsed.experience in setOf("invitation-generator", "countdown")) result += "Add the date and time."
        if (clean(values, "date").isNotEmpty() && clean(values, "timezone").isEmpty()) result += "Add the IANA time zone so the displayed local time is clear."
        if (parsed.experience == "invitation-generator") {
            if (clean(values, "rsvpUrl").isEmpty() && clean(values, "contactMethod").isEmpty()) result += "Add an RSVP link or a contact method guests can use to reply."
            else if (clean(values, "rsvpUrl").isNotEmpty() && safeUrl(clean(values, "rsvpUrl")).isEmpty()) result += "Use a complete http or https RSVP link."
            if (clean(values, "rsvpBy").isEmpty()) result += "Add an RSVP deadline, or state that replies are open."
        }
        if (parsed.experience == "quiz-generator") {
            val options = lines(clean(values, "quizOptions"))
            if (clean(values, "quizQuestion").isEmpty()) result += "Add the question."
            if (options.size !in 2..6) result += "Add between 2 and 6 answer choices."
            if (clean(values, "quizAnswer").isEmpty()) result += "Choose the correct answer so the quiz can grade responses."
            if (clean(values, "quizAnswer").isNotEmpty() && options.none { it.equals(clean(values, "quizAnswer"), true) }) result += "The correct answer must match one of the answer choices."
        }
        if (parsed.experience == "memory-page" && clean(values, "memories").isEmpty() && clean(values, "photosData").isEmpty()) result += "Add a memory note or at least one photo."
        if (parsed.experience in setOf("reveal-page", "surprise-page", "interactive-card") && clean(values, "revealMessage").isEmpty()) result += "Add the message that will be revealed."
        return result.distinct()
    }

    fun build(toolId: String, values: Map<String, String>): Result {
        val parsed = parse(toolId)
        val occasion = labels[parsed.occasion] ?: "Celebration"
        val title = clean(values, "title").ifBlank { "$occasion celebration" }
        val honoree = clean(values, "honoree")
        val host = clean(values, "host")
        val date = dateLabel(values)
        val location = clean(values, "location")
        val message = clean(values, "message").ifBlank { messages[parsed.occasion] ?: "A reason to celebrate." }
        val details = clean(values, "details")
        val rsvp = safeUrl(clean(values, "rsvpUrl"))
        val rsvpBy = clean(values, "rsvpBy")
        val reveal = clean(values, "revealMessage")
        val scheduleItems = lines(clean(values, "schedule"))
        val scheduleHtml = if (scheduleItems.isEmpty()) "" else
            "<section class=\"schedule\"><h2>Schedule</h2><ol>" +
                scheduleItems.joinToString("") { "<li>" + escape(it) + "</li>" } + "</ol></section>"
        val photoHtml = photoMarkup(values)
        val text = listOfNotNull(
            title, "$occasion · ${parsed.experience.replace('-', ' ')}",
            honoree.takeIf { it.isNotEmpty() }?.let { "For: $it" },
            host.takeIf { it.isNotEmpty() }?.let { "Hosted by: $it" },
            date.takeIf { it.isNotEmpty() }?.let { "When: $it (${clean(values, "timezone")})" },
            location.takeIf { it.isNotEmpty() }?.let { "Where: $it" },
            "", message, details,
            lines(clean(values, "schedule")).takeIf { it.isNotEmpty() }?.mapIndexed { i, item -> "${i + 1}. $item" }?.joinToString("\n")?.let { "Programme\n$it" },
            clean(values, "memories").takeIf { it.isNotEmpty() }?.let { "Memories\n$it" },
            clean(values, "dressCode").takeIf { it.isNotEmpty() }?.let { "Dress code: $it" },
            clean(values, "contactMethod").takeIf { it.isNotEmpty() }?.let { "RSVP contact: $it" },
            rsvpBy.takeIf { it.isNotEmpty() }?.let { "Please reply by: $it" },
            rsvp.takeIf { it.isNotEmpty() }?.let { "RSVP: $it" },
            reveal.takeIf { it.isNotEmpty() }?.let { "The reveal\n$it" },
            clean(values, "quizQuestion").takeIf { it.isNotEmpty() }?.let { "Quiz\n$it\n${lines(clean(values, "quizOptions")).joinToString("\n")}" },
            if (photoHtml.isNotEmpty()) "Photos included: ${photoHtml.count { it == '<' } / 2}" else null,
            ""
        )
        val content = when (parsed.experience) {
            "interactive-card" -> "<p class=\"eyebrow\">$occasion</p><h1>${escape(title)}</h1><p class=\"lead\">${escape(message)}</p><button type=\"button\" data-reveal>Open your card</button><div hidden data-content><p>${escape(reveal)}</p></div>"
            "invitation-generator" -> "<p class=\"eyebrow\">You are invited</p><h1>${escape(title)}</h1><p class=\"lead\">${escape(message)}</p><dl>${date.takeIf { it.isNotEmpty() }?.let { "<div><dt>When</dt><dd>${escape(it)}</dd></div>" } ?: ""}${location.takeIf { it.isNotEmpty() }?.let { "<div><dt>Where</dt><dd>${escape(it)}</dd></div>" } ?: ""}${host.takeIf { it.isNotEmpty() }?.let { "<div><dt>Hosted by</dt><dd>${escape(it)}</dd></div>" } ?: ""}</dl>${if (rsvp.isNotEmpty()) "<a class=\"button\" href=\"${escape(rsvp)}\" rel=\"noopener noreferrer\">Reply to invitation</a>" else if (clean(values, "contactMethod").isNotEmpty()) "<p>Reply to: ${escape(clean(values, "contactMethod"))}</p>" else "<p>Contact the host to reply.</p>"}${rsvpBy.takeIf { it.isNotEmpty() }?.let { "<p>Reply by ${escape(it)}</p>" } ?: ""}"
            "countdown" -> {
                val instant = runCatching { eventInstant(clean(values, "date"), clean(values, "timezone")).toString() }.getOrDefault("")
                "<p class=\"eyebrow\">$occasion</p><h1>${escape(title)}</h1><p class=\"lead\">${escape(message)}</p><div class=\"countdown\" data-countdown=\"${escape(instant)}\"><div><strong id=\"days\">—</strong><span>Days</span></div><div><strong id=\"hours\">—</strong><span>Hours</span></div><div><strong id=\"minutes\">—</strong><span>Minutes</span></div><div><strong id=\"seconds\">—</strong><span>Seconds</span></div></div>"
            }
            "memory-page" -> "<p class=\"eyebrow\">A collection of memories</p><h1>${escape(title)}</h1><p class=\"lead\">${escape(message)}</p><p>${escape(clean(values, "memories"))}</p><div class=\"gallery\">$photoHtml</div>"
            "reveal-page", "surprise-page" -> "<p class=\"eyebrow\">$occasion</p><h1>${escape(title)}</h1><p class=\"lead\">${escape(message)}</p><button type=\"button\" data-reveal>Open the reveal</button><div hidden data-content><p>${escape(reveal)}</p></div>"
            "quiz-generator" -> {
                val options = lines(clean(values, "quizOptions")).take(6)
                "<p class=\"eyebrow\">Celebration quiz</p><h1>${escape(title)}</h1><p class=\"lead\">${escape(message)}</p><p class=\"question\">${escape(clean(values, "quizQuestion"))}</p><div id=\"choices\">${options.map { "<button type=\"button\" data-correct=\"${it.equals(clean(values, "quizAnswer"), true)}\">${escape(it)}</button>" }.joinToString("")}</div><p id=\"feedback\" aria-live=\"polite\">Choose an answer.</p>"
            }
            else -> "<p class=\"eyebrow\">" + occasion + "</p><h1>" + escape(title) + "</h1><p class=\"lead\">" + escape(message) + "</p>" +
                (honoree.takeIf { it.isNotEmpty() }?.let { "<p>For <strong>" + escape(it) + "</strong></p>" } ?: "") +
                (host.takeIf { it.isNotEmpty() }?.let { "<p>Hosted by: " + escape(it) + "</p>" } ?: "") +
                (date.takeIf { it.isNotEmpty() }?.let { "<p><strong>When:</strong> " + escape(it) + "</p>" } ?: "") +
                (location.takeIf { it.isNotEmpty() }?.let { "<p><strong>Where:</strong> " + escape(it) + "</p>" } ?: "") +
                (details.takeIf { it.isNotEmpty() }?.let { "<p>" + escape(it) + "</p>" } ?: "") + scheduleHtml
        }
        val theme = themes[clean(values, "theme")] ?: themes.getValue("Classic")
        val glyph = when (parsed.occasion) { "birthday" -> "✳"; "anniversary" -> "∞"; "graduation" -> "✦"; "valentine" -> "♥"; "christmas" -> "✶"; "new-year" -> "✺"; "farewell" -> "〰"; "achievement" -> "✸"; else -> "✧" }
        val script = "<script>(function(){document.querySelectorAll('[data-reveal]').forEach(function(b){b.addEventListener('click',function(){var c=b.parentElement.querySelector('[data-content]');if(c)c.hidden=!c.hidden;});});var q=document.getElementById('choices');if(q)q.addEventListener('click',function(e){var b=e.target.closest('button[data-correct]');if(b)document.getElementById('feedback').textContent=b.dataset.correct==='true'?'That is right!':'Not quite. Try again.';});var t=document.querySelector('[data-countdown]');if(t){var target=Date.parse(t.dataset.countdown);function tick(){if(!Number.isFinite(target))return;var n=Math.max(0,target-Date.now()),s=Math.floor(n/1000);document.getElementById('days').textContent=Math.floor(s/86400);document.getElementById('hours').textContent=String(Math.floor(s%86400/3600)).padStart(2,'0');document.getElementById('minutes').textContent=String(Math.floor(s%3600/60)).padStart(2,'0');document.getElementById('seconds').textContent=String(s%60).padStart(2,'0');}tick();setInterval(tick,1000);}})();</script>"
        val css = """
            *,*::before,*::after{box-sizing:border-box}
            :root{--accent:@ACCENT@;--paper:@PAPER@;--ink:@INK@}
            body{margin:0;min-height:100vh;padding:clamp(12px,4vw,36px);background:radial-gradient(ellipse at 15% 12%,color-mix(in srgb,var(--accent) 18%,transparent),transparent 45%),var(--paper);color:var(--ink);font:16px/1.6 Georgia,serif;overflow-wrap:anywhere}
            body:before{position:fixed;inset:0;z-index:-1;content:"";pointer-events:none;opacity:.16;background-image:repeating-linear-gradient(0deg,transparent 0 3px,rgba(255,255,255,.08) 3px 4px),repeating-linear-gradient(90deg,transparent 0 5px,rgba(0,0,0,.04) 5px 6px)}
            .poster{max-width:980px;min-height:min(720px,92vh);margin:auto;padding:clamp(22px,5vw,56px);display:grid;grid-template-columns:minmax(210px,.9fr) minmax(0,1.1fr);align-items:center;gap:clamp(20px,5vw,58px);overflow:hidden;border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);border-radius:28px;background:linear-gradient(140deg,color-mix(in srgb,var(--paper) 95%,white),var(--paper));box-shadow:0 24px 72px rgba(0,0,0,.2)}
            .hero-art{position:relative;display:grid;min-height:400px;place-items:center;isolation:isolate}
            .hero-art:before{position:absolute;inset:8% -18%;content:"";border:1px solid color-mix(in srgb,var(--accent) 55%,transparent);border-radius:48% 52% 60% 40%;transform:rotate(-24deg);box-shadow:0 0 0 18px color-mix(in srgb,var(--accent) 7%,transparent),0 0 0 38px color-mix(in srgb,var(--accent) 4%,transparent)}
            .art-orbit{position:absolute;width:92%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 32% 24%,rgba(255,255,255,.6),transparent 19%),radial-gradient(circle at 50% 50%,var(--accent),color-mix(in srgb,var(--accent) 70%,black) 62%,transparent 64%);filter:drop-shadow(0 24px 40px rgba(0,0,0,.25))}
            .art-ribbon{position:absolute;left:-20%;right:-24%;top:40%;height:24%;border-radius:50%;background:linear-gradient(180deg,rgba(255,255,255,.8),var(--accent) 22%,var(--accent) 58%,color-mix(in srgb,var(--accent) 72%,black));box-shadow:0 16px 34px rgba(0,0,0,.24),inset 0 2px 8px rgba(255,255,255,.5);transform:rotate(-32deg)}
            .art-mark{position:relative;z-index:1;font:400 clamp(8rem,22vw,15rem)/1 Georgia,serif;color:var(--ink);text-shadow:0 5px 0 color-mix(in srgb,var(--accent) 35%,transparent),0 20px 30px rgba(0,0,0,.22);transform:rotate(-9deg)}
            .hero-copy{position:relative;z-index:2;min-width:0}
            .eyebrow{margin:0 0 16px;color:var(--accent);font:700 .72rem/1.2 system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase}
            h1{margin:0 0 18px;font:500 clamp(2.5rem,6vw,5.4rem)/.98 Georgia,serif;letter-spacing:-.05em;overflow-wrap:anywhere}
            .lead{font:400 clamp(1rem,1.5vw,1.2rem)/1.65 system-ui,sans-serif;opacity:.88}
            p{overflow-wrap:anywhere}.poster button,.poster .button{display:inline-flex;min-height:46px;align-items:center;justify-content:center;margin-top:18px;padding:12px 22px;border:0;border-radius:999px;background:var(--accent);color:white;font:700 .9rem system-ui,sans-serif;text-decoration:none;cursor:pointer}
            .poster button:focus-visible,.poster a:focus-visible{outline:3px solid var(--accent);outline-offset:4px}
            dl{display:grid;gap:8px;margin:24px 0}dl div{display:grid;grid-template-columns:90px minmax(0,1fr);gap:12px;padding:10px 0;border-bottom:1px solid color-mix(in srgb,var(--ink) 18%,transparent)}dt{color:var(--accent);font:700 .68rem system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase}dd{margin:0;font:500 .94rem/1.5 system-ui,sans-serif}
            .note{color:var(--accent);font:700 .82rem system-ui,sans-serif}.countdown{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:24px 0}.countdown div{padding:14px 5px;text-align:center;border:1px solid color-mix(in srgb,var(--accent) 38%,transparent);border-radius:14px;background:color-mix(in srgb,var(--accent) 10%,transparent)}.countdown strong{display:block;font:600 clamp(1.5rem,4vw,2.8rem) system-ui,sans-serif;color:var(--accent);font-variant-numeric:tabular-nums}.countdown span{font:700 .65rem system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase}
            .gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-top:20px}.gallery figure{margin:0}.gallery img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:14px}.reveal{margin-top:18px;padding:18px 20px;border:1px solid color-mix(in srgb,var(--accent) 35%,transparent);border-radius:16px;background:color-mix(in srgb,var(--accent) 9%,transparent)}.schedule{margin-top:24px}.schedule li{padding:8px 0;border-bottom:1px solid color-mix(in srgb,var(--ink) 16%,transparent)}.brand{grid-column:1/-1;text-align:right;margin-top:20px;font:800 .72rem system-ui,sans-serif;letter-spacing:.24em;text-transform:uppercase;opacity:.72}.hidden{display:none}
            @media(max-width:680px){body{padding:10px}.poster{display:flex;min-height:0;flex-direction:column;align-items:stretch;gap:12px;padding:22px;border-radius:20px}.hero-art{width:100%;min-height:clamp(160px,40vw,240px);height:clamp(160px,40vw,240px)}.art-orbit{width:70%}.art-mark{font-size:clamp(7rem,30vw,11rem)}h1{font-size:clamp(2.5rem,12vw,4.2rem)}}
            @media(max-width:390px){.countdown{gap:4px}.countdown div{padding:10px 2px}dl div{grid-template-columns:76px minmax(0,1fr)}}
            @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
        """.trimIndent()
            .replace("@ACCENT@", theme.first)
            .replace("@PAPER@", theme.second)
            .replace("@INK@", theme.third)
        val html = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\"><meta name=\"color-scheme\" content=\"light dark\"><title>${escape(title)}</title><style>$css</style></head><body><main class=\"poster\"><div class=\"hero-art\" aria-hidden=\"true\"><span class=\"art-orbit\"></span><span class=\"art-ribbon\"></span><span class=\"art-mark\">$glyph</span></div><section class=\"hero-copy\">$content</section><footer class=\"brand\">enV</footer></main>$script</body></html>"        return Result(text.joinToString("\n"), html, checks(parsed, values))
    }
}

@Composable
internal fun NativeCelebrationToolForm(toolId: String) {
    val parsed = remember(toolId) { NativeCelebrationEngine.parse(toolId) }
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    var values by remember(toolId) { mutableStateOf(NativeCelebrationEngine.initialValues(toolId).toMap()) }
    var output by remember(toolId) { mutableStateOf<NativeCelebrationEngine.Result?>(null) }
    var error by remember(toolId) { mutableStateOf("") }
    var now by remember { mutableStateOf(java.time.Instant.now()) }
    var saveHtml by remember { mutableStateOf("") }
    var saveText by remember { mutableStateOf("") }
    val htmlLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/html")) { uri ->
        if (uri != null) runCatching {
            val stream = context.contentResolver.openOutputStream(uri) ?: throw IllegalStateException("Could not open the selected file.")
            stream.use { it.write(saveHtml.toByteArray(Charsets.UTF_8)) }
        }.onFailure { error = it.message ?: "Could not save the celebration page." }
    }
    val textLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri ->
        if (uri != null) runCatching {
            val stream = context.contentResolver.openOutputStream(uri) ?: throw IllegalStateException("Could not open the selected file.")
            stream.use { it.write(saveText.toByteArray(Charsets.UTF_8)) }
        }.onFailure { error = it.message ?: "Could not save the celebration text." }
    }
    val photoLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) runCatching {
            require(uris.size <= 8) { "Choose up to eight photos." }
            val data = uris.map { uri ->
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: throw IllegalStateException("A selected photo could not be read.")
                require(bytes.size <= 2 * 1024 * 1024) { "Each photo must be 2 MB or smaller." }
                val type = context.contentResolver.getType(uri) ?: ""
                require(type in setOf("image/jpeg", "image/png", "image/webp", "image/avif")) { "Use JPG, PNG, WebP or AVIF photos." }
                "data:$type;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
            }
            require(data.sumOf { it.length } <= 11_000_000) { "The selected photos are too large to embed together." }
            values = values + ("photosData" to data.joinToString("\n"))
            output = null
        }.onFailure { error = it.message ?: "The photos could not be added." }
    }
    LaunchedEffect(parsed.experience) {
        if (parsed.experience == "countdown") while (true) { now = java.time.Instant.now(); delay(1000) }
    }
    val label = parsed.occasion.replace('-', ' ').replaceFirstChar { it.uppercase() }
    fun value(key: String) = values[key].orEmpty()
    fun set(key: String, newValue: String) { values = values + (key to newValue); output = null; error = "" }
    val invite = parsed.experience == "invitation-generator"
    val memory = parsed.experience == "memory-page"
    val quiz = parsed.experience == "quiz-generator"
    val reveal = parsed.experience in setOf("interactive-card", "reveal-page", "surprise-page")
    val countdown = if (parsed.experience == "countdown") NativeCelebrationEngine.countdown(values, now) else null

    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        @Composable fun field(key: String, title: String, multiline: Boolean = false, maxLines: Int = 4) {
            OutlinedTextField(value = value(key), onValueChange = { set(key, it) }, label = { Text(title) },
                modifier = Modifier.fillMaxWidth(), minLines = if (multiline) 3 else 1, maxLines = if (multiline) maxLines else 1)
        }
        field("title", "Title")
        field("honoree", "Person or group being celebrated")
        field("host", "Host / organiser")
        Text("Theme", style = MaterialTheme.typography.labelLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Classic", "Rose", "Gold", "Garden", "Ocean", "Midnight").forEach { theme ->
                OutlinedButton(onClick = { set("theme", theme) }) { Text(theme) }
            }
        }
        if (parsed.experience !in setOf("interactive-card", "reveal-page", "surprise-page", "quiz-generator", "memory-page")) {
            field("date", "Date and time (YYYY-MM-DDTHH:mm)")
            field("timezone", "Time zone (IANA)")
        }
        if (parsed.experience in setOf("page-generator", "invitation-generator", "countdown")) field("location", "Location / venue")
        if (invite) {
            field("rsvpUrl", "RSVP link (http or https)")
            field("contactMethod", "RSVP contact (phone or email)")
            field("rsvpBy", "Reply by")
            field("dressCode", "Dress code / theme")
        }
        if (parsed.experience == "page-generator") field("schedule", "Programme (one item per line)", true)
        if (memory) {
            field("memories", "Memory notes", true)
            OutlinedButton(onClick = { photoLauncher.launch(arrayOf("image/jpeg", "image/png", "image/webp", "image/avif")) }) { Text("Add photos") }
            Text(if (value("photosData").isBlank()) "No photos" else "${value("photosData").lines().size} selected", style = MaterialTheme.typography.bodySmall)
        }
        if (reveal) field("revealMessage", "Message to reveal", true)
        if (quiz) {
            field("quizQuestion", "Question", true, 3)
            field("quizOptions", "Answer choices (one per line)", true)
            field("quizAnswer", "Correct answer")
        }
        field("message", "Main message", true)
        if (parsed.experience !in setOf("interactive-card", "reveal-page", "surprise-page", "quiz-generator")) field("details", "Extra details", true)
        if (countdown != null) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(if (countdown.complete) "The celebration has started" else "${countdown.days} days · ${countdown.hours} hours · ${countdown.minutes} minutes · ${countdown.seconds} seconds", style = MaterialTheme.typography.titleMedium)
                }
            }
        }
        if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error)
        output?.checks?.takeIf { it.isNotEmpty() }?.let { checks ->
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) { checks.forEach { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) } }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = {
                runCatching { NativeCelebrationEngine.build(toolId, values) }
                    .onSuccess { output = it; error = "" }
                    .onFailure { output = null; error = it.message ?: "Could not create this celebration." }
            }) { Text("Generate") }
            OutlinedButton(onClick = {
                values = NativeCelebrationEngine.initialValues(toolId).toMap()
                output = null; error = ""
            }) { Text("Reset") }
        }
        output?.let {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { clipboard.setText(AnnotatedString(it.text)) }) { Text("Copy text") }
                OutlinedButton(onClick = { saveHtml = it.html; htmlLauncher.launch("env-$toolId.html") }) { Text("Save page") }
                OutlinedButton(onClick = { saveText = it.text; textLauncher.launch("env-$toolId.txt") }) { Text("Save text") }
            }
            Text(it.text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface)
        }
    }
}
