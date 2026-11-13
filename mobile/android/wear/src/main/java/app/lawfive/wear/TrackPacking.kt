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
