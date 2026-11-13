package app.lawfive

import app.lawfive.ui.hexToHsv
import app.lawfive.ui.hsvToHex
import app.lawfive.ui.normalHex
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// WEB-19: the custom team color picker's sums, saved as #RRGGBB.
class CustomColorTest {
    @Test
    fun `hex as typed`() {
        assertEquals("#2A9D8F", normalHex("2a9d8f"))
        assertEquals("#2A9D8F", normalHex(" #2A9D8F "))
        assertNull(normalHex("#2A9D8"))
        assertNull(normalHex("#2A9D8G"))
    }

    @Test
    fun `hue, saturation and brightness to hex`() {
        assertEquals("#FF0000", hsvToHex(0f, 1f, 1f))
        assertEquals("#00FF00", hsvToHex(120f, 1f, 1f))
        assertEquals("#0000FF", hsvToHex(240f, 1f, 1f))
        assertEquals("#FF0000", hsvToHex(360f, 1f, 1f))
        assertEquals("#FFFFFF", hsvToHex(200f, 0f, 1f))
        assertEquals("#000000", hsvToHex(200f, 1f, 0f))
    }

    @Test
    fun `every color comes back as itself`() {
        for (hex in listOf("#2A9D8F", "#D71920", "#1F2A44", "#FFD100", "#808080", "#000000", "#FFFFFF", "#6A2C91")) {
            val (h, s, v) = hexToHsv(hex)!!
            assertEquals(hex, hsvToHex(h, s, v))
        }
    }
}
