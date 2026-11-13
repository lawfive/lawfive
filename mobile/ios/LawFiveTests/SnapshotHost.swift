import SnapshotTesting
import SwiftUI
import UIKit
import XCTest
@testable import LawFive

// Pictures of screens for review (mobile/ios/README.md#snapshot-pictures): each screen hosted in a window of
// its own on the booted simulator, at the iPhone 17's and the iPhone SE's size, light and dark, at
// the default text size and the largest standard one, its whole scrolling height where it scrolls.
// Nothing is compared: the pictures go to a folder to be looked at (tools/snapshots.sh puts them in
// mobile/ios/build/snapshots), named {screen}__{width}-{theme}-{text}.png as Android's are, so a
// script can pair them.

struct Variant {
    enum Width: String, CaseIterable {
        case iphone17, se
    }

    let width: Width
    let dark: Bool
    let large: Bool

    var name: String { "\(width.rawValue)-\(dark ? "dark" : "light")-\(large ? "large" : "1x")" }

    /// The phone's screen in points, its status bar and home indicator, and its pixels per point.
    var size: CGSize { width == .iphone17 ? CGSize(width: 402, height: 874) : CGSize(width: 375, height: 667) }
    var insets: UIEdgeInsets { width == .iphone17 ? UIEdgeInsets(top: 62, left: 0, bottom: 34, right: 0) : UIEdgeInsets(top: 20, left: 0, bottom: 0, right: 0) }
    var scale: CGFloat { width == .iphone17 ? 3 : 2 }
    /// The default text size, or the largest of the standard ones (not the accessibility sizes).
    var text: UIContentSizeCategory { large ? .extraExtraExtraLarge : .large }

    static let all: [Variant] = Width.allCases.flatMap { w in
        [false, true].flatMap { dark in [false, true].map { large in Variant(width: w, dark: dark, large: large) } }
    }

    /// The ones at the simulator's own text size. What isn't SwiftUI reads the text size from the
    /// phone, not from a view's traits (UIFontMetrics, which the page titles and slabs size with),
    /// so a picture is only true at the phone's setting: tools/snapshots.sh runs once at each.
    @MainActor
    static var now: [Variant] {
        all.filter { $0.text == UIApplication.shared.preferredContentSizeCategory }
    }
}

@MainActor
enum Snapshots {
    /// Where the pictures go: LAWFIVE_SNAPSHOTS (TEST_RUNNER_LAWFIVE_SNAPSHOTS to xcodebuild), else mobile/ios/build/snapshots.
    static var folder: URL {
        if let path = ProcessInfo.processInfo.environment["LAWFIVE_SNAPSHOTS"], !path.isEmpty { return URL(fileURLWithPath: path) }
        return URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appending(path: "build/snapshots")
    }

    /// Whether this run takes pictures: only when asked (tools/snapshots.sh), so the unit tests stay quick.
    static var wanted: Bool { ProcessInfo.processInfo.environment["LAWFIVE_SNAPSHOTS"] != nil }

    /// Every variant of a screen. `settle` is how long its fetches and first animations get before
    /// the picture; `full` grows the window to the page's whole scrolling height.
    static func take<V: View>(_ key: String, settle: Double = 0.8, full: Bool = true, variants: [Variant]? = nil, prepare: () -> Void = {}, @ViewBuilder _ screen: @escaping () -> V) async throws {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let variants = variants ?? Variant.now
        if variants.isEmpty { throw XCTSkip("The simulator's text size is neither the default nor the largest standard one") }
        for v in variants {
            prepare()
            let image = try await picture(v, settle: settle, full: full, screen)
            let data = try XCTUnwrap(Snapshotting<UIImage, UIImage>.image.diffing.toData(image))
            try data.write(to: folder.appending(path: "\(key)__\(v.name).png"))
        }
    }

    private static func picture<V: View>(_ v: Variant, settle: Double, full: Bool, _ screen: () -> V) async throws -> UIImage {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(origin: .zero, size: v.size)
        window.windowLevel = .normal + 1
        window.overrideUserInterfaceStyle = v.dark ? .dark : .light
        let host = UIHostingController(rootView: screen())
        host.traitOverrides.preferredContentSizeCategory = v.text
        host.traitOverrides.displayScale = v.scale
        window.rootViewController = host
        window.isHidden = false
        defer {
            window.isHidden = true
            window.rootViewController = nil
        }
        // The phone's status bar and home indicator, whatever the simulator's are and however tall the window grows.
        func phoneSafeArea() {
            host.additionalSafeAreaInsets = .zero
            window.layoutIfNeeded()
            let natural = window.safeAreaInsets
            host.additionalSafeAreaInsets = UIEdgeInsets(top: v.insets.top - natural.top, left: 0, bottom: v.insets.bottom - natural.bottom, right: 0)
            window.layoutIfNeeded()
        }
        phoneSafeArea()
        try await Task.sleep(for: .seconds(settle))
        guard full, let scroll = mainScroll(in: window) else { return shot(window, v.scale) }
        return try await wholePage(scroll, in: window, v.scale)
    }

    private static func shot(_ window: UIWindow, _ scale: CGFloat) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        format.opaque = true
        return UIGraphicsImageRenderer(bounds: window.bounds, format: format).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
    }

    /// The page's whole height, as a browser's full-page screenshot. The simulator draws no more than
    /// 8,192 pixels a side, so rather than a window that tall, the page scrolls most of a screen at a
    /// time under what stays put (the status bar's band or the navigation bar at the top, the board and
    /// the add button at the foot), and the pieces are put together, those once each. It steps from the
    /// top, as a lazy list keeps the rows it shows in place as it scrolls on, but not across a jump
    /// (it only guesses the heights of rows it hasn't laid out yet).
    private static func wholePage(_ scroll: UIScrollView, in window: UIWindow, _ scale: CGFloat) async throws -> UIImage {
        let frame = scroll.convert(scroll.bounds, to: window)
        let inset = scroll.adjustedContentInset
        let pane = frame.height - inset.top - inset.bottom
        func settle(_ offset: CGFloat) async throws {
            scroll.contentOffset.y = offset
            window.layoutIfNeeded()
            try await Task.sleep(for: .seconds(0.1))
        }
        // Setting the offset in code doesn't stop at the end, so each step stops there itself (the end
        // as the list knows it then, and again once it's laid out).
        func end() -> CGFloat { max(-inset.top, scroll.contentSize.height + inset.bottom - frame.height) }
        try await settle(-inset.top)
        // The rows between what stays put, in pixels.
        let a = Int(((frame.minY + inset.top) * scale).rounded())
        let b = Int(((frame.maxY - inset.bottom) * scale).rounded())
        var last = try XCTUnwrap(shot(window, scale).cgImage)
        var strips: [(image: CGImage, from: Int, to: Int)] = [(last, 0, b)]
        for _ in 0..<60 {
            let was = scroll.contentOffset.y
            try await settle(min(was + pane * 0.6, end()))
            if scroll.contentOffset.y > end() + 0.5 { try await settle(end()) }
            let moved = Int(((scroll.contentOffset.y - was) * scale).rounded())
            guard moved > 0 else { break }
            last = try XCTUnwrap(shot(window, scale).cgImage)
            strips.append((last, b - min(moved, b - a), b))
        }
        strips.append((last, b, last.height))
        try await settle(-inset.top)
        let height = strips.reduce(0) { $0 + $1.to - $1.from }
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        format.opaque = true
        return UIGraphicsImageRenderer(size: CGSize(width: window.bounds.width, height: CGFloat(height) / scale), format: format).image { _ in
            var y = 0
            for strip in strips where strip.to > strip.from {
                guard let cut = strip.image.cropping(to: CGRect(x: 0, y: strip.from, width: strip.image.width, height: strip.to - strip.from)) else { continue }
                UIImage(cgImage: cut, scale: scale, orientation: .up)
                    .draw(in: CGRect(x: 0, y: CGFloat(y) / scale, width: window.bounds.width, height: CGFloat(strip.to - strip.from) / scale))
                y += strip.to - strip.from
            }
        }
    }

    /// The page's own scroll view: the biggest one showing that scrolls up and down.
    private static func mainScroll(in window: UIWindow) -> UIScrollView? {
        var found: [UIScrollView] = []
        func visit(_ view: UIView) {
            guard !view.isHidden, view.alpha > 0.01 else { return }
            if let s = view as? UIScrollView, s.bounds.height > 100, s.contentSize.width <= s.bounds.width + 1 {
                let shown = s.convert(s.bounds, to: window).intersection(window.bounds)
                if !shown.isNull, shown.width > window.bounds.width / 2 { found.append(s) }
            }
            view.subviews.forEach(visit)
        }
        visit(window)
        return found.max { a, b in a.bounds.height * a.bounds.width < b.bounds.height * b.bounds.width }
    }
}
