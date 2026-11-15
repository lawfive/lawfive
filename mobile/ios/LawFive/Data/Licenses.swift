import Foundation

// WX-12: what the app is built with, each with its copyright and license in full, as the licenses ask
// (MIT, zlib, Apache 2.0 and the OFL want the copyright notice and license text with each copy). Kept
// by hand: the Swift packages the app bundles (Garmin's Connect IQ SDK, under Garmin's own terms on
// the web, and Firebase Cloud Messaging with what it brings, PUSH-5), and the fonts and icons, whose
// license files are in Resources/Licenses. An Apache 2.0 text is the license's own, after the
// copyright line the library's files carry; none of these has a NOTICE file of its own.
// LicensesTests checks every package in Package.resolved the app bundles is here. Android's list is
// made by Gradle instead (data/Licenses.kt), with the same way of setting a text.

/// A license as something carries it: its name, a short name for its chip, where it's published, and its text (none for terms only on the web).
struct LicenseText: Equatable {
    let name: String
    let short: String
    let url: String
    let text: String?
}

/// A library, or a font or icon set, with who it's by and its license.
struct Credited: Identifiable, Equatable {
    let id: String
    let name: String
    /// Its makers or copyright holders, as its own files name them.
    let by: String
    let website: String
    /// The Swift package it comes as (its identity in Package.resolved), if it's one.
    var package: String?
    let license: LicenseText
}

/// A paragraph of a license's text, as the screen sets it.
struct LicenseParagraph: Equatable {
    let text: String
    var heading = false
}

enum Licenses {
    private static func file(_ name: String) -> String? {
        Bundle.main.url(forResource: name, withExtension: "txt").flatMap { try? String(contentsOf: $0, encoding: .utf8) }
    }

    private static let ofl = "SIL Open Font License 1.1"

    /// Apache 2.0's text, after the copyright line the library's own files carry.
    private static func apache(_ copyright: String, file name: String = "apache-2.0") -> LicenseText {
        LicenseText(name: "Apache License 2.0", short: "Apache 2.0", url: "https://www.apache.org/licenses/LICENSE-2.0",
                    text: file(name).map { name == "apache-2.0" ? "\(copyright)\n\n\($0)" : $0 })
    }

    /// The fonts and icons, in name order.
    static let works: [Credited] = [
        Credited(id: "font:barlow", name: "Barlow and Barlow Condensed", by: "The Barlow Project Authors", website: "https://github.com/jpt/barlow",
                 license: LicenseText(name: ofl, short: "OFL 1.1", url: "https://openfontlicense.org", text: file("barlow-OFL"))),
        Credited(id: "font:jetbrains-mono", name: "JetBrains Mono", by: "The JetBrains Mono Project Authors", website: "https://www.jetbrains.com/lp/mono/",
                 license: LicenseText(name: ofl, short: "OFL 1.1", url: "https://openfontlicense.org", text: file("jetbrains-mono-OFL"))),
        Credited(id: "icons:phosphor", name: "Phosphor Icons", by: "Phosphor Icons", website: "https://phosphoricons.com",
                 license: LicenseText(name: "MIT License", short: "MIT", url: "https://opensource.org/license/mit", text: file("phosphor-MIT"))),
    ]

    /// The libraries the app bundles.
    static let libraries: [Credited] = [
        Credited(id: "com.garmin.connectiq", name: "Garmin Connect IQ Mobile SDK", by: "Garmin", website: "https://developer.garmin.com/connect-iq/",
                 package: "connectiq-companion-app-sdk-ios",
                 license: LicenseText(name: "Garmin Connect IQ SDK License Agreement", short: "Terms", url: "https://developer.garmin.com/connect-iq/sdk/", text: nil)),
        // PUSH-5: Firebase Cloud Messaging, and the packages it brings into the app.
        Credited(id: "com.google.firebase.messaging", name: "Firebase Cloud Messaging", by: "Google LLC", website: "https://firebase.google.com/docs/cloud-messaging",
                 package: "firebase-ios-sdk", license: apache("Copyright 2017 Google LLC")),
        Credited(id: "com.google.datatransport", name: "GoogleDataTransport", by: "Google LLC", website: "https://github.com/google/GoogleDataTransport",
                 package: "googledatatransport", license: apache("Copyright 2018 Google LLC")),
        Credited(id: "com.google.utilities", name: "GoogleUtilities", by: "Google LLC, and Landon J. Fuller", website: "https://github.com/google/GoogleUtilities",
                 package: "googleutilities", license: apache("Copyright 2018 Google LLC", file: "googleutilities-Apache")),
        Credited(id: "com.google.promises", name: "Promises", by: "Google Inc.", website: "https://github.com/google/promises",
                 package: "promises", license: apache("Copyright 2018 Google Inc.")),
        Credited(id: "nanopb", name: "nanopb", by: "Petteri Aimonen", website: "https://jpa.kapsi.fi/nanopb/",
                 package: "nanopb", license: LicenseText(name: "zlib License", short: "zlib", url: "https://opensource.org/license/zlib", text: file("nanopb-zlib"))),
    ]

    static func find(_ id: String) -> Credited? { (works + libraries).first { $0.id == id } }

    private static let markdownLink = try! NSRegularExpression(pattern: #"\[([^\]]+)]\(([^)\s]+)\)"#)
    private static let markdownHeading = try! NSRegularExpression(pattern: #"^#{1,6}\s+"#)
    private static let separator = try! NSRegularExpression(pattern: #"^\s*([-=*_~`])\1{2,}.*$"#)
    /// A list item, or a "Name: value" line: these start a line of their own within a paragraph.
    private static let lineStart = try! NSRegularExpression(pattern: #"^([-*•]|\(?[0-9]{1,2}[.)]|\([a-z]{1,4}\)|[a-z][.)]|[A-Z][A-Za-z]{1,15}:)\s"#)
    private static let spaces = try! NSRegularExpression(pattern: #"[ \t]{2,}"#)

    private static func matches(_ re: NSRegularExpression, _ s: String) -> Bool {
        re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
    }

    private static func replace(_ re: NSRegularExpression, _ s: String, with template: String) -> String {
        re.stringByReplacingMatches(in: s, range: NSRange(s.startIndex..., in: s), withTemplate: template)
    }

    /// A short line in capitals ("PREAMBLE"): letters, none of them lowercase.
    private static func capitals(_ s: String) -> Bool { s.contains { $0.isLetter } && !s.contains { $0.isLowercase } }

    /// A license's text as paragraphs for a phone's width, as Android's `Licenses.paragraphs`: the lines
    /// a paragraph was wrapped in for a terminal are joined, a list item or "URL: …" keeps a line of its
    /// own, rules and Markdown's code fences go, a Markdown link keeps its words, and a heading
    /// (Markdown's, or a short line in capitals) is marked as one. The words are as the license has them.
    static func paragraphs(_ text: String) -> [LicenseParagraph] {
        var out: [LicenseParagraph] = []
        var lines: [String] = []
        func flush() {
            guard !lines.isEmpty else { return }
            // A short line in capitals over its paragraph ("PREAMBLE", "DEFINITIONS") is its heading.
            if lines.count > 1, lines[0].count <= 40, capitals(lines[0]) { out.append(LicenseParagraph(text: lines.removeFirst(), heading: true)) }
            var joined = ""
            for line in lines {
                if !joined.isEmpty { joined += matches(lineStart, line) ? "\n" : " " }
                joined += line
            }
            out.append(LicenseParagraph(text: joined, heading: lines.count == 1 && joined.count <= 80 && capitals(joined)))
            lines.removeAll()
        }
        let normalized = text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "<br />", with: "\n")
        for raw in normalized.components(separatedBy: "\n") {
            let line = replace(spaces, replace(markdownLink, raw.trimmingCharacters(in: .whitespaces), with: "$1"), with: " ")
            if line.isEmpty {
                flush()
            } else if matches(separator, line) {
                continue
            } else if matches(markdownHeading, line) {
                flush()
                out.append(LicenseParagraph(text: replace(markdownHeading, line, with: ""), heading: true))
            } else {
                lines.append(line)
            }
        }
        flush()
        return out
    }
}
