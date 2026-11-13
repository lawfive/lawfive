package app.lawfive

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import app.lawfive.ui.theme.Ground
import app.lawfive.ui.theme.LawFiveColors
import app.lawfive.ui.theme.lawFiveColors
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.pow

// DESIGN.md (WEB-24): every text color is 4.5:1 or more on its real background, on the grass, a
// chalk panel and a stadium board, by day and at night; fields' borders about 3:1; white on the one
// red button.

class ContrastTest {
    private fun luminance(c: Color): Double {
        fun channel(v: Float) = if (v <= 0.03928f) v / 12.92 else ((v + 0.055) / 1.055).pow(2.4)
        return 0.2126 * channel(c.red) + 0.7152 * channel(c.green) + 0.0722 * channel(c.blue)
    }

    private fun contrast(a: Color, b: Color): Double {
        val (light, dark) = listOf(luminance(a), luminance(b)).sortedDescending()
        return (light + 0.05) / (dark + 0.05)
    }

    private val all = listOf(false, true).flatMap { dark -> Ground.entries.map { lawFiveColors(dark, it) } }

    /** What's really behind the words: a see-through token over the ground's own color. */
    private fun LawFiveColors.ground(): Color = when (ground) {
        Ground.Grass -> pitch
        Ground.Panel -> panel
        Ground.Board -> board
    }

    private fun LawFiveColors.backgrounds(): List<Color> = listOf(surface, surface2).map { it.compositeOver(ground()) } + ground()

    @Test fun wordsReadOnEveryGround() {
        for (c in all) {
            for (background in c.backgrounds()) {
                assertTrue("${c.ground} dark=${c.dark}: text ${contrast(c.text, background)}", contrast(c.text, background) >= 4.5)
            }
            // Muted and red words sit on the ground itself (on the grass, surface2 is only a hover or a well, as on the website).
            assertTrue("${c.ground} dark=${c.dark}: muted ${contrast(c.muted, c.ground())}", contrast(c.muted, c.ground()) >= 4.5)
            assertTrue("${c.ground} dark=${c.dark}: redText ${contrast(c.redText, c.ground())}", contrast(c.redText, c.ground()) >= 4.5)
            // Chips and notices are always panel-colored, wherever they sit (DESIGN.md "Chips").
            if (c.ground == Ground.Panel) {
                val red = c.redSoft.compositeOver(c.ground())
                assertTrue("dark=${c.dark}: redText on redSoft ${contrast(c.redText, red)}", contrast(c.redText, red) >= 4.5)
                val amber = c.amberSoft.compositeOver(c.ground())
                assertTrue("dark=${c.dark}: amberText on amberSoft ${contrast(c.amberText, amber)}", contrast(c.amberText, amber) >= 4.5)
            }
            assertTrue("${c.ground} dark=${c.dark}: onBrand on brand", contrast(c.onBrand, c.brand) >= 4.5)
            assertTrue("white on redStrong", contrast(Color.White, c.redStrong) >= 4.5)
            assertTrue("${c.ground} dark=${c.dark}: field borders ${contrast(c.borderInput, c.ground())}", contrast(c.borderInput, c.ground()) >= 2.9)
        }
    }

    @Test fun theBoardsWordsRead() {
        for (c in all.filter { it.ground == Ground.Board }) {
            assertTrue("muted on the board", contrast(c.onBoardMuted, c.board) >= 4.5)
            assertTrue("mint labels on the board", contrast(c.boardAccent, c.board) >= 4.5)
        }
    }

    @Test fun redWordsAreDarkerThanTheCardOnAPanel() {
        // Why redText exists: on a chalk panel by day the card's red is barely 4.5:1, so words take a darker red.
        val panel = lawFiveColors(false, Ground.Panel)
        assertTrue(contrast(panel.redText, panel.surface) > contrast(panel.red, panel.surface))
    }
}
