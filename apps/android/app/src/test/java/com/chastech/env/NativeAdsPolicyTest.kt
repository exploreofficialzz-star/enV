package com.chastech.env

import com.chastech.env.data.EngineInfo
import com.chastech.env.data.ToolRecord
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeAdsPolicyTest {
    private fun tool(
        id: String = "video-settings",
        name: String = "Video Settings",
        description: String = "Configure local playback settings.",
        category: String = "video",
        tags: List<String> = emptyList(),
        keywords: List<String> = emptyList(),
    ) = ToolRecord(
        id = id,
        name = name,
        slug = id,
        description = description,
        category = category,
        keywords = keywords,
        tags = tags,
        icon = "Video",
        popularity = 0,
        featured = false,
        clientSide = true,
        requiresBackend = false,
        requiresAuth = false,
        status = "active",
        related = emptyList(),
        engine = EngineInfo(type = "video", id = id),
    )

    @Test
    fun standardLocalToolsRemainEligible() {
        assertTrue(NativeAdsPolicy.isAdEligibleTool(tool()))
    }

    @Test
    fun studioLabAndSandboxExperiencesNeverQualify() {
        assertFalse(NativeAdsPolicy.isAdEligibleTool(tool(category = "studio")))
        assertFalse(NativeAdsPolicy.isAdEligibleTool(tool(category = "labs")))
        assertFalse(NativeAdsPolicy.isAdEligibleTool(tool(description = "A sandbox for local experiments.")))
        assertFalse(NativeAdsPolicy.isAdEligibleTool(tool(description = "A laboratory for video processing.")))
    }

    @Test
    fun premiumAndFrontierClassificationsAreCheckedAcrossMetadata() {
        assertFalse(NativeAdsPolicy.isAdEligibleTool(tool(description = "High-end video rendering.")))
        assertFalse(NativeAdsPolicy.isAdEligibleTool(tool(description = "Premium video processing.")))
        assertFalse(NativeAdsPolicy.isAdEligibleTool(tool(tags = listOf("frontier"))))
        assertFalse(NativeAdsPolicy.isAdEligibleTool(tool(keywords = listOf("frontier model"))))
    }
}
