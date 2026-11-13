package app.lawfive

import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import app.lawfive.data.HealthSave
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant
import java.time.ZoneOffset

// ACT-1, WCH-7: a Wear OS match as Health Connect gets it from the phone.
class HealthSaveTest {
    private fun obj(text: String) = Json.parseToJsonElement(text).jsonObject

    private val record = obj("""{"device":"wearos:SM-R860","distanceM":5400,"periods":[
        {"period":1,"startedAt":"2026-11-05T17:00:00Z","playedSec":2700},
        {"period":2,"startedAt":"2026-11-05T18:00:00Z","playedSec":2760}]}""")
    private val match = obj("""{"home":{"name":"Strikers U12","alias":"STR"},"away":{"alias":"ROV"}}""")
    private val track = obj("""{"start":"2026-11-05T17:00:00Z",
        "gps":{"t":[0,1000,2000],"lat":[40.7929,40.79291,null],"lon":[-73.9593,-73.95931,null]},
        "heartRate":{"t":[0,1000,999999999],"bpm":[140,0,150]}}""")

    @Test fun aWholeMatch() {
        val records = HealthSave.records("r1", record, match, track, withRoute = true, zone = ZoneOffset.UTC)!!
        val session = records[0] as ExerciseSessionRecord
        assertEquals(ExerciseSessionRecord.EXERCISE_TYPE_SOCCER, session.exerciseType)
        assertEquals("Ref Strikers U12 v ROV", session.title)
        assertEquals(Instant.parse("2026-11-05T17:00:00Z"), session.startTime)
        assertEquals(Instant.parse("2026-11-05T18:46:00Z"), session.endTime)
        assertEquals("r1-session", session.metadata.clientRecordId)
        // The fixes with a position, within the match.
        val route = (session.exerciseRouteResult as androidx.health.connect.client.records.ExerciseRouteResult.Data).exerciseRoute
        assertEquals(2, route.route.size)
        // Only readings that are a heart rate, within the match.
        assertEquals(listOf(140L), (records[1] as HeartRateRecord).samples.map { it.beatsPerMinute })
        assertEquals(5400.0, (records[2] as DistanceRecord).distance.inMeters, 0.1)
    }

    @Test fun withoutTheRouteOrATrack() {
        val records = HealthSave.records("r1", record, null, null, withRoute = false, zone = ZoneOffset.UTC)!!
        assertEquals("Ref HOM v AWY", (records[0] as ExerciseSessionRecord).title)
        assertEquals(2, records.size)
        assertNull(HealthSave.records("r2", obj("""{"periods":[]}"""), null, null, withRoute = true))
    }
}
