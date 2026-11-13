import SwiftUI

// Weather on screen (WX-9, as the web's WX-5): Phosphor's weather icons (a clear day's sun and a
// storm in amber), the risk badges with their reasons, the brief beside a match in lists, and the
// match page's weather slab with its details (WEB-28).

func weatherIcon(_ condition: String, day: Bool) -> Ph {
    switch condition {
    case "clear": return day ? .sun : .moon
    case "partlyCloudy": return day ? .cloudSun : .cloudMoon
    case "cloudy": return .cloud
    case "fog": return .cloudFog
    case "drizzle", "rain": return .cloudRain
    case "snow": return .cloudSnow
    case "storm": return .cloudLightning
    default: return .cloud
    }
}

func conditionName(_ condition: String, day: Bool = true) -> String {
    if condition == "clear" && !day { return "Clear" }
    return ["clear": "Sunny", "partlyCloudy": "Partly cloudy", "cloudy": "Cloudy", "fog": "Fog", "drizzle": "Drizzle", "rain": "Rain", "snow": "Snow", "storm": "Thunderstorms"][condition] ?? condition
}

private let riskNames = ["wetField": "Wet field", "rain": "Rain", "storm": "Storms", "snow": "Snow", "heat": "Heat"]
private let riskIcons = ["wetField": "rain", "rain": "rain", "storm": "storm", "snow": "snow", "heat": "clear"]

func riskName(_ kind: String) -> String { riskNames[kind] ?? kind }

/// "Rain likely", "Heat possible".
func riskTitle(_ r: WeatherRisk) -> String { "\(riskName(r.kind)) \(r.level)" }

/// Why the badge is there, in a sentence or two, in the account's units.
func explainRisk(_ r: WeatherRisk, units: Units, final: Bool) -> String {
    let amount = r.amount ?? 0
    switch r.kind {
    case "wetField":
        return "\(formatRain(amount, distance: units.distance)) of rain \(final ? "fell" : "is forecast") in the 24 hours before kickoff. Many parks close grass fields after about \(formatRain(12, distance: units.distance)); check with the league or the field's owner."
    case "rain":
        return "\(formatRain(amount, distance: units.distance)) of rain \(final ? "fell" : "is expected") from an hour before kickoff to the end of the match."
    case "storm":
        return "Thunderstorms \(final ? "were" : "are") forecast during the match or the hour before. Play stops at the first thunder or lightning, usually until 30 minutes after the last."
    case "snow":
        return "\(amount < 1 ? "Some" : "\(Int(amount.rounded())) cm of") snow \(final ? "fell" : "is forecast") before or during the match."
    case "heat":
        return "It \(final ? "felt" : "will feel") like \(formatTemperature(amount, unit: units.temperature)) during the match. Plan water (hydration) breaks."
    default:
        return riskTitle(r)
    }
}

private func sourceLine(_ w: MatchWeather) -> String {
    w.final ? "The weather when the match was played · \(w.source)"
        : "Forecast updated \(instantOf(w.updatedAt).map { timeAgo($0) } ?? "") · \(w.source)"
}

struct WeatherIcon: View {
    let condition: String
    let day: Bool
    var size: CGFloat = 20
    var tint: Color?

    var body: some View {
        let amber = (condition == "clear" && day) || condition == "storm"
        PhIcon(weatherIcon(condition, day: day), size: size, tint: tint ?? (amber ? LF.weatherAmber : LF.text), label: conditionName(condition, day: day))
    }
}

/// The icon and "54°" under a match's kickoff in lists.
struct WeatherBrief: View {
    let w: MatchWeather
    let units: Units

    var body: some View {
        HStack(spacing: 4) {
            WeatherIcon(condition: w.condition, day: w.isDay, size: 17)
            Text(formatDegrees(w.temperatureC, unit: units.temperature)).font(.barlow(13, .semibold, relativeTo: .footnote)).foregroundStyle(LF.text)
        }
    }
}

/// One risk as a badge (amber possible, red likely); tap for the reason, in a popover.
struct RiskBadge: View {
    let r: WeatherRisk
    let w: MatchWeather
    let units: Units
    @State private var open = false

    var body: some View {
        let likely = r.level == "likely"
        let fg = likely ? LF.redText : LF.amberText
        Button { open = true } label: {
            // A chip (DESIGN.md "Chips"): panel-colored, so it reads on the grass too.
            HStack(spacing: 4) {
                WeatherIcon(condition: riskIcons[r.kind] ?? "rain", day: true, size: 13, tint: fg)
                Text(riskName(r.kind).uppercased()).lfWord(13, .bold).foregroundStyle(fg).lineLimit(1)
            }
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background(likely ? LF.redSoft : LF.amberSoft, in: RoundedRectangle(cornerRadius: 4))
            .ground(.panel)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(riskTitle(r))
        .popover(isPresented: $open) {
            VStack(alignment: .leading, spacing: 8) {
                Text(riskTitle(r)).font(.lfTitleLarge).foregroundStyle(LF.text)
                Text(explainRisk(r, units: units, final: w.final)).font(.lfBodyMedium).foregroundStyle(LF.text).fixedSize(horizontal: false, vertical: true)
                Text(sourceLine(w)).font(.lfBodySmall).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true)
            }
            .padding(16)
            .frame(width: 300)
            .presentationCompactAdaptation(.popover)
        }
    }
}

struct RiskBadges: View {
    let w: MatchWeather
    let units: Units

    var body: some View {
        if !w.risks.isEmpty {
            Flow {
                ForEach(w.risks, id: \.kind) { RiskBadge(r: $0, w: w, units: units) }
            }
        }
    }
}

/// The match page's weather (WX-5) under the scoreboard, on a slab (WEB-28) titled Forecast (or Weather)
/// and tagged At kickoff, not cut, as Details and the badges open more: the icon and the temperature large
/// with the condition, then feels like, the chance of rain (or, played, the rain that fell) and the gusts
/// as rows, each label beside its figure, and along its foot the risk badges and Details (hour by hour,
/// the risks spelled out, when it was updated, the credit).
struct WeatherSlab: View {
    let w: MatchWeather
    let units: Units
    @State private var details = false

    private struct Figure {
        let label: String
        let value: String
        var whole = false
    }

    var body: some View {
        // A temperature stays whole, as the large one; other units sit small beside their figure.
        let figures: [Figure] = [
            Figure(label: "Feels like", value: formatTemperature(w.feelsLikeC, unit: units.temperature), whole: true),
            w.final ? nil : w.precipitationChance.map { Figure(label: "Chance of rain", value: "\(Int(($0 * 100).rounded()))%") },
            w.final ? Figure(label: "Rain", value: w.precipitationMm > 0 ? formatRain(w.precipitationMm, distance: units.distance) : "None") : nil,
            w.windGustKph.map { Figure(label: "Gusts", value: formatWind($0, distance: units.distance)) },
        ].compactMap { $0 }
        Slab(title: w.final ? "Weather" : "Forecast", tag: "At kickoff") {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 12) {
                    WeatherIcon(condition: w.condition, day: w.isDay, size: 44)
                    FitFigure(figure: formatTemperature(w.temperatureC, unit: units.temperature), size: 56, least: 28)
                }
                Text(conditionName(w.condition, day: w.isDay)).font(.barlow(16, .bold)).foregroundStyle(LF.text)
            }
            .accessibilityElement(children: .combine)
            VStack(spacing: 0) {
                ForEach(figures, id: \.label) { f in SlabRow(label: f.label, figure: f.value, whole: f.whole) }
                SlabRule()
            }
            .padding(.top, 18)
            HStack(alignment: .center, spacing: 12) {
                RiskBadges(w: w, units: units)
                Spacer(minLength: 0)
                Button { details = true } label: {
                    HStack(spacing: 2) {
                        Text("DETAILS").lfWord(15).foregroundStyle(LF.text)
                        PhIcon(.chevron, size: 14, tint: LF.text)
                    }
                    .padding(.horizontal, 4)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Details")
            }
            .padding(.top, 8)
        }
        .sheet(isPresented: $details) {
            WeatherDetails(w: w, units: units)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(LF.panel)
                .ground(.panel)
        }
    }
}

/// What Details opens: the facts, hour by hour, the risks spelled out, and the credit (WX-8).
private struct WeatherDetails: View {
    let w: MatchWeather
    let units: Units

    private func hour(_ iso: String) -> String {
        guard let t = instantOf(iso) else { return "" }
        let f = DateFormatter()
        f.dateFormat = uses24Hours() ? "HH:mm" : "h a"
        return f.string(from: t)
    }

    var body: some View {
        let facts = [
            w.final ? nil : w.precipitationChance.map { "\(Int(($0 * 100).rounded()))% chance of rain" },
            w.precipitationMm > 0 ? "\(formatRain(w.precipitationMm, distance: units.distance)) of rain during the match" : nil,
            w.precipitationBeforeMm > 0 ? "\(formatRain(w.precipitationBeforeMm, distance: units.distance)) of rain in the 24 hours before" : "No rain in the 24 hours before",
            w.windGustKph.map { "Gusts to \(formatWind($0, distance: units.distance))" },
        ].compactMap { $0 }
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    WeatherIcon(condition: w.condition, day: w.isDay, size: 34)
                    VStack(alignment: .leading) {
                        Text(w.final ? "THE WEATHER" : "THE FORECAST").font(.lfHeadlineSmall).foregroundStyle(LF.text)
                        Text("\(formatTemperature(w.temperatureC, unit: units.temperature)) · \(conditionName(w.condition, day: w.isDay)) at kickoff").font(.lfBodyMedium).foregroundStyle(LF.muted)
                    }
                }
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(facts, id: \.self) { Text("· \($0)").font(.lfBodyMedium).foregroundStyle(LF.text) }
                }
                if w.hours.count > 1 {
                    LfCard {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 0) {
                                ForEach(w.hours, id: \.time) { h in
                                    VStack(spacing: 4) {
                                        Text(hour(h.time)).font(.lfBodySmall).foregroundStyle(LF.muted)
                                        WeatherIcon(condition: h.condition, day: h.isDay, size: 22)
                                        Text(formatDegrees(h.temperatureC, unit: units.temperature)).font(.display(18)).foregroundStyle(LF.text)
                                        Text(h.precipitationMm >= 0.1 ? formatRain(h.precipitationMm, distance: units.distance)
                                            : w.final ? "–" : h.precipitationChance.map { "\(Int(($0 * 100).rounded()))%" } ?? "–")
                                            .font(.lfBodySmall).foregroundStyle(LF.muted)
                                    }
                                    .frame(width: 64)
                                }
                            }
                            .padding(.vertical, 12).padding(.horizontal, 6)
                        }
                    }
                }
                ForEach(w.risks, id: \.kind) { r in
                    HStack(alignment: .top, spacing: 10) {
                        RoundedRectangle(cornerRadius: 2).fill(r.level == "likely" ? LF.red : LF.amberText).frame(width: 3)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(riskTitle(r)).font(.lfTitleMedium).foregroundStyle(LF.text)
                            Text(explainRisk(r, units: units, final: w.final)).font(.lfBodyMedium).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
                Hairline()
                Text((w.final ? "The weather when the match was played" : "Forecast updated \(instantOf(w.updatedAt).map { timeAgo($0) } ?? ""); it changes as kickoff gets closer") + " · Weather by \(w.source)")
                    .font(.lfBodySmall).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 20).padding(.top, 24).padding(.bottom, 32)
        }
    }
}
