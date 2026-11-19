package app.lawfive

import app.lawfive.AppGraph.Website
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SignUpTest {
    // APP-29: Create an account only where the server takes new accounts and is set up.
    @Test
    fun offeredWhereTheServerTakesNewAccounts() {
        assertTrue(Website("open").takesAccounts)
        assertTrue(Website("approval").takesAccounts)
    }

    @Test
    fun notOfferedWhereItWouldFail() {
        assertFalse(Website("closed").takesAccounts)
        // A server that couldn't be asked, or an older one that doesn't say.
        assertFalse(Website().takesAccounts)
        // ADM-5: a new server's first account needs the setup code, on its website.
        assertFalse(Website("open", firstAccount = true).takesAccounts)
    }
}
