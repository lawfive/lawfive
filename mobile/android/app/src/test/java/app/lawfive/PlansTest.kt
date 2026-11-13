package app.lawfive

import app.lawfive.data.PlanLine
import app.lawfive.data.planEnd
import app.lawfive.data.planLines
import app.lawfive.schema.AccountPlan
import app.lawfive.schema.PlanLimits
import app.lawfive.schema.PlanName
import app.lawfive.schema.PlanUsage
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// PLAN-6: the account's plan in the same words as the website's Settings.
class PlansTest {
    private val usage = PlanUsage(matches = 40, referees = 3, venues = 2, storageMb = 512.5, devices = 1, pushPerDay = 0, apiKeys = 0, apiCallsPerDay = 12, webhooks = 0)
    private fun plan(limits: PlanLimits, endsOn: String? = null) =
        AccountPlan(PlanName("pro", "Pro"), limits, "2026-11-02T10:00:00Z", endsOn = endsOn, then = endsOn?.let { PlanName("free", "Free") }, usage = usage)

    @Test
    fun `the limits a plan sets, and storage always`() {
        val lines = planLines(plan(PlanLimits(matches = 50, storageMb = 2048, webhooks = 0, apiCallsPerMinute = 120)))
        assertEquals(
            listOf(
                PlanLine("Matches", "40", "of 50", 0.8),
                PlanLine("Photos and tracks", "512.5 MB", "of 2 GB", 512.5 / 2048),
                PlanLine("API requests a minute", "120", "at most", null),
                PlanLine("Webhooks", "0", "of none", 1.0),
            ),
            lines,
        )
        assertEquals(listOf(PlanLine("Photos and tracks", "512.5 MB", null, null)), planLines(plan(PlanLimits())))
    }

    @Test
    fun `when a plan ends, and what follows`() {
        assertEquals("Until Sun, Nov 8, then Free", planEnd(plan(PlanLimits(), "2026-11-08"), LocalDate.of(2026, 11, 2)))
        assertEquals("Until Fri, Jan 8, 2027, then Free", planEnd(plan(PlanLimits(), "2027-01-08"), LocalDate.of(2026, 11, 2)))
        assertNull(planEnd(plan(PlanLimits())))
    }
}
