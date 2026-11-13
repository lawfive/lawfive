import Observation
import SwiftUI

// Looking up a venue's address and placing it on the map, as the website's AddressLookUp.tsx and
// Android's AddressLookUp.kt: the venue form's Find on map, and (WEB-12) a new venue made from the
// match form, which does the same so the match gets its forecast and directions from the start.

/// The address search, choosing for itself when it finds one place; `onChoose` places the venue.
@MainActor
@Observable
final class AddressLookUp {
    /// Whether this server has an address search (ADM-1).
    private(set) var available = false
    private(set) var looking = false
    /// The places found, while there's more than one to choose from (or none).
    private(set) var found: [Place]?
    private(set) var error: String?
    @ObservationIgnored var onChoose: (Place) -> Void = { _ in }

    func load(_ graph: AppGraph) async {
        available = await graph.meta()?.capabilities.contains("geocode") == true
    }

    /// Looks the address up; one place found is chosen straight away and returned.
    @discardableResult
    func lookUp(_ address: String, graph: AppGraph) async -> Place? {
        looking = true
        error = nil
        let q = address.trimmingCharacters(in: .whitespaces).addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        do {
            let places = try await graph.api.call("GET", "/v1/geocode?q=\(q)")?["results"]?.decoded(as: [Place].self) ?? []
            looking = false
            let once = AddressLookUp.distinctPlaces(places)
            if once.count == 1 {
                choose(once[0])
                return once[0]
            }
            found = once
        } catch {
            // PLAN-11: the plan's searches for today, or the service not answering; the pin still works.
            looking = false
            found = nil
            self.error = (error as? ServerError)?.message ?? "The address search didn't answer."
        }
        return nil
    }

    func choose(_ place: Place) {
        onChoose(place)
        found = nil
    }

    func clear() {
        found = nil
        error = nil
    }

    /// The same place can come back twice under one name, a few meters apart; it's offered once.
    nonisolated static func distinctPlaces(_ places: [Place]) -> [Place] {
        places.enumerated().filter { i, p in
            places.firstIndex { q in q.name == p.name && abs(q.lat - p.lat) < 0.002 && abs(q.lon - p.lon) < 0.002 } == i
        }.map(\.element)
    }
}

/// What the search found, under the address: the places to choose from, or why there are none. `instead` says what to do then.
struct FoundPlaces: View {
    let search: AddressLookUp
    let instead: String

    var body: some View {
        if let error = search.error {
            Text(error.contains("by hand") || error.localizedCaseInsensitiveContains("map") ? error : "\(error) \(instead)")
                .font(.lfBodySmall).foregroundStyle(LF.redText).frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
        }
        if let found = search.found {
            if found.isEmpty {
                Text("Nothing found for that address. \(instead)").font(.lfBodySmall).foregroundStyle(LF.muted).frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
            }
            if found.count > 1 {
                Text("Which one is it?").font(.lfBodySmall).foregroundStyle(LF.muted).frame(maxWidth: .infinity, alignment: .leading)
                ForEach(Array(found.enumerated()), id: \.offset) { _, p in
                    Button { search.choose(p) } label: {
                        Text(p.name).font(.lfBodyMedium).foregroundStyle(LF.brand).multilineTextAlignment(.leading).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 6)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
