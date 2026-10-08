package com.chastech.env

import org.junit.Assert.assertEquals
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
}
