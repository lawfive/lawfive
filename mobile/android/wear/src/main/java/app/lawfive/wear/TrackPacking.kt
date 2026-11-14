package app.lawfive.wear

import kotlinx.serialization.Serializable

// TRK-7: a match's track as the Garmin watch packs it (watch-garmin/source/TrackLog.mc), so the server
// reads every watch's the same way (server/src/watchTrack.ts). Each sample is "dt,dlat,dlon,speed,hr;":
//   dt          tenths of a second since the sample before (empty for exactly one second); a chunk's
//               first sample counts from the track's start;
//   dlat, dlon  millionths of a degree moved since the chunk's previous position (a chunk's first
//               position is whole); empty without a new fix;
//   speed       the speed the watch measured, in cm/s;
//   hr          beats a minute.
// Empty fields are unknown, and trailing ones are left off.

/** One chunk being filled: up to [SAMPLES] samples, about five minutes. */
@Serializable
data class TrackChunk(val text: String = "", val count: Int = 0, val lastTDs: Int = 0, val lastLat: Int? = null, val lastLon: Int? = null) {
    val isFull get() = count >= SAMPLES

    /**
     * This chunk with a sample at [tDs] tenths of a second after the track's start, positions in
     * millionths of a degree and speed in cm/s; null when there's nothing to keep (no position and no
     * heart rate) or it's no later than the one before.
     */
    fun add(tDs: Int, lat: Int?, lon: Int?, speed: Int?, hr: Int?): TrackChunk? {
        if (lat == null && hr == null) return null
        if (tDs <= lastTDs && count > 0) return null
        val moved = lat != null && lon != null
        return TrackChunk(
            text + encode(tDs - lastTDs, lat, lon, lastLat, lastLon, speed, hr), count + 1, tDs,
            if (moved) lat else lastLat, if (moved) lon else lastLon,
        )
    }

    companion object {
        const val SAMPLES = 300

        /** One sample as text, "dt,dlat,dlon,speed,hr;", without trailing empty fields. */
        fun encode(dt: Int, lat: Int?, lon: Int?, lastLat: Int?, lastLon: Int?, speed: Int?, hr: Int?): String {
            val fields = mutableListOf(if (dt == 10) "" else "$dt", "", "", "", "")
            if (lat != null && lon != null) {
                fields[1] = "${if (lastLat != null) lat - lastLat else lat}"
                fields[2] = "${if (lastLon != null) lon - lastLon else lon}"
                if (speed != null) fields[3] = "$speed"
            }
            if (hr != null) fields[4] = "$hr"
            while (fields.size > 1 && fields.last().isEmpty()) fields.removeAt(fields.size - 1)
            return fields.joinToString(",") + ";"
        }
    }
}

/** A finished track waiting to go up, a chunk a request (POST /v1/watch/tracks). */
@Serializable
data class TrackUpload(val created: Long, val start: Long, val count: Int, val next: Int = 0)

/**
 * SYNC-7: the distance covered, worked out from the positions taken during play where the watch's exercise doesn't
 * measure it (WCH-7). Each step between good positions counts as the server's track summary counts one (schema/src/track.ts,
 * summarizeTrack): no more than 15 s apart, so a break or a suspension isn't a step, and no faster than any referee.
 * A position worse than GPS ready's 25 m isn't one to step from or to, so its jump adds nothing. Times are the track's,
 * in tenths of a second; positions in millionths of a degree, as the track packs them.
 */
@Serializable
data class Covered(val meters: Double = 0.0, val lastTDs: Int? = null, val lastLat: Int? = null, val lastLon: Int? = null) {
    /** With a position at [tDs], its accuracy in meters when the watch gives one. */
    fun add(tDs: Int, lat: Int, lon: Int, accuracy: Double?): Covered {
        if (accuracy != null && accuracy > GPS_USABLE_M) return this
        val step = if (lastTDs != null && lastLat != null && lastLon != null) {
            val sec = (tDs - lastTDs) / 10.0
            val moved = metersBetween(lastLat / 1e6, lastLon / 1e6, lat / 1e6, lon / 1e6)
            if (sec > 0 && sec <= GAP_SEC && moved / sec <= MAX_SPEED_MPS) moved else 0.0
        } else 0.0
        return Covered(meters + step, tDs, lat, lon)
    }

    companion object {
        /** The server's trackRules: gapMs and maxSpeedMps. */
        const val GAP_SEC = 15.0
        const val MAX_SPEED_MPS = 10.0
    }
}

/** ACT-5: a position within this, Garmin's "usable" (as Mark pitch's, TRK-13, and the Apple Watch's), says GPS ready. */
const val GPS_USABLE_M = 25.0

/** Meters between two positions in degrees: the server's flat-earth maths (metresBetween), accurate over a pitch. */
fun metersBetween(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val radians = Math.PI / 180
    val x = (lon2 - lon1) * radians * Math.cos((lat1 + lat2) / 2 * radians)
    val y = (lat2 - lat1) * radians
    return Math.hypot(x, y) * 6_371_008.8
}
