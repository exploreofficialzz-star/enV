package com.chastech.env

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeAiEngineTest {
    @Test fun captionGeneratorMatchesDeterministicWebTemplates() {
        assertEquals(
            "1. AI tools for creators made simple. Save this for later.\n\n" +
                "2. If you're into AI tools for creators, this one is for you.\n\n" +
                "3. A quick reminder for creators and small businesses: you don't need to overcomplicate AI tools for creators.\n\n" +
                "4. Learning AI tools for creators one step at a time. What would you add?\n\n" +
                "5. Here's the part about AI tools for creators people usually skip.",
            NativeAiEngine.localCaption(mapOf("topic" to "AI tools for creators", "audience" to "creators and small businesses", "count" to 5))
        )
    }

    @Test fun promptGeneratorMatchesDeterministicWebTemplate() {
        val output = NativeAiEngine.localPrompt(mapOf("task" to "Create a launch plan for a digital product", "audience" to "creators and small businesses", "tone" to "natural"))
        assertEquals("ROLE\nYou are a helpful specialist supporting creators and small businesses.\n\nTASK\nCreate a launch plan for a digital product.\n\nSTYLE\nUse a natural and conversational style.\n\nCONTEXT\nFocus on practical, accurate output. Avoid unnecessary filler and clearly state assumptions.\n\nOUTPUT\nReturn a useful, structured answer with headings or bullets where they improve readability.\n\nCHECK\nBefore answering, verify that the response directly addresses the task and is suitable for creators and small businesses.", output)
    }

    @Test fun bioGeneratorMatchesDeterministicWebTemplates() {
        val output = NativeAiEngine.localBio(mapOf("role" to "AI music creator", "audience" to "creators and small businesses", "count" to 5))
        assertEquals("1. AI music creator | Helping creators and small businesses learn, create & grow.\n\n2. AI music creator • your topic • Building in public.\n\n3. Creating around your topic. Sharing what I learn along the way.\n\n4. AI music creator | Making your topic easier to understand.\n\n5. AI music creator focused on practical ideas for creators and small businesses.", output)
    }

    @Test fun titleGeneratorMatchesDeterministicWebTemplates() {
        val output = NativeAiEngine.localTitle(mapOf("topic" to "AI tools for creators", "audience" to "creators and small businesses", "count" to 8))
        assertEquals("1. AI tools for creators: What creators and small businesses Should Know\n\n2. How to Get Better Results With AI tools for creators\n\n3. The Simple Guide to AI tools for creators\n\n4. I Tried AI tools for creators — Here’s What I Learned\n\n5. AI tools for creators Explained Without the Jargon\n\n6. 5 Things creators and small businesses Should Know About AI tools for creators\n\n7. Before You Start With AI tools for creators, Read This\n\n8. A Practical AI tools for creators Guide for creators and small businesses", output)
    }

    @Test fun productDescriptionMatchesDeterministicWebTemplate() {
        val output = NativeAiEngine.localProduct(mapOf("product" to "AI Music Generator Class", "features" to "Beginner friendly\nWorks from a smartphone\nUses accessible tools", "audience" to "creators and small businesses", "tone" to "natural"))
        assertEquals("AI Music Generator Class\n\nA practical option for creators and small businesses who want a simple way to get started.\n\nKey benefits:\n• Beginner friendly\n• Works from a smartphone\n• Uses accessible tools\n\nPositioning style: natural and conversational.\n\nCTA: Get started and see what AI Music Generator Class can help you create.", output)
    }

    @Test fun ideaGeneratorMatchesDeterministicWebTemplates() {
        val output = NativeAiEngine.localIdea(mapOf("topic" to "AI tools for creators", "audience" to "creators and small businesses"))
        assertEquals("1. How-to: AI tools for creators for creators and small businesses\n\n2. Common mistake: AI tools for creators\n\n3. Case study: a real example of AI tools for creators\n\n4. Checklist: getting started with AI tools for creators\n\n5. Myth vs fact: AI tools for creators\n\n6. Quick tips: AI tools for creators\n\n7. Beginner guide: AI tools for creators\n\n8. Behind the scenes: working on AI tools for creators", output)
    }

    @Test fun resumeBulletGeneratorMatchesDeterministicWebTemplates() {
        val output = NativeAiEngine.localResume(mapOf("duty" to "Managed social media content and improved engagement", "result" to "increased engagement"))
        assertEquals("1. Managed social media content and improved engagement, contributing to increased engagement.\n\n2. Led Managed social media content and improved engagement and delivered measurable progress toward increased engagement.\n\n3. Executed Managed social media content and improved engagement, helping the team achieve increased engagement.\n\n4. Owned Managed social media content and improved engagement with a focus on increased engagement.", output)
    }

    @Test fun rewriteHelperMatchesDeterministicWebTemplate() {
        val output = NativeAiEngine.localRewrite(mapOf("text" to "We are launching a new product that helps people create useful content faster.", "tone" to "natural"))
        assertEquals("Rewritten in a natural and conversational tone:\n\nWe are launching a new product that helps people create useful content faster.\n\nEdit for clarity, natural flow, and consistent tone before publishing.", output)
    }

    @Test fun emailDraftMatchesDeterministicWebTemplate() {
        val output = NativeAiEngine.localEmail(mapOf("purpose" to "Introduce a new digital product", "points" to "What it does\nWho it is for\nHow to get started"))
        assertTrue(output.startsWith("Subject: Introduce a new digital product\n\nHi,"))
        assertTrue(output.contains("• What it does\n• Who it is for\n• How to get started"))
    }

    @Test fun metaDescriptionMatchesDeterministicWebTemplate() {
        val output = NativeAiEngine.localMeta(mapOf("topic" to "AI tools for creators", "page" to "Explain the product, key benefits, and how visitors can get started."))
        assertEquals("AI tools for creators — Explain the product, key benefits, and how visitors can get started. Start here for a concise overview and useful guidance.", output)
    }

    @Test fun socialHookMatchesDeterministicWebTemplates() {
        val output = NativeAiEngine.localHook(mapOf("topic" to "AI tools for creators", "audience" to "creators and small businesses"))
        assertEquals("1. Most people overcomplicate AI tools for creators.\n\n2. Before you try AI tools for creators, know this.\n\n3. Here's what I wish I knew about AI tools for creators.\n\n4. If you're a creators and small businesses, save this.\n\n5. The simple way to approach AI tools for creators.", output)
    }

    @Test fun promptImproverMatchesDeterministicWebTemplate() {
        val output = NativeAiEngine.localImprover(mapOf("task" to "Write a good social media post about my product.", "audience" to "creators and small businesses", "tone" to "natural"))
        assertEquals("Improved prompt:\n\nRewrite the following request into a precise, natural and conversational instruction for an AI assistant serving creators and small businesses. Preserve the original intent, add useful context placeholders where information is missing, specify the desired output format, and avoid inventing facts.\n\nOriginal request:\nWrite a good social media post about my product.\n\nSuggested output format:\n1. Goal\n2. Context\n3. Constraints\n4. Tone\n5. Deliverable\n6. Quality checks", output)
    }
}
