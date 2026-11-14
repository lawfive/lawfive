package app.lawfive.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// SYNC-7, WCH-7: the distance worked out from the positions where the watch's soccer exercise doesn't measure it, counted
// as the server's track summary counts it (schema/src/track.ts).

class CoveredTest {
    /** Millionths of a degree north for about [meters] (a degree of latitude is 111.2 km). */
    private fun north(meters: Double) = Math.round(meters / 111_195.0 * 1_000_000).toInt()
    private val lat0 = 51_500_000
    private val lon0 = -100_000

    @Test fun stepsBetweenGoodFixesAddUp() {
        // Four meters a second for 10 s, a fix a second.
        var c = Covered()
        for (i in 0..10) c = c.add(i * 10, lat0 + north(4.0 * i), lon0, 5.0)
        assertEquals(40.0, c.meters, 0.5)
    }

    @Test fun aPoorFixIsSteppedOver() {
        // The middle fix is 80 m off with 40 m accuracy: its jump adds nothing, and the step goes from the fix before to the one after.
        val c = Covered().add(0, lat0, lon0, 5.0).add(10, lat0 + north(80.0), lon0, 40.0).add(20, lat0 + north(6.0), lon0, 8.0)
        assertEquals(6.0, c.meters, 0.2)
    }

    @Test fun gapsAndImpossibleSpeedsAreNotSteps() {
        // A break: 20 s between fixes is a gap, as on the server (15 s).
        assertEquals(0.0, Covered().add(0, lat0, lon0, 5.0).add(200, lat0 + north(30.0), lon0, 5.0).meters, 0.0)
        // 15 m in a second is faster than any referee (10 m/s).
        assertEquals(0.0, Covered().add(0, lat0, lon0, 5.0).add(10, lat0 + north(15.0), lon0, 5.0).meters, 0.0)
        // Health Services' positions come without an accuracy, and count.
        assertEquals(5.0, Covered().add(0, lat0, lon0, null).add(10, lat0 + north(5.0), lon0, null).meters, 0.2)
    }

    @Test fun noPositionNoDistance() {
        assertNull(Covered().lastTDs)
        assertNull(Covered().add(0, lat0, lon0, 30.0).lastTDs)
    }

    @Test fun metersAsTheServerWorksThemOut() {
        // A degree of longitude at 60° north is half a degree at the equator.
        assertEquals(55_597.0, metersBetween(60.0, 0.0, 60.0, 1.0), 2.0)
    }
}
