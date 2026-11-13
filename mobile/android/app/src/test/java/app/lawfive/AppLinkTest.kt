package app.lawfive

import app.lawfive.data.AppLink
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppLinkTest {
    private val token = "abcDEF123_-xyz789"

    @Test
    fun readsTheWebAppsQrCodes() {
        assertEquals(AppLink.SignIn("https://app.lawfive.app", "BCDF2345"), AppLink.parse("https://app.lawfive.app/get-app#BCDF2345"))
        assertEquals(AppLink.Invite("https://lawfive.example.com:8443", token), AppLink.parse("https://lawfive.example.com:8443/invite/$token"))
    }

    @Test
    fun readsLinksThatOpenTheApp() {
        assertEquals(
            AppLink.SignIn("https://api.lawfive.app", "BCDF2345"),
            AppLink.parse("lawfive://sign-in?server=https%3A%2F%2Fapi.lawfive.app&code=BCDF2345"),
        )
        assertEquals(AppLink.Invite("https://api.lawfive.app", token), AppLink.parse("lawfive://invite?server=https%3A%2F%2Fapi.lawfive.app&token=$token"))
    }

    @Test
    fun codesAreReadHoweverTheyAreTyped() {
        assertEquals("WDJBMJHT", AppLink.normaliseCode("wdjb-mjht"))
        assertEquals("WDJBMJHT", AppLink.normaliseCode(" WDJB MJHT "))
        assertNull(AppLink.normaliseCode("WDJB"))
    }

    @Test
    fun plainHttpOnlyWhenAllowed() {
        assertNull(AppLink.parse("http://192.168.1.5:3000/get-app#BCDF2345"))
        assertNull(AppLink.parse("lawfive://sign-in?server=http%3A%2F%2Fevil.example&code=BCDF2345"))
        assertEquals(AppLink.SignIn("http://192.168.1.5:3000", "BCDF2345"), AppLink.parse("http://192.168.1.5:3000/get-app#BCDF2345", allowHttp = true))
    }

    @Test
    fun refusesWhatIsNotOurs() {
        for (text in listOf(
            "", "not a link", "https://example.com/", "https://example.com/get-app", "https://example.com/get-app#short",
            "https://example.com/invite/x", "lawfive://sign-in?code=BCDF2345", "lawfive://other?server=https%3A%2F%2Fa.example&code=BCDF2345",
            "ftp://example.com/get-app#BCDF2345", "mailto:someone@example.com",
            // Reads as app.lawfive.app at a glance, but the server is evil.example.
            "https://app.lawfive.app@evil.example/get-app#BCDF2345",
            "lawfive://sign-in?server=https%3A%2F%2Fapp.lawfive.app%40evil.example&code=BCDF2345",
        )) {
            assertNull(text, AppLink.parse(text))
        }
    }
}
