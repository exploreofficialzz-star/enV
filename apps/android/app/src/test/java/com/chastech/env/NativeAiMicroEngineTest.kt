package com.chastech.env

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeAiMicroEngineTest {
    @Test fun supportsOnlyTheExactThirteenToolIds() {
        val ids = listOf(
            "ai-meeting-agenda-generator", "blog-outline-generator", "call-to-action-generator", "expand-helper",
            "faq-generator", "feature-benefit-generator", "meeting-action-items", "product-title-generator",
            "pros-cons-generator", "shorten-helper", "tiktok-caption-helper", "youtube-description-helper", "youtube-title-helper",
        )
        assertEquals(13, ids.count { NativeAiMicroEngine.supports(it) })
        assertFalse(NativeAiMicroEngine.supports("youtube-title-generator"))
        assertFalse(NativeAiMicroEngine.supports("blog-outline-generator-extra"))
    }

    @Test fun nativeFieldsExposeTheSameNewInputsAsWeb() {
        assertEquals("60", NativeAiMicroEngine.initialValues("shorten-helper")["count"])
        assertEquals("30", NativeAiMicroEngine.initialValues("ai-meeting-agenda-generator")["duration"])
        assertTrue(NativeAiMicroEngine.fields("expand-helper").first().multiline)
        assertTrue(NativeAiMicroEngine.fields("faq-generator").any { it.name == "answers" })
        assertTrue(NativeAiMicroEngine.fields("feature-benefit-generator").any { it.name == "outcomes" })
        assertTrue(NativeAiMicroEngine.fields("youtube-description-helper").any { it.name == "chapters" })
        assertEquals(emptyList<NativeAiMicroField>(), NativeAiMicroEngine.fields("not-an-ai-tool"))
    }

    @Test fun blogOutlineIncludesEditorialBriefAndVerifiedInputs() {
        val output = NativeAiMicroEngine.generate("blog-outline-generator", mapOf(
            "topic" to "Urban gardening", "audience" to "apartment renters", "goal" to "Help readers grow herbs",
            "angle" to "Low-cost methods for small spaces", "keyPoints" to "Use containers\nCheck sunlight",
            "cta" to "Start with one herb pot",
        ))
        assertTrue(output.contains("CONTENT BRIEF"))
        assertTrue(output.contains("Low-cost methods for small spaces"))
        assertTrue(output.contains("Use containers\nCheck sunlight"))
        assertTrue(output.contains("Start with one herb pot"))
        assertTrue(output.contains("do not present assumptions as evidence"))
    }

    @Test fun ctaUsesTheRequestedActionAndFlagsMissingBenefits() {
        val output = NativeAiMicroEngine.generate("call-to-action-generator", mapOf(
            "topic" to "Meal prep", "audience" to "busy students", "action" to "Download the planner", "benefit" to "plan meals in one place",
        ))
        assertTrue(output.contains("Download the planner to plan meals in one place"))
        assertTrue(NativeAiMicroEngine.generate("call-to-action-generator", mapOf("topic" to "Meal prep")).contains("Add a specific, supportable benefit"))
    }

    @Test fun expandUsesSuppliedContextAndDoesNotInventExamples() {
        val output = NativeAiMicroEngine.generate("expand-helper", mapOf(
            "text" to "A useful idea", "audience" to "new growers", "context" to "Small spaces make growing food feel difficult.",
            "example" to "A pot of basil beside a bright window.", "nextStep" to "Choose one herb to grow.",
        ))
        assertTrue(output.contains("WHY IT MATTERS\nSmall spaces make growing food feel difficult."))
        assertTrue(output.contains("WHO IT AFFECTS\nWrite for: new growers"))
        assertTrue(output.contains("A pot of basil beside a bright window."))
        assertTrue(output.contains("Choose one herb to grow."))
        assertFalse(output.contains("[Add a real example"))
        assertTrue(NativeAiMicroEngine.generate("expand-helper", mapOf("text" to " ")).contains("Add the text or notes"))
    }

    @Test fun faqUsesExactSuppliedAnswersAndFlagsMissingAnswers() {
        val output = NativeAiMicroEngine.generate("faq-generator", mapOf(
            "topic" to "Meal prep", "audience" to "students", "points" to "How long does it keep?\nCan I freeze it?",
            "answers" to "How long does it keep? | Refrigerated meals should be used within the safe storage window for their ingredients.",
        ))
        assertTrue(output.contains("A: Refrigerated meals should be used within the safe storage window"))
        assertTrue(output.contains("Can I freeze it?\nA: [Add a verified answer before publishing.]"))
        assertTrue(output.contains("NEEDS AN ANSWER"))
    }

    @Test fun featureBenefitRequiresSpecificOutcomesAndEvidence() {
        val output = NativeAiMicroEngine.generate("feature-benefit-generator", mapOf(
            "audience" to "teams", "benefit" to "Shared workspace\nFast search", "outcomes" to "Everyone works from the same project view",
        ))
        assertTrue(output.contains("Customer outcome: Everyone works from the same project view"))
        assertTrue(output.contains("Feature: Fast search\nCustomer outcome: [Add the specific result"))
        assertTrue(output.contains("Evidence to support the claim"))
    }

    @Test fun agendaDistributesTimeAcrossTopics() {
        val output = NativeAiMicroEngine.generate("ai-meeting-agenda-generator", mapOf(
            "goal" to "Choose a launch date", "duration" to "30", "topics" to "Progress\nDecision",
        ))
        assertTrue(output.contains("Planned duration: 30 minutes"))
        assertTrue(output.contains("1. Progress — 15 min\n2. Decision — 15 min"))
        assertTrue(output.contains("Confirm decisions, owners, deadlines"))
    }

    @Test fun meetingActionsParseOwnersDatesAndPriorityWithoutInventingStatus() {
        val output = NativeAiMicroEngine.generate("meeting-action-items", mapOf(
            "notes" to "Sam | Draft launch brief | Friday | High\nLee | Review pricing | Monday | Medium",
        ))
        assertTrue(output.contains("Owner: Sam | Action: Draft launch brief | Due: Friday | Priority: High"))
        assertTrue(output.contains("Status has not been inferred"))
        val incomplete = NativeAiMicroEngine.generate("meeting-action-items", mapOf("notes" to "Finish the landing page"))
        assertTrue(incomplete.contains("[Assign owner]"))
        assertTrue(incomplete.contains("[Add due date]"))
    }

    @Test fun productTitleUsesKeywordBenefitAndCustomer() {
        val output = NativeAiMicroEngine.generate("product-title-generator", mapOf(
            "topic" to "Focus app", "keyword" to "Daily planner", "benefit" to "Plan a calmer day", "audience" to "remote teams",
        ))
        assertTrue(output.contains("Daily planner — Plan a calmer day"))
        assertTrue(output.contains("The Daily planner guide for remote teams"))
    }

    @Test fun prosConsSeparatesSuppliedEvidenceFromAssumptions() {
        val output = NativeAiMicroEngine.generate("pros-cons-generator", mapOf(
            "option" to "Launch now vs wait", "upsides" to "Reach early users", "risks" to "Support load may increase", "criteria" to "Weekly active use",
        ))
        assertTrue(output.contains("UPSIDE TO VERIFY\n• Reach early users"))
        assertTrue(output.contains("RISKS / COSTS TO CHECK\n• Support load may increase"))
        assertTrue(output.contains("DECISION CRITERIA\n• Weekly active use"))
        assertTrue(output.contains("Separate measured results from assumptions"))
    }

    @Test fun shortenHonorsTargetAndPreservesSentenceBoundariesAndUnicode() {
        val source = "Our tool helps teams manage projects. It keeps deadlines visible. It stores files securely. It sends weekly reminders."
        assertEquals(
            "Our tool helps teams manage projects. It keeps deadlines visible…",
            NativeAiMicroEngine.generate("shorten-helper", mapOf("text" to source, "count" to "10")),
        )
        assertEquals("Café déjà vu", NativeAiMicroEngine.generate("shorten-helper", mapOf("text" to "Café déjà vu", "count" to "60")))
        assertTrue(NativeAiMicroEngine.generate("shorten-helper", mapOf("text" to " ")).contains("Add the text you want to shorten"))
    }

    @Test fun tiktokCaptionsHonorCountHookAndCallToAction() {
        val output = NativeAiMicroEngine.generate("tiktok-caption-helper", mapOf(
            "topic" to "Quiet mornings", "audience" to "students", "hook" to "One habit to try",
            "cta" to "Save this checklist", "count" to "2",
        ))
        assertEquals(2, output.split("\n\n").size)
        assertTrue(output.contains("One habit to try: Quiet mornings. Save this checklist"))
    }

    @Test fun youtubeDescriptionIncludesSuppliedChaptersLinksAndNextStep() {
        val output = NativeAiMicroEngine.generate("youtube-description-helper", mapOf(
            "topic" to "Urban gardening", "audience" to "beginners", "tone" to "professional", "points" to "Tools\nPlanning",
            "chapters" to "0:00 Introduction\n1:20 Choose a container", "links" to "https://example.com/guide",
            "cta" to "Subscribe for the next lesson",
        ))
        assertTrue(output.contains("WHAT YOU'LL LEARN"))
        assertTrue(output.contains("CHAPTERS\n0:00 Introduction\n1:20 Choose a container"))
        assertTrue(output.contains("LINKS / RESOURCES\nhttps://example.com/guide"))
        assertTrue(output.contains("Subscribe for the next lesson"))
    }

    @Test fun youtubeTitlesRespectOneHundredCharacterLimit() {
        val output = NativeAiMicroEngine.generate("youtube-title-helper", mapOf(
            "topic" to "Learning SQL", "audience" to "analysts", "keyword" to "SQL reporting",
            "angle" to "a practical guide to advanced reporting", "count" to "8",
        ))
        val titles = output.split("\n\n").map { it.replace(Regex("^\\d+\\.\\s"), "") }
        assertEquals(8, titles.size)
        assertTrue(titles.all { it.length <= 100 })
    }
}
