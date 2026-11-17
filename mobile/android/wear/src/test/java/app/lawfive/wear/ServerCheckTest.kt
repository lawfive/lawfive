package app.lawfive.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// SYNC-9: a typed server address is kept only once LawFive answers GET /v1/meta there, as on Garmin.

class ServerCheckTest {
    @Test fun lawFiveIsFound() {
        assertNull(serverProblem("LawFive", null, true))
    }

    @Test fun anythingElseThatAnswersIsNoLawFiveServer() {
        assertEquals("No LawFive server there", serverProblem(null, null, true))
        assertEquals("No LawFive server there", serverProblem("Something else", null, true))
        assertEquals("No LawFive server there", serverProblem(null, 404, true))
        assertEquals("The server said no (503)", serverProblem(null, 503, true))
    }

    @Test fun nothingAnsweringSaysSo() {
        assertEquals("Can't reach the server", serverProblem(null, null, false))
    }
}
