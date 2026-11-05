package com.chastech.env

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.ResolverStyle
import java.util.UUID

internal data class CommunicationField(val key: String, val label: String, val multiline: Boolean = false)

internal object NativeCommunicationEngine {
    private val kinds = setOf(
        "email", "message", "sms", "meeting", "agenda", "minutes", "signature",
        "invitation", "announcement", "thank-you", "follow-up", "reminder",
    )
    private val actions = listOf("generator", "template", "builder", "planner", "formatter")

    fun parse(toolId: String): Pair<String, String> {
        val action = actions.firstOrNull { toolId.endsWith("-" + it) }
            ?: throw IllegalArgumentException("Unsupported communication action.")
        val kind = toolId.removeSuffix("-" + action)
        require(kind in kinds) { "Unsupported communication workflow." }
        return kind to action
    }

    fun fieldsFor(toolId: String): List<CommunicationField> {
        val (kind, action) = parse(toolId)
        val fields = mutableListOf<CommunicationField>()
        fields += CommunicationField("name", if (kind == "signature") "Full name" else if (kind in setOf("meeting", "agenda", "minutes")) "Attendees" else "Recipient / audience")
        fields += CommunicationField("subject", if (kind in setOf("meeting", "agenda", "minutes")) "Meeting title" else if (kind == "signature") "Role" else "Subject / title")
        if (kind in setOf("meeting", "agenda", "minutes", "invitation", "reminder", "announcement", "follow-up")) {
            fields += CommunicationField("date", "Date and time (YYYY-MM-DDTHH:mm)")
        }
        if (kind in setOf("meeting", "agenda", "minutes", "invitation", "reminder")) {
            fields += CommunicationField("place", "Location / meeting link")
        }
        if (kind == "email") {
            fields += CommunicationField("email", "Recipient email")
            fields += CommunicationField("cc", "Cc")
            fields += CommunicationField("bcc", "Bcc")
        }
        if (kind in setOf("message", "sms")) fields += CommunicationField("channel", "Channel")
        if (kind in setOf("meeting", "agenda", "invitation", "reminder")) {
            if (kind in setOf("meeting", "agenda")) fields += CommunicationField("duration", "Duration (minutes)")
            fields += CommunicationField("timezone", "Time zone")
        }
        if (kind == "invitation") fields += CommunicationField("rsvpBy", "RSVP deadline")
        if (kind == "signature") {
            fields += CommunicationField("company", "Company")
            fields += CommunicationField("email", "Email")
            fields += CommunicationField("phone", "Phone")
            fields += CommunicationField("website", "Website")
        }
        if (action !in setOf("formatter", "template") && kind != "signature") fields += CommunicationField("purpose", "Purpose / context", true)
        if (kind in setOf("agenda", "minutes")) fields += CommunicationField("items", "Agenda items (one per line)", true)
        if (kind == "minutes") {
            fields += CommunicationField("decisions", "Decisions (one per line)", true)
            fields += CommunicationField("actionItems", "Action items · Owner | Task | Due date", true)
        }
        fields += CommunicationField("details", if (action == "formatter") "Text to format" else if (kind == "signature") "Optional short note" else "Details / message", true)
        if (kind in setOf("email", "message", "sms", "invitation", "announcement", "follow-up", "reminder", "minutes")) {
            val label = when (kind) {
                "invitation" -> "RSVP method / link"
                "minutes" -> "Next review date / owner"
                "sms" -> "Action / deadline"
                else -> "Next step / call to action"
            }
            fields += CommunicationField("nextStep", label, true)
        }
        if (kind != "signature" && action !in setOf("formatter", "template")) fields += CommunicationField("tone", "Tone")
        return fields
    }

    fun generate(toolId: String, values: Map<String, String>): String {
        val (kind, action) = parse(toolId)
        fun value(key: String, fallback: String = "") = values[key].orEmpty().trim().ifBlank { fallback }
        fun header(key: String, fallback: String = "") = value(key, fallback)
            .replace(Regex("[\\r\\n\\u0000-\\u001f\\u007f]+"), " ")
            .replace(Regex("\\s{2,}"), " ").trim()
        val recipient = if (kind == "email") header("name", "[Recipient]") else value("name", "[Recipient]")
        val subject = header("subject", kind.replace('-', ' ').replaceFirstChar { it.uppercase() })
        val purpose = value("purpose")
        val details = value("details").ifBlank { purpose }
        val date = value("date", "[Date / time]")
        val place = value("place", "[Location]")
        val next = value("nextStep")
        val items = value("items").lines().map { it.trim() }.filter { it.isNotEmpty() }
        if (action == "template") return template(kind)
        if (action == "formatter") return format(value("details"), kind)
        if (action == "planner") return planner(kind, recipient, subject, purpose, value("duration", "30"), items)

        return when (kind) {
            "email" -> {
                val displayName = header("name")
                val greetingName = displayName.ifBlank { "there" }
                val greeting = if (value("tone") in setOf("friendly", "warm")) "Hi " + greetingName + "," else "Hello " + greetingName + ","
                val body = details.ifBlank { "[Add the main information]" }
                val emailAddress = header("email")
                val toRecipient = if (emailAddress.isNotBlank()) {
                    if (displayName.isNotBlank()) displayName + " <" + emailAddress + ">" else emailAddress
                } else recipient
                val headers = listOf(
                    "To: " + toRecipient,
                    if (value("cc").isNotBlank()) "Cc: " + header("cc") else "",
                    if (value("bcc").isNotBlank()) "Bcc: " + header("bcc") else "",
                    "Subject: " + subject,
                ).filter { it.isNotEmpty() }
                (if (action == "builder") headers.joinToString("\n") + "\n\n" else "Subject: " + subject + "\n\n") +
                    greeting + "\n\n" + body + (if (next.isNotBlank()) "\n\nNext step: " + next else "") +
                    "\n\n" + (if (value("tone") == "warm") "With appreciation," else "Best regards,") + "\n[Your name]"
            }
            "message" -> (if (action == "builder") "To: " + recipient + "\nChannel: " + value("channel", "General") + "\nTopic: " + subject + "\n\n" else "") +
                details.ifBlank { "[Write the update or question]" } + (if (next.isNotBlank()) "\n\nNext step: " + next else "")
            "sms" -> (if (recipient != "[Recipient]") recipient + ", " else "") +
                details.ifBlank { "[Write one clear message]" } + (if (next.isNotBlank()) " " + next else "")
            "meeting" -> "MEETING BRIEF\n" + subject + "\n\nDate/time: " + date +
                (if (value("timezone").isNotBlank()) " (" + value("timezone") + ")" else "") +
                "\nDuration: " + value("duration", "30") + " minutes\nLocation/link: " + place +
                "\nAttendees: " + recipient + "\nPurpose / outcome: " + purpose.ifBlank { "[State the decision or outcome]" } +
                "\nPreparation: " + details.ifBlank { "[Add pre-read or preparation notes]" }
            "agenda" -> "AGENDA\n" + subject + "\nDate/time: " + date + (if (value("timezone").isNotBlank()) " (" + value("timezone") + ")" else "") + "\nLocation: " + place +
                "\nObjective: " + purpose.ifBlank { "[Outcome required]" } + "\n\n" +
                agenda(items.ifEmpty { details.lines().filter { it.isNotBlank() } }, value("duration", "30")) +
                "\n\nClose: confirm decisions, owners and due dates."
            "minutes" -> "MEETING MINUTES\n" + subject + "\nDate/time: " + date + (if (value("timezone").isNotBlank()) " (" + value("timezone") + ")" else "") +
                "\nLocation: " + place + "\nAttendees: " + recipient +
                "\n\nDiscussion summary\n" + details.ifBlank { "[Summarize outcomes by agenda item]" } +
                "\n\nDecisions\n" + value("decisions").lines().map { it.trim() }.filter { it.isNotBlank() }.mapIndexed { i, item -> "${i + 1}. " + item }.joinToString("\n").ifBlank { "[Record each decision and its owner]" } +
                "\n\nAction register\n" + actionRegister(value("actionItems").ifBlank { value("items") }) +
                "\n\nNext review: " + next.ifBlank { "[Date / owner]" }
            "signature" -> listOf(
                recipient,
                listOf(value("subject"), value("company")).filter { it.isNotBlank() }.joinToString(" · "),
                value("email"), value("phone"), value("website"), value("details"),
            ).filter { it.isNotBlank() }.joinToString("\n")
            "invitation" -> "YOU'RE INVITED\n" + subject + "\n\nWhen: " + date +
                (if (value("timezone").isNotBlank()) " (" + value("timezone") + ")" else "") +
                "\nWhere: " + place + "\n\n" + details.ifBlank { "[What guests can expect]" } +
                "\n\nPlease RSVP by: " + value("rsvpBy", "[RSVP deadline]") +
                "\nRSVP: " + next.ifBlank { "[Response link or contact]" } +
                "\n\nPlease share any access or dietary requirements with the organiser."
            "announcement" -> "ANNOUNCEMENT\n" + subject + "\n\nWhat is happening\n" + details.ifBlank { "[Explain the update]" } +
                "\n\nWho is affected\n" + recipient + "\n\nEffective date\n" + date +
                "\n\nWhat to do next\n" + next.ifBlank { purpose.ifBlank { "[State the required action]" } }
            "thank-you" -> "Hello " + recipient + ",\n\nThank you for " + purpose.ifBlank { "[the specific contribution]" } + ".\n\n" +
                details.ifBlank { "[Describe why it mattered and the impact it had.]" } +
                (if (next.isNotBlank()) "\n\n" + next else "") + "\n\nWarm regards,\n[Your name]"
            "follow-up" -> "Subject: Follow-up — " + subject + "\n\nHello " + recipient + ",\n\nI am following up on " +
                purpose.ifBlank { "[our previous conversation / topic]" } + ".\n\n" +
                details.ifBlank { "[Briefly recap the open point.]" } + "\n\nCould you " +
                next.ifBlank { "[confirm the next step]" } +
                (if (date != "[Date / time]") " by " + date else " when convenient") + "?\n\nBest regards,\n[Your name]"
            else -> "REMINDER — " + subject + "\nFor: " + recipient + "\nWhen: " + date +
                (if (value("timezone").isNotBlank()) " (" + value("timezone") + ")" else "") +
                "\nWhere: " + place + "\n\n" + details.ifBlank { "[Essential details]" } +
                "\n\nAction needed: " + next.ifBlank { purpose.ifBlank { "[State the action]" } } +
                "\n\nPlease contact the organiser if anything has changed."
        }
    }

    fun checks(toolId: String, values: Map<String, String>, output: String): List<String> {
        val (kind, _) = parse(toolId)
        fun value(key: String) = values[key].orEmpty().trim()
        val result = mutableListOf<String>()
        if (kind == "email") {
            val emailPattern = Regex("^[^\\s@,;]+@[^\\s@,;]+\\.[^\\s@,;]+$")
            if (value("email").isNotBlank() && !emailPattern.matches(value("email"))) result += "Check the recipient email address."
            if (value("subject").isBlank()) result += "Add a specific subject so the email is easy to find."
            val cc = value("cc").split(Regex("[,;]")).map { it.trim() }.filter { it.isNotBlank() }
            val bcc = value("bcc").split(Regex("[,;]")).map { it.trim() }.filter { it.isNotBlank() }
            if ((cc + bcc).any { !emailPattern.matches(it) }) result += "Check every Cc and Bcc address; separate addresses with commas or semicolons."
            val to = value("email").ifBlank { value("name").takeIf { emailPattern.matches(it) }.orEmpty() }
            val all = (listOf(to) + cc + bcc).filter { it.isNotBlank() }.map { it.lowercase() }
            if (all.size != all.toSet().size) result += "An address appears more than once across To, Cc and Bcc; review recipient visibility."
            if (listOf("name", "email", "cc", "bcc", "subject").any { key ->
                values[key].orEmpty().any { ch -> ch == '\r' || ch == '\n' || ch.code < 32 || ch.code == 127 }
            }) result += "Remove line breaks and control characters from email headers before using this draft."
        }
        if (kind == "sms" && output.isNotBlank()) {
            val metrics = smsMetrics(output)
            if (metrics.third > 3) result += "This draft uses ${metrics.third} SMS segments; shorten it or check your provider's segment and cost rules."
            if (!metrics.first) result += "This message uses Unicode encoding, which reduces the single-message limit to 70 units."
        }
        if (kind in setOf("meeting", "agenda", "invitation", "reminder") && value("timezone").isBlank()) result += "Add the time zone for people in different regions."
        if (kind in setOf("meeting", "agenda", "reminder") && value("date").isBlank()) result += "Add the date and time."
        if (kind == "invitation" && value("rsvpBy").isBlank()) result += "Set an RSVP deadline."
        if (kind == "minutes" && value("actionItems").isBlank() && value("items").isBlank()) result += "Add action owners and due dates."
        if (kind == "minutes" && value("nextStep").isBlank()) result += "Add the next review date or review owner."
        if (kind == "signature" && listOf("email", "phone", "website").all { value(it).isBlank() }) result += "Add at least one contact method."
        if (kind in calendarKinds) {
            if (value("date").isBlank()) result += "Add the event date and local time."
            else runCatching {
                val zone = ZoneId.of(value("timezone"))
                val start = localEventInstant(value("date"), zone, "Event date and time")
                if (kind == "invitation" && value("rsvpBy").isNotBlank()) {
                    val rsvp = localEventInstant(value("rsvpBy"), zone, "RSVP deadline")
                    require(rsvp.isBefore(start)) { "The RSVP deadline must be earlier than the event." }
                }
            }.onFailure { result += (it.message ?: "Check the event date, time and time zone.") }
            if (value("timezone").isBlank()) result += "Add the time zone so recipients see the intended local time."
            if (value("duration").isNotBlank() && value("duration").toIntOrNull()?.let { it !in 5..480 } == true) result += "Set an event duration between 5 and 480 minutes."
            if (kind in setOf("meeting", "agenda") && value("duration").isBlank()) result += "Set a duration so agenda timeboxes can be checked."
        }
        return result.distinct()
    }

    fun smsMetrics(text: String): Triple<Boolean, Int, Int> {
        val basic = "@£\$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
        val extended = "\u000c^{}\\[~]|€"
        val chars = text.toCharArray()
        val gsm = chars.all { basic.contains(it) || extended.contains(it) }
        val units = if (gsm) chars.fold(0) { total, character -> total + if (extended.contains(character)) 2 else 1 } else text.length
        val limit = if (gsm) 160 else 70
        val joined = if (gsm) 153 else 67
        val segments = if (units == 0) 0 else if (units <= limit) 1 else (units + joined - 1) / joined
        return Triple(gsm, units, segments)
    }


    private val calendarKinds = setOf("meeting", "agenda", "invitation", "reminder")
    private val localDateFormatter = DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm").withResolverStyle(ResolverStyle.STRICT)
    private val calendarUtcFormatter = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC)

    private fun localEventInstant(value: String, zone: ZoneId, fieldLabel: String): Instant {
        val local = try { LocalDateTime.parse(value, localDateFormatter) } catch (_: Exception) {
            throw IllegalArgumentException(fieldLabel + " must use YYYY-MM-DDTHH:mm.")
        }
        val offsets = zone.rules.getValidOffsets(local)
        if (offsets.isEmpty()) throw IllegalArgumentException(fieldLabel + " falls in a daylight-saving clock gap. Choose another time.")
        if (offsets.size > 1) throw IllegalArgumentException(fieldLabel + " occurs twice because clocks change. Choose a time outside the repeated hour.")
        return local.atOffset(offsets.single()).toInstant()
    }

    fun gsm7Alternative(text: String): String {
        val replacements = mapOf(
            '\u2018' to "'", '\u2019' to "'", '\u201a' to "'", '\u201b' to "'",
            '\u201c' to "\"", '\u201d' to "\"", '\u201e' to "\"", '\u201f' to "\"",
            '\u2013' to "-", '\u2014' to "-", '\u2212' to "-", '\u2011' to "-",
            '\u2026' to "...", '\u2022' to "-", '\u00a0' to " ", '\u2007' to " ",
            '\u2009' to " ", '\u202f' to " ", '\u200b' to "", '\u200c' to "",
            '\u200d' to "", '\ufeff' to "", '\u00ad' to "",
        )
        return buildString { text.forEach { append(replacements[it] ?: it) } }
    }

    private fun escapeIcs(value: String): String = value
        .replace("\\", "\\\\")
        .replace("\r\n", "\\n").replace("\r", "\\n").replace("\n", "\\n")
        .replace(";", "\\;").replace(",", "\\,")

    private fun foldIcsLine(line: String): String {
        val result = mutableListOf<String>()
        var current = ""
        line.codePoints().forEach { codePoint ->
            val character = String(Character.toChars(codePoint))
            if (current.isNotEmpty() && (current + character).toByteArray(Charsets.UTF_8).size > 75) {
                result += current
                current = " " + character
            } else current += character
        }
        result += current
        return result.joinToString("\r\n")
    }

    fun calendarIcs(toolId: String, values: Map<String, String>): String {
        val (kind, _) = parse(toolId)
        require(kind in calendarKinds) { "Calendar export is available for meetings, agendas, invitations and reminders." }
        fun value(key: String) = values[key].orEmpty().trim()
        val zoneName = value("timezone")
        require(zoneName.isNotBlank()) { "Choose a time zone before exporting the event." }
        val zone = try { ZoneId.of(zoneName) } catch (_: Exception) {
            throw IllegalArgumentException("Choose a valid IANA time zone, such as Africa/Lagos or Europe/London.")
        }
        val start = localEventInstant(value("date"), zone, "Event date and time")
        val rawDuration = value("duration")
        val duration = if (rawDuration.isNotBlank()) rawDuration.toIntOrNull()
            ?: throw IllegalArgumentException("Event duration must be a whole number of minutes.")
            else if (kind == "invitation") 60 else if (kind == "reminder") 15 else 30
        require(duration in 5..480) { "Set an event duration between 5 and 480 minutes." }
        if (kind == "invitation" && value("rsvpBy").isNotBlank()) {
            val rsvp = localEventInstant(value("rsvpBy"), zone, "RSVP deadline")
            require(rsvp.isBefore(start)) { "The RSVP deadline must be earlier than the event." }
        }
        val title = value("subject").ifBlank { kind.replace('-', ' ').replaceFirstChar { it.uppercase() } }
        val end = start.plusSeconds(duration.toLong() * 60)
        val description = listOf(
            value("purpose").takeIf { it.isNotBlank() }?.let { "Purpose: " + it },
            value("details").takeIf { it.isNotBlank() },
            value("items").takeIf { it.isNotBlank() }?.let { "Agenda:\n" + it },
            value("decisions").takeIf { it.isNotBlank() }?.let { "Decisions:\n" + it },
            value("actionItems").takeIf { it.isNotBlank() }?.let { "Action items:\n" + it },
            value("nextStep").takeIf { it.isNotBlank() }?.let { "Next step / RSVP: " + it },
            value("rsvpBy").takeIf { it.isNotBlank() }?.let { "RSVP by: " + it },
            value("name").takeIf { it.isNotBlank() }?.let { "Audience / attendees: " + it },
        ).filterNotNull().joinToString("\n\n")
        val uidSource = listOf(kind, title, value("date"), zoneName, value("name")).joinToString("|")
        val uid = UUID.nameUUIDFromBytes(uidSource.toByteArray(Charsets.UTF_8)).toString() + "@envtools.store"
        val lines = listOf(
            "BEGIN:VCALENDAR", "PRODID:-//enV//Communication Tools//EN", "VERSION:2.0", "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH", "BEGIN:VEVENT", "UID:" + uid, "DTSTAMP:" + calendarUtcFormatter.format(Instant.now()),
            "DTSTART:" + calendarUtcFormatter.format(start), "DTEND:" + calendarUtcFormatter.format(end),
            "X-WR-TIMEZONE:" + escapeIcs(zoneName), "SUMMARY:" + escapeIcs(title), "DESCRIPTION:" + escapeIcs(description),
            "LOCATION:" + escapeIcs(value("place")), "STATUS:CONFIRMED", "TRANSP:OPAQUE",
            "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT15M", "DESCRIPTION:" + escapeIcs(title),
            "END:VALARM", "END:VEVENT", "END:VCALENDAR",
        )
        return lines.joinToString("\\r\\n") { foldIcsLine(it) } + "\\r\\n"
    }

    private fun format(value: String, kind: String): String =
        value.replace("\r\n", "\n").replace('\r', '\n').lines()
            .map { it.trimEnd().trimStart() }.joinToString("\n")
            .replace(Regex("\n{3,}"), "\n\n").trim()
            .ifBlank { kind.replace('-', ' ') + " formatter\n\nPaste your content above to format it." }

    private fun agenda(items: List<String>, durationValue: String): String {
        val source = items.ifEmpty { listOf("Welcome and objectives", "Main discussion", "Decisions and next steps") }
        val duration = durationValue.toIntOrNull()?.coerceIn(5, 480) ?: 30
        val base = duration / source.size
        var remainder = duration % source.size
        var elapsed = 0
        return source.mapIndexed { index, item ->
            val minutes = base + if (remainder-- > 0) 1 else 0
            val start = elapsed
            elapsed += minutes
            fun stamp(value: Int) = "%02d:%02d".format(value / 60, value % 60)
            "${index + 1}. ${stamp(start)}–${stamp(elapsed)}  " + item
        }.joinToString("\n")
    }

    private fun actionRegister(value: String): String {
        val rows = value.lines().map { it.trim() }.filter { it.isNotBlank() }
        if (rows.isEmpty()) return "1. [Owner] — [Action] — [Due date]"
        return rows.mapIndexed { index, row ->
            val parts = row.split("|").map { it.trim() }
            val owner = parts.getOrNull(0).orEmpty()
            val task = parts.getOrNull(1).orEmpty()
            val due = parts.getOrNull(2).orEmpty()
            "${index + 1}. " + (task.ifBlank { owner }) +
                (if (owner.isNotBlank() && task.isNotBlank()) " — Owner: " + owner else "") +
                " — Due: " + due.ifBlank { "Not set" }
        }.joinToString("\n")
    }

    private fun planner(kind: String, recipient: String, subject: String, purpose: String, duration: String, items: List<String>): String {
        val outcome = purpose.ifBlank { "[Define the outcome]" }
        return when (kind) {
            "email" -> "EMAIL PLAN\nAudience: " + recipient + "\nSubject: " + subject + "\nGoal: " + outcome + "\n\n1. Confirm each recipient and visibility.\n2. Put the main point first.\n3. Separate context from the request.\n4. State one owner and a response date.\n5. Check links, attachments and confidential information."
            "message" -> "MESSAGE PLAN\nChannel: [Choose the right channel]\nAudience: " + recipient + "\nGoal: " + outcome + "\n\n1. Decide whether this belongs in a shared thread or a private message.\n2. Lead with the update or question.\n3. Include only useful context.\n4. Mention only people who need to act.\n5. End with an owner or next step."
            "sms" -> {
                val metrics = smsMetrics(purpose)
                "SMS PLAN\nAudience: " + recipient + "\nGoal: " + outcome + "\n\n1. Put essential information first.\n2. Use one clear action and deadline.\n3. Remove unnecessary detail.\n4. Confirm the recipient and consent before sending.\n5. Check encoding and segment count.\n\nCurrent text: " + metrics.second + " units · " + metrics.third + " segment(s)"
            }
            "meeting", "agenda" -> "MEETING PLAN\n" + subject + "\nOutcome: " + outcome + "\nDuration: " + duration + " minutes\n\n1. Invite only people needed for the outcome.\n2. Share agenda and pre-read in advance.\n3. Give each topic an owner and timebox.\n4. Reserve time for decisions and risks.\n5. End with named actions and deadlines.\n\nAgenda\n" + agenda(items, duration)
            "minutes" -> "MINUTES PLAN\nMeeting: " + subject + "\nPurpose: " + outcome + "\n\n1. Record attendance and apologies.\n2. Summarize discussion by agenda item.\n3. Capture decisions, rationale and owners.\n4. Add actions with owners and due dates.\n5. Record the next review date.\n\nAction format: Owner | Task | Due date"
            "signature" -> "SIGNATURE PLAN\n1. Use your professional name and role.\n2. Add one reliable contact route and a useful website.\n3. Keep the signature compact and mobile-readable.\n4. Include a disclaimer only when required.\n5. Test the text and HTML versions."
            "invitation" -> "INVITATION PLAN\nEvent: " + subject + "\nAudience: " + recipient + "\n\n1. State who should attend and why.\n2. Confirm date, local time and time zone.\n3. Include venue/link and access notes.\n4. Give an RSVP deadline and response route.\n5. Send reminders only through a connected service."
            "announcement" -> "ANNOUNCEMENT PLAN\nSubject: " + subject + "\nAudience: " + recipient + "\n\n1. Put the news in the headline.\n2. Explain who is affected and what changes.\n3. State the effective date.\n4. Give the required action and contact.\n5. Keep one source of truth for updates."
            "thank-you" -> "THANK-YOU PLAN\nRecipient: " + recipient + "\nReason: " + outcome + "\n\n1. Name the specific contribution.\n2. Explain its real impact.\n3. Add a personal detail.\n4. Offer a next step only if appropriate.\n5. Keep it timely and sincere."
            "follow-up" -> "FOLLOW-UP PLAN\nRecipient: " + recipient + "\nTopic: " + subject + "\nGoal: " + outcome + "\n\n1. Refer to the prior exchange and date.\n2. Summarize the open point.\n3. Ask one answerable question.\n4. Offer a deadline or alternative.\n5. Track the next follow-up."
            else -> "REMINDER PLAN\nFor: " + recipient + "\nTask: " + subject + "\nGoal: " + outcome + "\n\n1. Confirm date, time zone and location.\n2. Put the action first.\n3. Include materials or access link.\n4. Choose a sensible notice period.\n5. Schedule delivery in a connected service."
        }
    }

    private fun template(kind: String): String = when (kind) {
        "email" -> "To: [Name] <[email]>\nCc: [optional]\nSubject: [Specific subject]\n\nHello [Name],\n\n[Purpose and context]\n[Essential details]\n\n[Clear request and date]\n\nBest regards,\n[Your name]"
        "message" -> "To: [Person / group]\nChannel: [WhatsApp / Slack / Teams]\n\n[One clear update]\n[Context the reader needs]\n\nNext step: [Owner + action + timing]"
        "sms" -> "[Name], [one clear message]. [Action and deadline]."
        "meeting" -> "MEETING BRIEF\n[Title]\nDate/time: [Date + time zone]\nDuration: [Minutes]\nLocation/link: [Place]\nPurpose: [Outcome]\nAttendees: [Names]\nPreparation: [Pre-read]"
        "agenda" -> "MEETING AGENDA\n[Title] · [Date/time]\nObjective: [Decision or outcome]\n\n1. Welcome — [Owner] — [Minutes]\n2. [Topic] — [Owner] — [Minutes]\n3. Decisions and actions — [Owner] — [Minutes]"
        "minutes" -> "MEETING MINUTES\nMeeting: [Title] · Date: [Date/time]\nAttendees: [Names]\n\nDiscussion\n[Outcome-focused notes]\n\nDecisions\n[Decision — rationale — owner]\n\nAction register\n[Owner] | [Action] | [Due date]\n\nNext review: [Date/time]"
        "signature" -> "[Full name]\n[Role] · [Company]\n[Email] · [Phone]\n[Website]"
        "invitation" -> "YOU'RE INVITED\n[Event]\nWhen: [Date, time and time zone]\nWhere: [Venue or link]\n\n[What guests can expect]\n\nPlease RSVP by [Date] via [Contact / link].\nAccess notes: [Optional]"
        "announcement" -> "[Headline]\n\nWhat is happening: [Change]\nWho is affected: [Audience]\nWhen: [Effective date]\nWhat to do: [Action]\nQuestions: [Contact]"
        "thank-you" -> "Hello [Name],\n\nThank you for [specific reason]. [Why it mattered].\n\n[Next step, if relevant]\n\nWarm regards,\n[Your name]"
        "follow-up" -> "Subject: Follow-up — [Topic]\n\nHello [Name],\n\nI am following up on [previous conversation / date]. [Brief recap].\n\nCould you [specific next step] by [date]?\n\nBest regards,\n[Your name]"
        else -> "REMINDER — [Task / event]\nWhen: [Date, time and time zone]\nWhere: [Location / link]\n\n[Essential details]\nAction needed: [Action]\nBy: [Deadline]\nContact: [Name / channel]"
    }
}

@Composable
fun NativeCommunicationToolForm(toolId: String) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    var values by remember(toolId) { mutableStateOf(mapOf("timezone" to java.util.TimeZone.getDefault().id, "tone" to "professional")) }
    var output by remember(toolId) { mutableStateOf("") }
    var error by remember(toolId) { mutableStateOf("") }
    var checks by remember(toolId) { mutableStateOf(emptyList<String>()) }
    var calendarOutput by remember(toolId) { mutableStateOf("") }
    val (kind, action) = NativeCommunicationEngine.parse(toolId)
    val calendarSaveLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/calendar")) { uri ->
        if (uri != null) runCatching {
            val stream = context.contentResolver.openOutputStream(uri) ?: throw IllegalStateException("Unable to open the selected calendar file.")
            stream.use { it.write(calendarOutput.toByteArray(Charsets.UTF_8)) }
        }.onFailure { error = it.message ?: "Could not save the calendar file." }
    }
    val saveLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri ->
        if (uri != null) {
            runCatching {
                val stream = context.contentResolver.openOutputStream(uri) ?: throw IllegalStateException("Unable to open the selected file.")
                stream.use { it.write(output.toByteArray(Charsets.UTF_8)) }
            }.onFailure { error = it.message ?: "Could not save the communication draft." }
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
        Text(
            "Runs on this device. Your draft is not sent, scheduled or recorded.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        NativeCommunicationEngine.fieldsFor(toolId).forEach { field ->
            OutlinedTextField(
                value = values[field.key].orEmpty(),
                onValueChange = { values = values + (field.key to it) },
                label = { Text(field.label) },
                modifier = Modifier.fillMaxWidth(),
                minLines = if (field.multiline) 3 else 1,
                maxLines = if (field.multiline) 6 else 1,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = {
                runCatching { NativeCommunicationEngine.generate(toolId, values) }
                    .onSuccess {
                        output = it
                        checks = NativeCommunicationEngine.checks(toolId, values, it)
                        error = ""
                    }
                    .onFailure { output = ""; checks = emptyList(); error = it.message ?: "Could not create the draft." }
            }) { Text(if (action == "formatter") "Format" else if (action == "template") "Use template" else "Generate") }
            OutlinedButton(onClick = { values = mapOf("timezone" to java.util.TimeZone.getDefault().id, "tone" to "professional"); output = ""; checks = emptyList(); error = "" }) { Text("Reset") }
        }
        if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error)
        checks.forEach { check ->
            Text("Review: " + check, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (output.isNotEmpty()) {
            Spacer(Modifier.height(4.dp))
            val gsm7 = if (kind == "sms") NativeCommunicationEngine.gsm7Alternative(output).takeIf {
                it != output && NativeCommunicationEngine.smsMetrics(it).first
            } else null
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { clipboard.setText(AnnotatedString(output)) }) { Text("Copy") }
                OutlinedButton(onClick = { saveLauncher.launch("env-communication.txt") }) { Text("Save") }
                if (kind in setOf("meeting", "agenda", "invitation", "reminder")) {
                    OutlinedButton(onClick = {
                        runCatching { NativeCommunicationEngine.calendarIcs(toolId, values) }
                            .onSuccess { calendarOutput = it; calendarSaveLauncher.launch("env-$kind.ics") }
                            .onFailure { error = it.message ?: "Could not create the calendar file." }
                    }) { Text("Save calendar") }
                }
                if (gsm7 != null) OutlinedButton(onClick = { clipboard.setText(AnnotatedString(gsm7)) }) { Text("Copy GSM-7 version") }
            }
            Text(output, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface)
        }
    }
}
