import SafariServices
import SwiftUI

// DEMO-9: a page opened in the app's own browser view (Safari's), in a sheet, so closing it comes back to
// LawFive where it was; as Android's Custom Tabs.

/// An address for `.browser(_:)` to open.
struct BrowserPage: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

private struct BrowserView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

extension View {
    /// Opens the page, while it's set, in Safari's view in a sheet; Done closes it.
    func browser(_ page: Binding<BrowserPage?>) -> some View {
        sheet(item: page) { BrowserView(url: $0.url).ignoresSafeArea() }
    }
}
