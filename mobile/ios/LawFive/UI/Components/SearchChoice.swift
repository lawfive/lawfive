import SwiftUI

// APP-22 (as Android's): a venue, competition or referee, chosen from a list that can be long: search
// it, or make a new one from what's typed, as the website's picker does (WEB-12).

/// For comparing names: no case or accents, so "jose" finds "José".
func foldName(_ text: String) -> String {
    text.trimmingCharacters(in: .whitespacesAndNewlines).folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
}

struct SearchOption: Identifiable, Hashable {
    let id: String
    let name: String
    var otherNames: [String] = []
    var names: [String] { [name] + otherNames }
}

/// The options whose name, or another name for them, holds what's typed; all of them with nothing typed.
func searchOptions(_ options: [SearchOption], typed: String) -> [SearchOption] {
    let query = foldName(typed)
    if query.isEmpty { return options }
    return options.filter { $0.names.contains { foldName($0).contains(query) } }
}

/// Whether what's typed could be a new one: something's typed, and nothing is already called that.
func canCreate(_ options: [SearchOption], typed: String) -> Bool {
    let query = foldName(typed)
    return !query.isEmpty && !options.contains { $0.names.contains { foldName($0) == query } }
}

struct SearchChoice: View {
    let label: String
    let value: String?
    let options: [SearchOption]
    /// What the field says with nothing chosen.
    var empty = "None"
    var allowNone = true
    /// "New venue", offered as: New venue "<typed>".
    var createLabel: String?
    var onCreate: ((String) async -> String)?
    /// Instead of onCreate: the list closes and this is given what's typed, to ask for more first (a new venue's address, WEB-12).
    var onCreateAsk: ((String) -> Void)?
    /// "Just this match:", offered as: Just this match: "<typed>".
    var textLabel: String?
    var onUseText: ((String) -> Void)?
    let onChange: (String?) -> Void

    @State private var open = false
    /// What was typed for onCreateAsk, given it once the list has gone.
    @State private var asking: String?

    private var shown: String { options.first { $0.id == value }?.name ?? empty }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            FieldLabel(text: label)
            Button { open = true } label: {
                FieldBox {
                    Text(shown).font(.lfBodyLarge).foregroundStyle(LF.text).lineLimit(1).minimumScaleFactor(0.85)
                    Spacer(minLength: 0)
                    PhIcon(.chevron, size: 16, tint: LF.muted)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
            .accessibilityValue(shown)
        }
        .frame(maxWidth: .infinity)
        .sheet(isPresented: $open, onDismiss: {
            if let typed = asking {
                asking = nil
                onCreateAsk?(typed)
            }
        }) {
            SearchChoiceSheet(label: label, value: value, options: options, allowNone: allowNone, createLabel: createLabel, onCreate: onCreate,
                              onCreateAsk: onCreateAsk == nil ? nil : { asking = $0 }, textLabel: textLabel, onUseText: onUseText, onChange: onChange)
        }
    }
}

private struct SearchChoiceSheet: View {
    let label: String
    let value: String?
    let options: [SearchOption]
    let allowNone: Bool
    let createLabel: String?
    let onCreate: ((String) async -> String)?
    let onCreateAsk: ((String) -> Void)?
    let textLabel: String?
    let onUseText: ((String) -> Void)?
    let onChange: (String?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var typed = ""
    @State private var creating = false
    @FocusState private var focused: Bool

    var body: some View {
        let found = searchOptions(options, typed: typed)
        let text = typed.trimmingCharacters(in: .whitespacesAndNewlines)
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(label).font(.lfTitleLarge).foregroundStyle(LF.text)
                Spacer()
                LinkButton("Cancel", color: LF.muted) { dismiss() }
            }
            FieldBox(focused: focused) {
                PhIcon(.search, size: 18, tint: LF.muted)
                TextField("Search", text: $typed)
                    .font(.lfBodyLarge)
                    .focused($focused)
                    .autocorrectionDisabled()
            }
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if allowNone && text.isEmpty {
                        row("None", chosen: value == nil, muted: true) { onChange(nil); dismiss() }
                    }
                    ForEach(found) { option in
                        row(option.name, chosen: option.id == value) { onChange(option.id); dismiss() }
                    }
                    if let onCreateAsk, let createLabel, canCreate(options, typed: typed) {
                        row("\(createLabel) \"\(text)\"", icon: .plus) {
                            onCreateAsk(text)
                            dismiss()
                        }
                    } else if let onCreate, let createLabel, canCreate(options, typed: typed) {
                        row("\(createLabel) \"\(text)\"", icon: .plus) {
                            guard !creating else { return }
                            creating = true
                            Task {
                                onChange(await onCreate(text))
                                dismiss()
                            }
                        }
                    }
                    if let onUseText, let textLabel, !text.isEmpty {
                        row("\(textLabel) \"\(text)\"") { onUseText(text); dismiss() }
                    }
                    if found.isEmpty && onCreate == nil && onCreateAsk == nil && onUseText == nil {
                        Text("Nothing called that.").font(.lfBodyMedium).foregroundStyle(LF.muted).padding(.vertical, 14)
                    }
                }
            }
            .scrollDismissesKeyboard(.immediately)
        }
        .padding(16)
        .background(LF.surface)
        .presentationDetents([.large])
        .onAppear { focused = true }
    }

    private func row(_ text: String, chosen: Bool = false, muted: Bool = false, icon: Ph? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if let icon { PhIcon(icon, size: 18, tint: LF.brandStrong) }
                Text(text).font(.lfBodyLarge).foregroundStyle(icon != nil ? LF.brandStrong : muted ? LF.muted : LF.text)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
                if chosen { PhIcon(.check, size: 18, tint: LF.brandStrong, label: "Chosen") }
            }
            .padding(.vertical, 13)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
