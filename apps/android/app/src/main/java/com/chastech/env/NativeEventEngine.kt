package com.chastech.env

object NativeEventEngine {
    enum class Operation { AGENDA, SCHEDULE, RSVP, CHECK_IN }
    data class Template(val operation: Operation, val theme: String)
    data class Field(val name: String, val label: String, val defaultValue: String, val multiline: Boolean = false)

    private val agendaThemes = listOf("birthday", "concert", "conference", "dinner", "fundraiser", "graduation", "launch", "party", "sports-event", "webinar", "wedding", "workshop")
    private val scheduleThemes = listOf("birthday", "concert", "conference", "dinner", "fundraiser", "graduation", "launch", "meeting", "party", "sports-event", "webinar", "wedding", "workshop")
    private val pageThemes = scheduleThemes
    private val templates: Map<String, Template> = buildMap {
        agendaThemes.forEach { put("$it-agenda-generator", Template(Operation.AGENDA, titleCase(it))) }
        scheduleThemes.forEach { put("$it-schedule-builder", Template(Operation.SCHEDULE, titleCase(it))) }
        pageThemes.forEach {
            put("$it-rsvp-page", Template(Operation.RSVP, titleCase(it)))
            put("$it-check-in-page", Template(Operation.CHECK_IN, titleCase(it)))
        }
    }

    val supportedToolIds: Set<String> get() = templates.keys
    fun supports(toolId: String): Boolean = templates.containsKey(toolId)
    fun templateFor(toolId: String): Template? = templates[toolId]

    fun fieldsFor(toolId: String): List<Field> {
        val template = templateFor(toolId) ?: return emptyList()
        return when (template.operation) {
            Operation.AGENDA, Operation.SCHEDULE -> {
                val label = if (template.operation == Operation.AGENDA) "agenda" else "schedule"
                listOf(
                    Field("title", "Title", "Event $label"),
                    Field("dateTime", "Date / time (optional)", ""),
                    Field("location", "Location (optional)", ""),
                    Field("items", "Agenda items (one per line)", "Welcome\nMain activity\nBreak\nClosing", multiline = true),
                )
            }
            Operation.RSVP -> listOf(
                Field("title", "Page title", "${template.theme} event"),
                Field("dateTime", "Date / time (optional)", ""),
                Field("location", "Location (optional)", ""),
                Field("body", "Event details", "You're invited to the ${template.theme.lowercase()} event.", multiline = true),
                Field("contact", "Organizer / RSVP contact", "the event organizer"),
            )
            Operation.CHECK_IN -> listOf(
                Field("title", "Page title", "${template.theme} check-in"),
                Field("dateTime", "Date / time (optional)", ""),
                Field("location", "Location (optional)", ""),
                Field("body", "Event details", "Welcome to the ${template.theme.lowercase()} event.", multiline = true),
                Field("guest", "Guest name", "Guest"),
            )
        }
    }

    fun initialValues(toolId: String): Map<String, String> = fieldsFor(toolId).associate { it.name to it.defaultValue }

    fun fileName(toolId: String): String {
        val extension = if (templateFor(toolId)?.operation in setOf(Operation.RSVP, Operation.CHECK_IN)) "html" else "txt"
        return "env-$toolId.$extension"
    }

    fun mimeType(toolId: String): String = if (templateFor(toolId)?.operation in setOf(Operation.RSVP, Operation.CHECK_IN)) "text/html" else "text/plain"

    fun generate(toolId: String, values: Map<String, String>): String {
        val template = templateFor(toolId) ?: throw IllegalArgumentException("Unsupported event template: $toolId")
        return when (template.operation) {
            Operation.AGENDA, Operation.SCHEDULE -> generateList(template, values)
            Operation.RSVP -> generateRsvp(template, values)
            Operation.CHECK_IN -> generateCheckIn(template, values)
        }
    }

    private fun generateList(template: Template, values: Map<String, String>): String {
        val operation = if (template.operation == Operation.AGENDA) "agenda" else "schedule"
        val title = clean(values["title"], if (template.operation == Operation.AGENDA) "Event agenda" else "Event schedule")
        val rawItems = clean(values["items"], "Welcome\nMain activity\nBreak\nClosing")
        val items = rawItems.split(Regex("\\r?\\n")).map { it.trim() }.filter { it.isNotEmpty() }
        val details = listOfNotNull(
            values["dateTime"]?.trim()?.takeIf { it.isNotEmpty() }?.let { "Date / time: $it" },
            values["location"]?.trim()?.takeIf { it.isNotEmpty() }?.let { "Location: $it" },
        )
        val header = "${template.theme} $operation"
        return "$header\n\n$title${if (details.isEmpty()) "" else "\n${details.joinToString("\n")}"}\n\n${items.mapIndexed { index, item -> "${index + 1}. $item" }.joinToString("\n")}"
    }

    private fun generateRsvp(template: Template, values: Map<String, String>): String {
        val title = htmlEscape(clean(values["title"], "${template.theme} event"))
        val body = htmlEscape(clean(values["body"], "You're invited to the ${template.theme.lowercase()} event."))
        val date = values["dateTime"]?.trim()?.takeIf { it.isNotEmpty() }?.let { "<p><strong>Date / time:</strong> ${htmlEscape(it)}</p>" }.orEmpty()
        val location = values["location"]?.trim()?.takeIf { it.isNotEmpty() }?.let { "<p><strong>Location:</strong> ${htmlEscape(it)}</p>" }.orEmpty()
        val contact = htmlEscape(clean(values["contact"], "the event organizer"))
        val theme = htmlEscape(template.theme)
        return "<!doctype html>\n<html lang=\"en\">\n<head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>$title</title></head>\n<body><main><h1>$title</h1><p>$body</p>$date$location<section aria-labelledby=\"rsvp-heading\"><h2 id=\"rsvp-heading\">How to RSVP</h2><p>Contact $contact to respond. This static page does not collect or store RSVPs.</p></section><p>Event type: $theme</p></main></body>\n</html>"
    }

    private fun generateCheckIn(template: Template, values: Map<String, String>): String {
        val title = htmlEscape(clean(values["title"], "${template.theme} check-in"))
        val body = htmlEscape(clean(values["body"], "Welcome to the ${template.theme.lowercase()} event."))
        val date = values["dateTime"]?.trim()?.takeIf { it.isNotEmpty() }?.let { "<p><strong>Date / time:</strong> ${htmlEscape(it)}</p>" }.orEmpty()
        val location = values["location"]?.trim()?.takeIf { it.isNotEmpty() }?.let { "<p><strong>Location:</strong> ${htmlEscape(it)}</p>" }.orEmpty()
        val guest = htmlEscape(clean(values["guest"], "Guest"))
        val theme = htmlEscape(template.theme)
        return "<!doctype html>\n<html lang=\"en\">\n<head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>$title</title></head>\n<body><main><h1>$title</h1><p>$body</p>$date$location<section aria-labelledby=\"checkin-heading\"><h2 id=\"checkin-heading\">Check-in information</h2><p>Guest: $guest</p><p>Please check in with event staff on arrival. This static page does not verify or record arrivals.</p></section><p>Event type: $theme</p></main></body>\n</html>"
    }

    private fun clean(value: String?, fallback: String): String = value?.trim()?.takeIf { it.isNotEmpty() } ?: fallback
    private fun titleCase(slug: String): String = slug.split('-').joinToString(" ") { word -> word.replaceFirstChar { character -> character.titlecase() } }
    private fun htmlEscape(value: String): String = value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;")
}
