package app.lawfive

import app.lawfive.data.TIP_CHANCE
import app.lawfive.data.chooseTip
import app.lawfive.data.tips
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TipsTest {
    /** A random that gives these numbers in turn. */
    private fun rolls(vararg numbers: Double): () -> Double {
        val left = numbers.iterator()
        return { left.next() }
    }

    @Test
    fun comesUpOnlyWithinItsChance() {
        assertNull(chooseTip(emptySet(), 5, rolls(TIP_CHANCE)))
        assertNull(chooseTip(emptySet(), 5, rolls(0.99)))
        assertEquals(tips[0], chooseTip(emptySet(), 5, rolls(TIP_CHANCE - 0.001, 0.0)))
    }

    @Test
    fun aDismissedTipDoesNotComeBack() {
        assertEquals(tips[1], chooseTip(setOf(tips[0].id), 5, rolls(0.0, 0.0)))
        assertNull(chooseTip(tips.map { it.id }.toSet(), 5, rolls(0.0, 0.0)))
    }

    @Test
    fun tipsAboutAPlayedMatchWaitForOne() {
        val early = tips.filter { !it.afterPlaying }.map { it.id }.toSet()
        assertNull(chooseTip(early, 0, rolls(0.0, 0.0)))
        assertTrue(chooseTip(early, 1, rolls(0.0, 0.0))!!.afterPlaying)
    }
}
