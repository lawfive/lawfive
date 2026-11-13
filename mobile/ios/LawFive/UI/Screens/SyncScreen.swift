import SwiftUI

/// APP-16: a big sync, in full: what's moving and how far it's got, with the way back to the app.
struct SyncScreen: View {
    let activity: SyncActivity

    private var title: String {
        if activity.problem != nil { return "Sync paused" }
        return activity.finished ? "All synced" : "Syncing your matches"
    }

    private var line: String {
        if let problem = activity.problem { return "\(problem). What's left goes by itself as soon as it can." }
        return activity.finished ? "Everything's on your phone and the server." : "This carries on if you keep using the app."
    }

    var body: some View {
        VStack(spacing: 0) {
            Group {
                if activity.problem != nil {
                    Avatar(icon: .info, background: LF.surface2, foreground: LF.red, size: 56)
                } else if activity.finished {
                    Avatar(icon: .check, size: 56)
                } else {
                    LoadingPitch()
                }
            }
            // The same height whichever shows, so nothing moves when it finishes.
            .frame(height: 112)
            Text(title).font(.lfHeadlineLarge).foregroundStyle(LF.text).multilineTextAlignment(.center).textCase(.uppercase)
            Text(line).font(.lfBodyMedium).foregroundStyle(LF.muted).multilineTextAlignment(.center).padding(.top, 6)
            ScrollView {
                LfCard {
                    ForEach(Array(activity.rows.enumerated()), id: \.element.id) { i, row in
                        if i > 0 { Divider().overlay(LF.border) }
                        HStack(spacing: 12) {
                            Group {
                                if row.done { Avatar(icon: .check, size: 26) } else { LoadingPitch(inline: true) }
                            }
                            .frame(width: 34)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(row.title).font(.lfTitleMedium).foregroundStyle(LF.text).lineLimit(1)
                                if let detail = row.detail { Text(detail).font(.lfBodySmall).foregroundStyle(LF.muted).lineLimit(1) }
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                    }
                }
                .padding(.top, 20)
            }
            if activity.finished {
                PrimaryButton("Done", wide: true) { activity.close() }.padding(.top, 16)
            } else {
                SecondaryButton("Keep using LawFive", wide: true) { activity.hide() }.padding(.top, 16)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background { PitchStripes() }
    }
}
