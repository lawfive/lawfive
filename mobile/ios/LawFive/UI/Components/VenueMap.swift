import MapKit
import SwiftUI

// Maps of venues (IOS-8): Apple's own map, native and light on the phone, with the web's pins for
// where you park (P) and each pitch (1, 2, 3…), or one per venue on the Venues tab, and a Map /
// Satellite switch. Dark in dark mode by itself. Unlike the web and Android it doesn't use the
// server's map settings (ADM-2), as Apple's maps need no provider.

struct MapPin: Identifiable, Equatable {
    enum Kind { case parking, pitch, venue }
    let id: String
    let lat: Double
    let lon: Double
    let kind: Kind
    /// Text on the pin: P, a pitch number; none on a venue's.
    var mark = ""
}

struct VenueMap: View {
    let pins: [MapPin]
    var height: CGFloat = 280
    var activeId: String?
    /// Changed to bring the map back to the pins (an address just found).
    var fitKey = 0
    var onPick: ((Double, Double) -> Void)?
    var onPinClick: ((String) -> Void)?
    @State private var satellite = false
    @State private var camera: MapCameraPosition = .automatic

    private func fit() {
        guard !pins.isEmpty else { return }
        let lats = pins.map(\.lat), lons = pins.map(\.lon)
        let center = CLLocationCoordinate2D(latitude: (lats.min()! + lats.max()!) / 2, longitude: (lons.min()! + lons.max()!) / 2)
        // Room around them for the pins themselves, and never closer than a single field.
        let span = MKCoordinateSpan(latitudeDelta: max((lats.max()! - lats.min()!) * 1.6, 0.003), longitudeDelta: max((lons.max()! - lons.min()!) * 1.6, 0.003))
        camera = .region(MKCoordinateRegion(center: center, span: span))
    }

    var body: some View {
        MapReader { proxy in
            Map(position: $camera, interactionModes: [.pan, .zoom]) {
                ForEach(pins) { pin in
                    Annotation("", coordinate: CLLocationCoordinate2D(latitude: pin.lat, longitude: pin.lon), anchor: .bottom) {
                        PinView(pin: pin, active: pin.id == activeId)
                            .onTapGesture { onPinClick?(pin.id) }
                    }
                    .annotationTitles(.hidden)
                }
            }
            .mapStyle(satellite ? .hybrid : .standard(pointsOfInterest: .excludingAll))
            .mapControlVisibility(.hidden)
            // Without this a map asks for material bars, which drop LawFive's fonts and colors from the page's.
            .toolbarBackground(.automatic, for: .navigationBar, .tabBar)
            .onTapGesture { point in
                // A tap on the map places the active pin, to six decimals (about 10 cm), as the web does.
                guard let onPick, let at = proxy.convert(point, from: .local) else { return }
                onPick((at.latitude * 1e6).rounded() / 1e6, (at.longitude * 1e6).rounded() / 1e6)
            }
        }
        .overlay(alignment: .topTrailing) {
            Segmented(options: [(false, "Map"), (true, "Satellite")], selected: $satellite).padding(8)
        }
        .frame(height: height)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(LF.border, lineWidth: 1))
        // Drawn in the panel's colors, so the pins are pitch green on either ground (IOS-13).
        .ground(.panel)
        .onAppear(perform: fit)
        .onChange(of: fitKey) { _, _ in withAnimation { fit() } }
    }
}

/// The web's pin: a teardrop in white outline with its mark, and a yellow ring when it's the one being placed.
private struct PinView: View {
    let pin: MapPin
    let active: Bool

    private struct Tear: Shape {
        func path(in rect: CGRect) -> Path {
            let r = rect.width / 2
            return Path { p in
                p.addArc(center: CGPoint(x: r, y: r), radius: r, startAngle: .degrees(150), endAngle: .degrees(30), clockwise: false)
                p.addLine(to: CGPoint(x: r, y: rect.height))
                p.closeSubpath()
            }
        }
    }

    var body: some View {
        ZStack(alignment: .top) {
            if active { Tear().stroke(LF.yellow, lineWidth: 6) }
            Tear().fill(pin.kind == .parking ? LF.parkingBlue : LF.brand)
            Tear().stroke(.white, lineWidth: 2)
            if !pin.mark.isEmpty {
                Text(pin.mark).font(.barlow(13, .bold)).foregroundStyle(.white).padding(.top, 5)
            }
        }
        .frame(width: 28, height: 38)
        .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
    }
}
