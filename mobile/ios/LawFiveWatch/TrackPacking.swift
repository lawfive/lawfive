import Foundation

// TRK-7: a match's track as the Garmin watch packs it (watch-garmin/source/TrackLog.mc), so the server
// reads every watch's the same way (server/src/watchTrack.ts). Each sample is "dt,dlat,dlon,speed,hr;":
//   dt          tenths of a second since the sample before (empty for exactly one second); a chunk's
//               first sample counts from the track's start;
//   dlat, dlon  millionths of a degree moved since the chunk's previous position (a chunk's first
//               position is whole); empty without a new fix;
//   speed       the speed the watch measured, in cm/s;
//   hr          beats a minute.
// Empty fields are unknown, and trailing ones are left off. Only Foundation, so the Mac tests run it.

/// One chunk being filled: up to `TrackChunk.samples` samples, about five minutes.
struct TrackChunk: Codable, Equatable {
    static let samples = 300

    var text = ""
    var count = 0
    var lastTDs = 0
    var lastLat: Int?
    var lastLon: Int?

    var isFull: Bool { count >= TrackChunk.samples }

    /// Adds a sample at `tDs` tenths of a second after the track's start. Positions are in millionths of
    /// a degree and speed in cm/s. A sample with neither a position nor a heart rate, or no later than
    /// the one before, is left out; returns whether it was added.
    @discardableResult
    mutating func add(tDs: Int, lat: Int?, lon: Int?, speed: Int?, hr: Int?) -> Bool {
        if lat == nil && hr == nil { return false }
        if tDs <= lastTDs && count > 0 { return false }
        text += TrackChunk.encode(dt: tDs - lastTDs, lat: lat, lon: lon, lastLat: lastLat, lastLon: lastLon, speed: speed, hr: hr)
        lastTDs = tDs
        if let lat, let lon {
            lastLat = lat
            lastLon = lon
        }
        count += 1
        return true
    }

    /// One sample as text, "dt,dlat,dlon,speed,hr;", without trailing empty fields.
    static func encode(dt: Int, lat: Int?, lon: Int?, lastLat: Int?, lastLon: Int?, speed: Int?, hr: Int?) -> String {
        var fields = [dt == 10 ? "" : String(dt), "", "", "", ""]
        if let lat, let lon {
            fields[1] = String(lastLat.map { lat - $0 } ?? lat)
            fields[2] = String(lastLon.map { lon - $0 } ?? lon)
            if let speed { fields[3] = String(speed) }
        }
        if let hr { fields[4] = String(hr) }
        while fields.count > 1 && fields.last == "" { fields.removeLast() }
        return fields.joined(separator: ",") + ";"
    }
}

/// A finished track waiting to go up, a chunk a request (POST /v1/watch/tracks).
struct TrackUpload: Codable, Equatable {
    var created: Int64
    /// The first kickoff, in seconds since 1970.
    var start: Int64
    var count: Int
    /// The next chunk to send.
    var next = 0
}
