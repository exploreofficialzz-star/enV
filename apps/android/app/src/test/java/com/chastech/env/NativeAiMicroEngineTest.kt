package com.chastech.env

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeAiMicroEngineTest {
    @Test fun supportsOnlyTheExactThirteenWebOnlyIds() {
        val ids = listOf(
            "ai-meeting-agenda-generator", "blog-outline-generator", "call-to-action-generator", "expand-helper",
            "faq-generator", "feature-benefit-generator", "meeting-action-items", "product-title-generator",
            "pros-cons-generator", "shorten-helper", "tiktok-caption-helper", "youtube-description-helper", "youtube-title-helper",
        )
        assertEquals(13, ids.count { NativeAiMicroEngine.supports(it) })
        assertFalse(NativeAiMicroEngine.supports("youtube-title-generator"))
        assertFalse(NativeAiMicroEngine.supports("blog-outline-generator-extra"))
    }

    @Test fun fieldDefaultsMatchTheWebForms() {
        assertEquals("5", NativeAiMicroEngine.initialValues("tiktok-caption-helper")["count"])
        assertEquals("8", NativeAiMicroEngine.initialValues("youtube-title-helper")["count"])
        assertEquals("Progress\nBlockers\nDecisions\nNext steps", NativeAiMicroEngine.initialValues("ai-meeting-agenda-generator")["topics"])
        assertTrue(NativeAiMicroEngine.fields("expand-helper").single().multiline)
        assertEquals(emptyList<NativeAiMicroField>(), NativeAiMicroEngine.fields("not-an-ai-tool"))
    }

    @Test fun blogOutlineMatchesWebTemplate() {
        assertEquals("Title: Gardening\nAudience: new growers\nGoal: Build confidence\n\nOutline\n1. Introduction — the problem and why it matters\n2. What Gardening means\n3. The key ideas new growers should understand\n4. Practical steps or examples\n5. Common mistakes to avoid\n6. Checklist / next steps\n7. Conclusion and CTA", NativeAiMicroEngine.generate("blog-outline-generator", mapOf("topic" to "Gardening", "audience" to "new growers", "goal" to "Build confidence")))
    }

    @Test fun callToActionMatchesWebTemplate() {
        assertEquals("1. Get started with Meal prep\n\n2. Try Meal prep today\n\n3. See how Meal prep can help\n\n4. Learn more about Meal prep\n\n5. Start creating with Meal prep", NativeAiMicroEngine.generate("call-to-action-generator", mapOf("topic" to "Meal prep")))
    }

    @Test fun expandMatchesWebTemplateAndFallback() {
        assertEquals("A useful idea.\n\nKey context: explain why this matters, who it affects, and what should happen next. Add one practical example and finish with a clear next step.", NativeAiMicroEngine.generate("expand-helper", mapOf("text" to "A useful idea")))
        assertTrue(NativeAiMicroEngine.generate("expand-helper", mapOf("text" to " ")).startsWith("Your notes."))
    }

    @Test fun faqSplitsAndTrimsPoints() {
        assertEquals("Q: Storage about Meal prep?\nA: Explain storage in a concise, factual way for students.\n\nQ: Cost about Meal prep?\nA: Explain cost in a concise, factual way for students.", NativeAiMicroEngine.generate("faq-generator", mapOf("topic" to "Meal prep", "audience" to "students", "points" to "Storage\n, Cost, ")))
    }

    @Test fun featureBenefitHandlesCommaAndNewlineLists() {
        assertEquals("Feature: Shared workspace\nBenefit: Helps teams get a clearer result with less friction.\n\nFeature: Fast search\nBenefit: Helps teams get a clearer result with less friction.\n\nFeature: Version history\nBenefit: Helps teams get a clearer result with less friction.", NativeAiMicroEngine.generate("feature-benefit-generator", mapOf("audience" to "teams", "benefit" to "Shared workspace,Fast search\nVersion history")))
    }

    @Test fun agendaNumbersTopicsAndAddsCloseOutReminder() {
        assertEquals("Meeting goal: Choose a launch date\n\nAgenda\n1. Progress\n2. Blockers\n3. Decision\n\nClose with owners, deadlines, and unresolved questions.", NativeAiMicroEngine.generate("ai-meeting-agenda-generator", mapOf("goal" to "Choose a launch date", "topics" to "Progress\nBlockers, Decision")))
    }

    @Test fun meetingActionsIgnoreBlankLinesAndNumberNotes() {
        assertEquals("Action items\n1. Sam — draft\n2. Lee — review\n\nBefore sharing, confirm each owner and deadline.", NativeAiMicroEngine.generate("meeting-action-items", mapOf("notes" to "Sam — draft\n\nLee — review")))
    }

    @Test fun productTitleUsesBenefitAndEmitsFiveOptions() {
        assertEquals("1. Focus app — Plan a calmer day\n\n2. Focus app: Plan a calmer day\n\n3. The Focus app Starter Guide\n\n4. Focus app Made Simple\n\n5. Focus app Toolkit", NativeAiMicroEngine.generate("product-title-generator", mapOf("topic" to "Focus app", "benefit" to "Plan a calmer day")))
    }

    @Test fun prosConsIncludesVerificationQuestions() {
        val output = NativeAiMicroEngine.generate("pros-cons-generator", mapOf("topic" to "Pilot a new workflow", "option" to "Launch now vs wait"))
        assertTrue(output.startsWith("Decision worksheet: Launch now vs wait"))
        assertTrue(output.contains("Potential upside: Pilot a new workflow may help achieve the stated goal."))
        assertTrue(output.contains("What would make you stop or change direction?"))
    }

    @Test fun shortenUsesTwentyEightWordsAndKeepsShortUnicodeText() {
        val input = (1..29).joinToString(" ") { "word$it" }
        val expected = (1..28).joinToString(" ") { "word$it" } + "…"
        assertEquals(expected, NativeAiMicroEngine.generate("shorten-helper", mapOf("text" to input)))
        assertEquals("Café déjà vu", NativeAiMicroEngine.generate("shorten-helper", mapOf("text" to "Café déjà vu")))
    }

    @Test fun tiktokCaptionHonorsVariantCount() {
        assertEquals("1. Quiet mornings made simple. Save this for later.\n\n2. If you're into Quiet mornings, this one is for you.", NativeAiMicroEngine.generate("tiktok-caption-helper", mapOf("topic" to "Quiet mornings", "audience" to "students", "count" to "2")))
    }

    @Test fun youtubeDescriptionUsesToneAndKeyPoints() {
        assertEquals("Urban gardening\n\nIn this video, we break down Urban gardening for beginners in a clear and professional way.\n\nWhat you'll cover:\n• Tools\n• Planning\n• Harvest\n\nIf you found this useful, save it for later and share it with someone working on the same goal.", NativeAiMicroEngine.generate("youtube-description-helper", mapOf("topic" to "Urban gardening", "audience" to "beginners", "tone" to "professional", "points" to "Tools\nPlanning,Harvest")))
    }

    @Test fun youtubeTitleCountIsClampedAndInvalidValuesUseDefault() {
        assertEquals("1. Learning SQL: What analysts Should Know\n\n2. How to Get Better Results With Learning SQL", NativeAiMicroEngine.generate("youtube-title-helper", mapOf("topic" to "Learning SQL", "audience" to "analysts", "count" to "2")))
        assertEquals(5, NativeAiMicroEngine.generate("youtube-title-helper", mapOf("topic" to "SQL", "audience" to "learners", "count" to "not-a-number")).split("\n\n").size)
    }
}
