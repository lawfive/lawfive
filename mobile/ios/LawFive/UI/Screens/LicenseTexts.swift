import SwiftUI

// WX-12: Data and licenses' Full license texts, as Android's: the fonts and icons, then the libraries,
// each opening its copyright and license in full (Data/Licenses.swift).

struct LicenseTextsScreen: View {
    @Environment(Nav.self) private var nav

    var body: some View {
        Page("Full license texts", sub: "Each font, icon set and library in the app, with its copyright and license.", large: false) {
            SectionTitle("Fonts and icons")
            rows(Licenses.works)
            SectionTitle("Libraries")
            rows(Licenses.libraries)
        }
    }

    private func rows(_ list: [Credited]) -> some View {
        LfCard {
            ForEach(Array(list.enumerated()), id: \.element.id) { i, c in
                ListRow(title: c.name, sub: c.by, divider: i > 0, action: { nav.push(.license(c.id)) }, leading: { EmptyView() }, trailing: { Chip(c.license.short) })
            }
        }
    }
}

struct LicenseScreen: View {
    let id: String
    @Environment(\.openURL) private var openURL

    var body: some View {
        let c = Licenses.find(id)
        Page(c?.name ?? "License", sub: c?.by, large: false) {
            if let c {
                LfCard {
                    ListRow(title: "Website", sub: shortAddress(c.website), divider: false, action: { open(c.website) }, leading: { EmptyView() },
                            trailing: { PhIcon(.link, size: 18, tint: LF.muted) })
                }
                SectionTitle("License")
                if let text = c.license.text {
                    LfCard(padding: 16) {
                        VStack(alignment: .leading, spacing: 12) {
                            paragraph(LicenseParagraph(text: c.license.name, heading: true))
                            ForEach(Array(Licenses.paragraphs(text).enumerated()), id: \.offset) { _, p in paragraph(p) }
                        }
                        .textSelection(.enabled)
                    }
                } else {
                    // Terms kept on the web (Garmin's), not a text to copy.
                    LfCard {
                        ListRow(title: c.license.name, sub: "Its terms are at \(URL(string: c.license.url)?.host ?? c.license.url)", divider: false,
                                action: { open(c.license.url) }, leading: { EmptyView() }, trailing: { PhIcon(.link, size: 18, tint: LF.muted) })
                    }
                }
            }
        }
    }

    private func paragraph(_ p: LicenseParagraph) -> some View {
        Text(p.text)
            .font(p.heading ? .barlow(15, .bold, relativeTo: .subheadline) : .lfBodyMedium)
            .foregroundStyle(LF.text)
            .lineSpacing(p.heading ? 0 : 3)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(p.heading ? .isHeader : [])
    }

    private func open(_ address: String) {
        if let url = URL(string: address) { openURL(url) }
    }

    /// "github.com/jpt/barlow": the address without its scheme, fragment or trailing slash.
    private func shortAddress(_ address: String) -> String {
        var s = address.components(separatedBy: "://").last ?? address
        s = s.components(separatedBy: "#").first ?? s
        while s.hasSuffix("/") { s.removeLast() }
        return s
    }
}
