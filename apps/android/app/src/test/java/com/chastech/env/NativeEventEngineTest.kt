package com.chastech.env

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeEventEngineTest {
    private val agendaIds = listOf(
        "birthday-agenda-generator", "concert-agenda-generator", "conference-agenda-generator", "dinner-agenda-generator",
        "fundraiser-agenda-generator", "graduation-agenda-generator", "launch-agenda-generator", "party-agenda-generator",
        "sports-event-agenda-generator", "webinar-agenda-generator", "wedding-agenda-generator", "workshop-agenda-generator",
    )
    private val scheduleIds = listOf(
        "birthday-schedule-builder", "concert-schedule-builder", "conference-schedule-builder", "dinner-schedule-builder",
        "fundraiser-schedule-builder", "graduation-schedule-builder", "launch-schedule-builder", "meeting-schedule-builder",
        "party-schedule-builder", "sports-event-schedule-builder", "webinar-schedule-builder", "wedding-schedule-builder", "workshop-schedule-builder",
    )
    private val pageThemes = listOf("birthday", "concert", "conference", "dinner", "fundraiser", "graduation", "launch", "meeting", "party", "sports-event", "webinar", "wedding", "workshop")
    private val allIds = agendaIds + scheduleIds + pageThemes.map { "$it-rsvp-page" } + pageThemes.map { "$it-check-in-page" }

    @Test fun exactAllowlistCoversAllAndOnlyFiftyOneRoadmapIds() {
        assertEquals(51, allIds.size)
        assertEquals(allIds.toSet(), NativeEventEngine.supportedToolIds)
        assertTrue(allIds.all { NativeEventEngine.supports(it) })
        assertFalse(NativeEventEngine.supports("birthday-event-qr-generator"))
        assertFalse(NativeEventEngine.supports("birthday-invitation-page"))
        assertTrue(NativeEventEngine.fieldsFor("unknown-event").isEmpty())
    }

    @Test fun agendaAndScheduleFormattingMatchSharedContract() {
        assertEquals(
            "Sports Event agenda\n\nMatch day\nDate / time: Sat 4pm local\nLocation: North field\n\n1. Doors\n2. Kickoff\n3. Wrap-up",
            NativeEventEngine.generate("sports-event-agenda-generator", mapOf("title" to "Match day", "dateTime" to "Sat 4pm local", "location" to "North field", "items" to "Doors\n\nKickoff\nWrap-up")),
        )
        assertEquals(
            "Meeting schedule\n\nPlanning session\nDate / time: 2026-11-01 1:30 AM local\n\n1. Introductions\n2. Decision",
            NativeEventEngine.generate("meeting-schedule-builder", mapOf("title" to "Planning session", "dateTime" to "2026-11-01 1:30 AM local", "items" to "Introductions\nDecision")),
        )
        assertEquals("Birthday agenda\n\nEvent agenda\n\n1. Welcome\n2. Main activity\n3. Break\n4. Closing", NativeEventEngine.generate("birthday-agenda-generator", mapOf("items" to " ")))
    }

    @Test fun rsvpIsEscapedStaticHtmlAndDoesNotCollectResponses() {
        val id = "wedding-rsvp-page"
        val output = NativeEventEngine.generate(id, mapOf("title" to "A & B <Wedding>", "body" to "Dinner with \"friends\" & family", "dateTime" to "June 4, 6 pm", "location" to "Garden", "contact" to "Rae <host@example.test>"))
        assertTrue(output.startsWith("<!doctype html>"))
        assertTrue(output.contains("<title>A &amp; B &lt;Wedding&gt;</title>"))
        assertTrue(output.contains("Dinner with &quot;friends&quot; &amp; family"))
        assertTrue(output.contains("Rae &lt;host@example.test&gt;"))
        assertTrue(output.contains("does not collect or store RSVPs"))
        assertEquals("env-wedding-rsvp-page.html", NativeEventEngine.fileName(id))
        assertEquals("text/html", NativeEventEngine.mimeType(id))
    }

    @Test fun checkInIsStaticAndDoesNotClaimLiveArrivalTracking() {
        val id = "conference-check-in-page"
        val output = NativeEventEngine.generate(id, mapOf("title" to "Check in", "guest" to "Alex & Jo", "location" to "Hall A"))
        assertTrue(output.startsWith("<!doctype html>"))
        assertTrue(output.contains("Guest: Alex &amp; Jo"))
        assertTrue(output.contains("Location:</strong> Hall A"))
        assertTrue(output.contains("does not verify or record arrivals"))
        assertEquals("env-conference-check-in-page.html", NativeEventEngine.fileName(id))
    }

    @Test fun operationSpecificFieldsAndExportExtensionsAreStable() {
        assertEquals("Agenda items (one per line)", NativeEventEngine.fieldsFor("party-agenda-generator").last().label)
        assertEquals("Organizer / RSVP contact", NativeEventEngine.fieldsFor("meeting-rsvp-page").last().label)
        assertEquals("Guest name", NativeEventEngine.fieldsFor("meeting-check-in-page").last().label)
        assertEquals("env-workshop-agenda-generator.txt", NativeEventEngine.fileName("workshop-agenda-generator"))
        assertEquals("text/plain", NativeEventEngine.mimeType("workshop-schedule-builder"))
    }
}
