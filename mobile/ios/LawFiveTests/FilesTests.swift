import XCTest
@testable import LawFive

// Files on records (FILE-6 to FILE-13), in the website's and Android's words (FilesTest.kt), and
// which are kept on the phone for the next 3 days' matches.

final class FilesTests: XCTestCase {
    private func file(_ id: String, _ type: String = "application/pdf", size: Int = 1000) -> Attachment {
        Attachment(id: id, recordType: "venue", recordId: "v1", kind: "file", contentType: type, name: "Map.pdf", size: size, position: 0,
                   createdAt: "2026-11-01T00:00:00Z", url: "/v1/attachments/\(id)/file", thumbUrl: "/v1/attachments/\(id)/thumb", hasThumb: false)
    }

    func testAFilesLineIsItsKindAndSize() {
        XCTAssertEqual(describeFile(file("a", size: Int(1.2 * 1024 * 1024))), "PDF · 1.2 MB")
        XCTAssertEqual(describeFile(file("a", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 12 * 1024)), "Spreadsheet · 12 KB")
        XCTAssertEqual(describeFile(file("a", "text/csv", size: 317)), "CSV · 317 bytes")
        XCTAssertEqual(describeFile(file("a", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 1100)), "Word · 1 KB")
        XCTAssertEqual(describeFile(file("a", "image/jpeg", size: 120 << 20)), "Photo · 120 MB")
        XCTAssertEqual(describeFile(file("a", "text/plain", size: 1024)), "Text · 1 KB")
    }

    func testWhatOpensInTheAppAndWhatInQuickLook() {
        XCTAssertTrue(opensInApp(file("a")))
        XCTAssertTrue(opensInApp(file("a", "text/csv")))
        XCTAssertTrue(opensInApp(file("a", "image/webp")))
        XCTAssertFalse(opensInApp(file("a", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")))
    }

    func testARenamedFileKeepsItsEnding() {
        XCTAssertTrue(splitName("Field map.pdf") == ("Field map", ".pdf"))
        XCTAssertTrue(splitName("README") == ("README", ""))
        XCTAssertTrue(splitName(".env") == (".env", ""))
        XCTAssertEqual(keepsEnding(".pdf"), "It stays a PDF file")
    }

    func testTheFirst200LinesInUTF8OrTheOlderWindowsEncoding() {
        let long = textPreview(Data((1...250).map { "line \($0)" }.joined(separator: "\r\n").utf8))
        XCTAssertEqual(long.lines.count, 200)
        XCTAssertTrue(long.more)
        let short = textPreview(Data("\u{FEFF}Name,Role\nDana,Assignor\n".utf8))
        XCTAssertEqual(short.lines, ["Name,Role", "Dana,Assignor"])
        XCTAssertFalse(short.more)
        XCTAssertEqual(textPreview(Data([0x43, 0x61, 0x66, 0xE9])).lines, ["Café"])
    }

    func testWhatsTakenIsSaidOnceAfterTheRefusals() {
        let taken = "LawFive keeps PDF, spreadsheets (XLSX, CSV), Word documents (DOCX), text (TXT) and photos (JPEG, PNG, WebP)."
        let refused = [Refused(name: "page.html", why: "A web page isn't taken. \(taken)"), Refused(name: "old.xls", why: "Older Office files aren't taken. \(taken)")]
        XCTAssertEqual(takenLine(refused), taken)
        XCTAssertEqual(withoutTaken(refused).map(\.why), ["A web page isn't taken.", "Older Office files aren't taken."])
        XCTAssertEqual(refusedTitle(refused), "2 files weren't added.")
        XCTAssertEqual(refusedTitle(Array(refused.prefix(1))), "page.html wasn't added.")
        XCTAssertNil(takenLine([Refused(name: "big.pdf", why: "big.pdf is too big: at most 20 MB.")]))
    }

    private let now = instantOf("2026-11-09T16:00:00Z")!
    private func match(_ kickoff: String?, _ status: String = "scheduled") -> Match {
        Match(id: "m\(kickoff ?? "")", version: 1, updatedAt: "2026-11-01T00:00:00Z", status: status, kickoff: kickoff, format: defaultFormat, home: Team(), away: Team(), crew: [])
    }

    func testFilesAreKeptForTheNext3DaysMatchesUntilTheyreOver() {
        XCTAssertTrue(keepsFilesFor(match("2026-11-11T17:00:00Z"), now: now))
        XCTAssertTrue(keepsFilesFor(match("2026-11-12T16:00:00Z"), now: now))
        XCTAssertFalse(keepsFilesFor(match("2026-11-12T16:00:01Z"), now: now))
        XCTAssertTrue(keepsFilesFor(match("2026-11-09T15:00:00Z"), now: now))
        XCTAssertFalse(keepsFilesFor(match("2026-11-09T12:59:00Z"), now: now))
        XCTAssertTrue(keepsFilesFor(match("2026-11-10T16:00:00Z", "postponed"), now: now))
        XCTAssertFalse(keepsFilesFor(match("2026-11-10T16:00:00Z", "cancelled"), now: now))
        XCTAssertFalse(keepsFilesFor(match(nil), now: now))
    }

    func testIn200MBWithThoseKeptOnPurposeFirstThenTheSoonestMatchs() {
        let mb = 1 << 20
        let soon = instantOf("2026-11-10T16:00:00Z")!
        let later = instantOf("2026-11-12T16:00:00Z")!
        let pinned = file("pinned", size: 50 * mb)
        let forSoon = file("soon", size: 100 * mb)
        let forLater = file("later", size: 100 * mb)
        let shared = file("shared", size: 10 * mb)
        let plan = planKeeping(pinned: [pinned], wanted: [WantedFile(file: forSoon, kickoff: soon), WantedFile(file: forLater, kickoff: later), WantedFile(file: shared, kickoff: soon), WantedFile(file: shared, kickoff: later)])
        // The soon match's two, then the later one's doesn't fit.
        XCTAssertEqual(plan.map(\.id), ["pinned", "soon", "shared"])
        XCTAssertLessThanOrEqual(plan.reduce(0) { $0 + $1.size }, keepBudget)
        XCTAssertEqual(planKeeping(pinned: [pinned], wanted: [WantedFile(file: forSoon, kickoff: soon)]).map(\.id), ["pinned", "soon"])
    }

    func testACompetitionsDatesAsTheWebsiteSaysThem() {
        XCTAssertEqual(describeDates("2026-09-05", "2026-12-12"), "Sep 5 – Dec 12, 2026")
        XCTAssertEqual(describeDates("2026-11-14", "2026-11-15"), "Nov 14 – 15, 2026")
        XCTAssertEqual(describeDates("2026-08-29", "2027-05-30"), "Aug 29, 2026 – May 30, 2027")
        XCTAssertEqual(describeDates("2026-09-05", nil), "From Sep 5, 2026")
        XCTAssertNil(describeDates(nil, nil))
    }
}
