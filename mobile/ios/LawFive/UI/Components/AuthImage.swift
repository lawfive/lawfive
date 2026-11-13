import SwiftUI
import UIKit

// Photos load with the session's sign-in (IOS-7), which AsyncImage can't send; kept in memory while
// the app runs.

@MainActor
final class ImageLoader {
    static let shared = ImageLoader()
    private let cache = NSCache<NSString, UIImage>()

    func cached(_ path: String) -> UIImage? { cache.object(forKey: path as NSString) }

    func load(_ path: String, api: Api) async -> UIImage? {
        if let image = cached(path) { return image }
        guard let data = try? await api.bytes(path), let image = await Task.detached(operation: { UIImage(data: data)?.preparingForDisplay() }).value else { return nil }
        cache.setObject(image, forKey: path as NSString)
        return image
    }

    func clear() { cache.removeAllObjects() }
}

struct AuthImage: View {
    let path: String
    var fit = false
    @Environment(AppGraph.self) private var graph
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image).resizable().aspectRatio(contentMode: fit ? .fit : .fill)
                    .transition(.opacity)
            } else {
                LF.surface2
            }
        }
        .task(id: path) {
            let found = await ImageLoader.shared.load(path, api: graph.api)
            withAnimation(.easeOut(duration: 0.2)) { image = found }
        }
    }
}
