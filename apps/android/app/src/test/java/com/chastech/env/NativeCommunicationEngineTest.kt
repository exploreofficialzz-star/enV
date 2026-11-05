package com.chastech.env

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test

class NativeCommunicationEngineTest {
    private val allIds = listOf(
        "agenda-builder", "agenda-formatter", "agenda-generator", "agenda-planner", "agenda-template",
        "announcement-builder", "announcement-formatter", "announcement-generator", "announcement-planner", "announcement-template",
        "email-builder", "email-formatter",
        "follow-up-builder", "follow-up-formatter", "follow-up-generator", "follow-up-planner", "follow-up-template",
        "invitation-builder", "invitation-formatter", "invitation-generator", "invitation-planner", "invitation-template",
        "meeting-builder", "meeting-formatter", "meeting-generator", "meeting-planner", "meeting-template",
        "message-builder", "message-formatter", "message-generator", "message-planner", "message-template",
        "minutes-builder", "minutes-formatter", "minutes-generator", "minutes-planner", "minutes-template",
        "reminder-builder", "reminder-formatter", "reminder-template",
        "signature-builder", "signature-formatter", "signature-generator", "signature-planner", "signature-template",
        "sms-builder", "sms-formatter", "sms-generator", "sms-planner", "sms-template",
        "thank-you-builder", "thank-you-formatter", "thank-you-generator", "thank-you-planner", "thank-you-template",
    )

    @Test fun everyCatalogToolResolvesAndCreatesAnOutput() {
        assertEquals(55, allIds.size)
        allIds.forEach { toolId ->
            val (kind, action) = NativeCommunicationEngine.parse(toolId)
            assertTrue(kind.isNotBlank())
            assertTrue(action.isNotBlank())
            val fields = NativeCommunicationEngine.fieldsFor(toolId)
            val values = fields.associate { it.key to when (it.key) {
                "details" -> "The updated plan is ready."
                "purpose" -> "Confirm the next step."
                "email" -> "alex@example.com"
                "subject" -> "Project update"
                "duration" -> "30"
                "timezone" -> "Africa/Lagos"
                "items" -> "Welcome\nReview\nNext steps"
                "actionItems" -> "Alex | Share notes | 2026-11-06"
                "decisions" -> "Proceed with the updated plan"
                else -> "Alex"
            } }
            assertTrue(toolId, NativeCommunicationEngine.generate(toolId, values).length > 20)
        }
    }

    @Test fun agendaDividesMeetingTimeAcrossEveryAgendaItem() {
        val output = NativeCommunicationEngine.generate("agenda-builder", mapOf(
            "subject" to "Planning", "duration" to "30", "items" to "Welcome\nReview\nDecisions",
        ))
        assertTrue(output.contains("00:00–00:10"))
        assertTrue(output.contains("00:10–00:20"))
        assertTrue(output.contains("00:20–00:30"))
    }

    @Test fun minutesKeepDecisionsAndOwnerDueDateRegisterSeparate() {
        val output = NativeCommunicationEngine.generate("minutes-builder", mapOf(
            "subject" to "Weekly review",
            "details" to "Reviewed launch readiness.",
            "decisions" to "Launch remains on Friday",
            "actionItems" to "Sam | Send checklist | 2026-11-06",
        ))
        assertTrue(output.contains("Launch remains on Friday"))
        assertTrue(output.contains("Send checklist — Owner: Sam — Due: 2026-11-06"))
    }

    @Test fun smsMetricsCountConcatenatedAndUnicodeSegments() {
        val gsm = NativeCommunicationEngine.smsMetrics("a".repeat(161))
        assertEquals(true, gsm.first)
        assertEquals(2, gsm.third)
        val unicode = NativeCommunicationEngine.smsMetrics("Hello 😀")
        assertEquals(false, unicode.first)
        assertEquals(8, unicode.second)
        assertEquals(1, unicode.third)
    }

    @Test fun emailChecksValidateCcBccAndVisibilityOverlap() {
        val values = mapOf(
            "email" to "alex@example.com",
            "subject" to "Update",
            "details" to "Here is the update.",
            "cc" to "team@example.com; invalid-address",
            "bcc" to "TEAM@example.com",
        )
        val checks = NativeCommunicationEngine.checks("email-builder", values, NativeCommunicationEngine.generate("email-builder", values)).joinToString(" ")
        assertTrue(checks.contains("Check every Cc and Bcc address"))
        assertTrue(checks.contains("appears in both Cc and Bcc"))
    }

    @Test fun emailAddressAloneDoesNotRenderRecipientPlaceholder() {
        val values = mapOf("email" to "alex@example.com", "subject" to "Update", "details" to "The plan is ready.")
        val output = NativeCommunicationEngine.generate("email-builder", values)
        assertTrue(output.contains("To: alex@example.com"))
        assertTrue(output.contains("Hello there,"))
        assertTrue(!output.contains("[Recipient] <alex@example.com>"))
    }

    @Test fun minutesRequireNextReviewDateOrOwner() {
        val values = mapOf(
            "subject" to "Weekly review",
            "details" to "Reviewed launch readiness.",
            "actionItems" to "Sam | Send checklist | 2026-11-06",
        )
        val checks = NativeCommunicationEngine.checks("minutes-builder", values, NativeCommunicationEngine.generate("minutes-builder", values)).joinToString(" ")
        assertTrue(checks.contains("next review date or review owner"))
    }

    @Test fun unknownActionsDoNotFallThroughToGenericText() {
        assertThrows(IllegalArgumentException::class.java) { NativeCommunicationEngine.parse("email-translator") }
    }
}
