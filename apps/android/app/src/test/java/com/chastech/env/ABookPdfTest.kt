package com.chastech.env

import org.junit.Assert.assertEquals
import org.junit.Test

class ABookPdfTest {
    @Test
    fun pageSelectionPreservesRequestedOrder() {
        assertEquals(listOf(3, 1, 2), parseABookPageSelection("3,1-2", 4))
    }

    @Test(expected = IllegalArgumentException::class)
    fun pageSelectionRejectsDuplicatePages() {
        parseABookPageSelection("1-3,3", 4)
    }

    @Test(expected = IllegalArgumentException::class)
    fun pageSelectionRejectsOutOfRangePages() {
        parseABookPageSelection("1-5", 4)
    }

    @Test
    fun pageGroupsSeparatePartsAndPreserveOrder() {
        assertEquals(listOf(listOf(3, 1), listOf(4, 5)), parseABookPageGroups("3,1;4-5", 5))
    }

    @Test(expected = IllegalArgumentException::class)
    fun pageGroupsRejectPagesAssignedToTwoParts() {
        parseABookPageGroups("1-3;3-4", 5)
    }

    @Test(expected = IllegalArgumentException::class)
    fun pageGroupsRejectMissingParts() {
        parseABookPageGroups("1-3", 5)
    }
}
