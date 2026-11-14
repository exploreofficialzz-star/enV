package com.chastech.env

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class NativeCelebrationEngineTest {
    private val occasions = listOf(
        "birthday", "anniversary", "graduation", "valentine", "christmas", "new-year",
        "congratulations", "thank-you", "appreciation", "farewell", "achievement", "party"
    )
    private val experiences = listOf(
        "page-generator", "interactive-card", "invitation-generator", "countdown",
        "memory-page", "reveal-page", "quiz-generator", "surprise-page"
    )
    private val unavailableCombinations = setOf(
        "birthday-countdown", "valentine-reveal-page", "appreciation-reveal-page"
    )
    private val cataloguedIds = occasions.flatMap { occasion ->
        experiences.map { experience -> "$occasion-$experience" }
    }.filterNot { it in unavailableCombinations }

    @Test fun everyExistingCelebrationCatalogIdHasItsOwnNativeOperation() {
        assertEquals(93, cataloguedIds.size)
        assertEquals(93, cataloguedIds.toSet().size)
        cataloguedIds.forEach { id ->
            val parsed = NativeCelebrationEngine.parse(id)
            val occasion = occasions.first { id.startsWith("$it-") }
            val experience = id.removePrefix("$occasion-")
            assertEquals(occasion, parsed.occasion)
            assertEquals(experience, parsed.experience)
        }
        unavailableCombinations.forEach { id ->
            try {
                NativeCelebrationEngine.parse(id)
                fail("An uncatalogued celebration combination must not become a public tool: $id")
            } catch (_: IllegalArgumentException) { }
        }
        try {
            NativeCelebrationEngine.parse("celebration-unsupported")
            fail("Unsupported operations must be rejected.")
        } catch (_: IllegalArgumentException) { }
    }

    @Test fun localDateTimeUsesIanaZoneAndRejectsDaylightSavingGapsAndDuplicates() {
        assertEquals(
            Instant.parse("2026-11-05T09:00:00Z"),
            NativeCelebrationEngine.eventInstant("2026-11-05T10:00", "Africa/Lagos")
        )
        listOf("2026-03-08T02:30" to "does not exist", "2026-11-01T01:30" to "occurs twice").forEach { (date, expected) ->
            try {
                NativeCelebrationEngine.eventInstant(date, "America/New_York")
                fail("Expected a daylight-saving validation error.")
            } catch (error: IllegalArgumentException) {
                assertTrue(error.message.orEmpty().contains(expected))
            }
        }
    }

    @Test fun invitationEscapesUserContentAndExplainsTheLocalRsvpBoundary() {
        val result = NativeCelebrationEngine.build(
            "birthday-invitation-generator",
            mapOf(
                "title" to "A & B <Birthday>",
                "honoree" to "A & B",
                "message" to "Dinner with <friends>",
                "contactMethod" to "host@example.test",
                "rsvpBy" to "20 November"
            )
        )
        assertTrue(result.html.startsWith("<!doctype html>"))
        assertTrue(result.html.contains("A &amp; B &lt;Birthday&gt;"))
        assertTrue(result.html.contains("Dinner with &lt;friends&gt;"))
        assertTrue(result.html.contains("Reply to: host@example.test"))
        assertTrue(result.html.contains("Guest responses are not collected"))
        assertTrue(result.checks.none { it.contains("contact method") })
        assertFalse(result.html.contains("href=\"javascript:"))
    }

    @Test fun invitationRejectsUnsafeRsvpUrlAndQuizRequiresAnAnswerKey() {
        val invitation = NativeCelebrationEngine.build(
            "party-invitation-generator",
            mapOf("title" to "Party", "honoree" to "Alex", "rsvpUrl" to "javascript:alert(1)")
        )
        assertFalse(invitation.html.contains("href=\"javascript:"))
        assertTrue(invitation.checks.any { it.contains("http or https") })

        val credentialUrl = NativeCelebrationEngine.build(
            "party-invitation-generator",
            mapOf("title" to "Party", "honoree" to "Alex", "rsvpUrl" to "https://guest@trusted.example/rsvp")
        )
        assertFalse(credentialUrl.html.contains("href=\"https://guest@trusted.example"))
        assertTrue(credentialUrl.checks.any { it.contains("http or https") })

        val quiz = NativeCelebrationEngine.build(
            "graduation-quiz-generator",
            mapOf("title" to "Graduation quiz", "honoree" to "Sam", "quizQuestion" to "Which year?", "quizOptions" to "2025\n2026")
        )
        assertTrue(quiz.checks.any { it.contains("correct answer") })
        val answered = NativeCelebrationEngine.build(
            "graduation-quiz-generator",
            mapOf("title" to "Graduation quiz", "honoree" to "Sam", "message" to "A quiz introduction.", "quizQuestion" to "Which year?", "quizOptions" to "2025\n2026", "quizAnswer" to "2026")
        )
        assertTrue(answered.html.contains("data-correct=\"true\""))
        assertTrue(answered.html.contains("A quiz introduction."))
        assertTrue(answered.html.contains("Which year?"))
        assertTrue(answered.html.contains("overflow-wrap:anywhere"))
        assertFalse(answered.checks.any { it.contains("correct answer") })
    }

    @Test fun memoryPageEmbedsOnlyStrictlyValidatedImageDataUrls() {
        val result = NativeCelebrationEngine.build(
            "graduation-memory-page",
            mapOf(
                "title" to "The good days",
                "photosData" to listOf(
                    "data:image/png;base64,AAAA",
                    "data:image/svg+xml;base64,PHN2ZyBvbmVycm9yPSJ4Ii8+",
                    "data:image/png;base64,AAAA\"><svg onload=alert(1)>"
                ).joinToString("\n")
            )
        )
        assertEquals(1, Regex("<figure>").findAll(result.html).count())
        assertFalse(result.html.contains("data:image/svg+xml"))
        assertFalse(result.html.contains("<svg onload="))
    }

    @Test fun pageGeneratorExportsEscapedScheduleAndEventDetails() {
        val result = NativeCelebrationEngine.build(
            "birthday-page-generator",
            mapOf(
                "title" to "Birthday gathering",
                "honoree" to "Alex",
                "host" to "Sam",
                "date" to "2030-01-01T12:00",
                "timezone" to "Africa/Lagos",
                "location" to "Hall & Garden",
                "schedule" to "Welcome\nDinner <after>\nPhotos"
            )
        )
        assertTrue(result.html.contains("<h2>Schedule</h2><ol>"))
        assertTrue(result.html.contains("<li>Welcome</li>"))
        assertTrue(result.html.contains("<li>Dinner &lt;after&gt;</li>"))
        assertTrue(result.html.contains("<li>Photos</li>"))
        assertTrue(result.html.contains("Hall &amp; Garden"))
        assertTrue(result.html.contains("Hosted by: Sam"))
        assertFalse(result.html.contains("<li>Dinner <after>"))
    }

    @Test fun countdownHasExactSecondBoundariesAndPastEventsAreComplete() {
        val values = mapOf("date" to "2026-11-05T10:00", "timezone" to "Africa/Lagos")
        val target = Instant.parse("2026-11-05T09:00:00Z")
        assertEquals(NativeCelebrationEngine.Countdown(0, 0, 0, 1, false), NativeCelebrationEngine.countdown(values, target.minusSeconds(1)))
        assertEquals(NativeCelebrationEngine.Countdown(0, 0, 0, 0, true), NativeCelebrationEngine.countdown(values, target.plusSeconds(1)))
    }
}
