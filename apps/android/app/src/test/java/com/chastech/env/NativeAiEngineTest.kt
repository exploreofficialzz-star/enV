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
}
