import SwiftUI

// The form fields: a small muted label over the input, as on the web (DESIGN.md), on native text
// fields, menus and date pickers; 6 pt corners, the field color inside and the input border around
// (a chalk outline on the grass), the brand when focused (IOS-13).

struct FieldLabel: View {
    let text: String
    var body: some View { Text(text).font(.lfLabelMedium).foregroundStyle(LF.muted) }
}

/// The box an input sits in; brand-colored while it's being typed in.
struct FieldBox<Content: View>: View {
    var focused = false
    var multiline = false
    @ViewBuilder let content: () -> Content
    @Environment(\.ground) private var ground
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        // The ground's colors fixed, as a menu's label (Choice) is drawn outside the ground's trait on iOS 17.
        HStack(alignment: multiline ? .top : .center, spacing: 8, content: content)
            .padding(.horizontal, 12)
            .padding(.vertical, multiline ? 10 : 0)
            .frame(minHeight: 44)
            .background(ink(\.field, ground, scheme), in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(focused ? ink(\.brand, ground, scheme) : ink(\.borderInput, ground, scheme), lineWidth: focused ? 2 : 1))
            .animation(.easeOut(duration: 0.12), value: focused)
    }
}

struct Field: View {
    let label: String
    @Binding var text: String
    var placeholder: String?
    var keyboard: UIKeyboardType = .default
    var capitalization: TextInputAutocapitalization = .sentences
    var contentType: UITextContentType?
    var secure = false
    var minLines = 1
    var supporting: String?
    var mono = false
    var disabledAutocorrect = false
    /// What's been typed before (SET-15's assignors), offered under the box while it has focus.
    var suggestions: [String] = []
    /// Whether it's being typed in, for a form that moves between its fields (Return's Next) or scrolls to them.
    var focus: Binding<Bool>?
    @FocusState private var focused: Bool
    @State private var reveal = false

    init(_ label: String, text: Binding<String>, placeholder: String? = nil, keyboard: UIKeyboardType = .default, capitalization: TextInputAutocapitalization = .sentences,
         contentType: UITextContentType? = nil, secure: Bool = false, minLines: Int = 1, supporting: String? = nil, mono: Bool = false, suggestions: [String] = [],
         focus: Binding<Bool>? = nil) {
        self.label = label
        _text = text
        self.placeholder = placeholder
        self.keyboard = keyboard
        self.capitalization = capitalization
        self.contentType = contentType
        self.secure = secure
        self.minLines = minLines
        self.supporting = supporting
        self.mono = mono
        self.suggestions = suggestions
        self.focus = focus
    }

    /// Never the label again as a placeholder: it's already over the box.
    private var prompt: Text { Text(placeholder ?? "").foregroundStyle(LF.muted.opacity(0.7)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            FieldLabel(text: label).accessibilityHidden(true)
            FieldBox(focused: focused, multiline: minLines > 1) {
                Group {
                    if secure && !reveal {
                        SecureField(label, text: $text, prompt: prompt)
                    } else if minLines > 1 {
                        TextField(label, text: $text, prompt: prompt, axis: .vertical).lineLimit(minLines...12)
                    } else {
                        TextField(label, text: $text, prompt: prompt)
                    }
                }
                // Named for VoiceOver by its label, as the box's label is drawn separately.
                .accessibilityLabel(label)
                .accessibilityIdentifier(label)
                .font(mono ? .mono(16) : .lfBodyLarge)
                .foregroundStyle(LF.text)
                .focused($focused)
                .keyboardType(keyboard)
                .textInputAutocapitalization(capitalization)
                .autocorrectionDisabled(keyboard != .default || secure || mono)
                .textContentType(contentType)
                .tint(LF.brand)
                if secure {
                    Button { reveal.toggle() } label: {
                        PhIcon(reveal ? .eyeOff : .eye, size: 20, tint: LF.muted, label: reveal ? "Hide password" : "Show password")
                    }
                    .buttonStyle(.plain)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture { focused = true }
            .onChange(of: focused) { _, now in if focus?.wrappedValue != now { focus?.wrappedValue = now } }
            .onChange(of: focus?.wrappedValue) { _, now in if let now, now != focused { focused = now } }
            // As the website's: the ones containing what's typed, as chips; a tap fills the box.
            let typed = text.trimmingCharacters(in: .whitespaces).lowercased()
            let offered = focused ? Array(suggestions.filter { $0.lowercased() != typed && (typed.isEmpty || $0.lowercased().contains(typed)) }.prefix(8)) : []
            if !offered.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(offered, id: \.self) { s in
                            Button { text = s } label: { Chip(s) }
                                .buttonStyle(.plain)
                                .accessibilityHint("Fills in \(label.lowercased())")
                        }
                    }
                }
                .transition(.opacity)
            }
            if let supporting {
                Text(supporting).font(.lfBodySmall).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// A choice from a list, shown as a field that opens a native menu.
struct Choice<T: Hashable>: View {
    let label: String
    let value: T?
    let options: [T]
    let text: (T?) -> String
    var allowNone: String?
    /// More options under their own headings, after the rest (the match form's Your templates, SET-17).
    var groups: [(heading: String, options: [T])] = []
    let onChange: (T?) -> Void

    init(_ label: String, value: T?, options: [T], allowNone: String? = nil, groups: [(heading: String, options: [T])] = [], text: @escaping (T?) -> String, onChange: @escaping (T?) -> Void) {
        self.label = label
        self.value = value
        self.options = options
        self.allowNone = allowNone
        self.groups = groups
        self.text = text
        self.onChange = onChange
    }

    @Environment(\.ground) private var ground
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            // A choice in a row that says what it is (a result's Goal or Caution) has no label of its own.
            if !label.isEmpty { FieldLabel(text: label) }
            Menu {
                if let allowNone {
                    Button { onChange(nil) } label: {
                        if value == nil { Label(allowNone, image: "ph_check") } else { Text(allowNone) }
                    }
                }
                ForEach(options, id: \.self) { option in
                    Button { onChange(option) } label: {
                        if option == value { Label(text(option), image: "ph_check") } else { Text(text(option)) }
                    }
                }
                ForEach(groups.filter { !$0.options.isEmpty }, id: \.heading) { group in
                    Section(group.heading) {
                        ForEach(group.options, id: \.self) { option in
                            Button { onChange(option) } label: {
                                if option == value { Label(text(option), image: "ph_check") } else { Text(text(option)) }
                            }
                        }
                    }
                }
            } label: {
                FieldBox {
                    Text(text(value)).font(.lfBodyLarge).foregroundStyle(ink(\.text, ground, scheme)).lineLimit(1).minimumScaleFactor(0.85)
                    Spacer(minLength: 0)
                    PhIcon(.chevron, size: 16, tint: ink(\.muted, ground, scheme))
                }
            }
            .accessibilityLabel(label)
            .accessibilityValue(text(value))
        }
        .frame(maxWidth: .infinity)
    }
}

/// A setting with a switch on the right, in a card.
struct ToggleRow: View {
    let title: String
    var sub: String?
    var divider = true
    @Binding var isOn: Bool

    init(_ title: String, sub: String? = nil, divider: Bool = true, isOn: Binding<Bool>) {
        self.title = title
        self.sub = sub
        self.divider = divider
        _isOn = isOn
    }

    var body: some View {
        VStack(spacing: 0) {
            if divider { Hairline() }
            Toggle(isOn: $isOn) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.lfTitleMedium).foregroundStyle(LF.text)
                    if let sub { Text(sub).font(.lfBodySmall).foregroundStyle(LF.muted) }
                }
            }
            .tint(LF.brand)
            .padding(.horizontal, 16).padding(.vertical, 11)
            .sensoryFeedback(.impact(weight: .light), trigger: isOn)
        }
    }
}

/// Minutes, half minutes included, as a number of seconds kept in range.
struct MinutesField: View {
    let label: String
    let sec: Int
    let min: Int
    let max: Int
    let onChange: (Int) -> Void
    @State private var text: String

    init(_ label: String, sec: Int, min: Int, max: Int, onChange: @escaping (Int) -> Void) {
        self.label = label
        self.sec = sec
        self.min = min
        self.max = max
        self.onChange = onChange
        _text = State(initialValue: MinutesField.show(sec))
    }

    private static func show(_ s: Int) -> String { s % 60 == 0 ? "\(s / 60)" : "\(Double(s) / 60)" }
    private static func seconds(_ t: String) -> Int? { Double(t).map { Int(($0 * 60).rounded()) } }

    var body: some View {
        Field(label, text: Binding(get: { text }, set: { t in
            text = String(t.filter { $0.isNumber || $0 == "." }.prefix(5))
            if let s = MinutesField.seconds(text) { onChange(Swift.min(Swift.max(s, min * 60), max * 60)) }
        }), keyboard: .decimalPad)
        // Follows a change from elsewhere (a template, a value brought into range), but not typing, so "2." stays while on the way to 2.5.
        .onChange(of: sec) { _, s in
            if MinutesField.seconds(text) != s { text = MinutesField.show(s) }
        }
    }
}

struct NumberField: View {
    let label: String
    let value: Int?
    var placeholder: String?
    var supporting: String?
    let onChange: (Int?) -> Void
    @State private var text: String

    init(_ label: String, value: Int?, placeholder: String? = nil, supporting: String? = nil, onChange: @escaping (Int?) -> Void) {
        self.label = label
        self.value = value
        self.placeholder = placeholder
        self.supporting = supporting
        self.onChange = onChange
        _text = State(initialValue: value.map(String.init) ?? "")
    }

    var body: some View {
        Field(label, text: Binding(get: { text }, set: { t in
            text = String(t.filter(\.isNumber).prefix(3))
            onChange(Int(text))
        }), placeholder: placeholder, keyboard: .numberPad, supporting: supporting)
        .onChange(of: value) { _, v in
            if Int(text) != v { text = v.map(String.init) ?? "" }
        }
    }
}

extension View {
    /// Done above the keyboard, as number pads have no return key.
    func keyboardDone() -> some View {
        toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) }
                    .font(.lfLabelLarge).tint(LF.brand)
            }
        }
    }
}

/// A yes/no question before something that can't be undone: a native alert.
extension View {
    func confirm(_ title: String, isPresented: Binding<Bool>, message: String, action: String, role: ButtonRole? = .destructive, perform: @escaping () -> Void) -> some View {
        alert(title, isPresented: isPresented) {
            Button("Cancel", role: .cancel) {}
            Button(action, role: role, action: perform)
        } message: {
            Text(message)
        }
    }
}

/// APP-17: a tag in the search box, chosen from the suggestions, as a filter with its own X.
struct SearchTag: Identifiable, Hashable {
    let name: String
    var id: String { name }
}

/// Search (APP-17, IOS-13), in the page as Android's: an X clears it, the tags in use come up as chips
/// under it while it has focus and is empty, and a chosen tag sits in the box with an X of its own.
struct SearchField: View {
    @Binding var text: String
    let tags: [String]
    @Binding var chosen: [SearchTag]
    let prompt: String
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            FieldBox(focused: focused) {
                ForEach(chosen) { tag in
                    Button { chosen.removeAll { $0 == tag } } label: {
                        HStack(spacing: 4) {
                            Text(tag.name).font(.lfLabelMedium).foregroundStyle(LF.brandStrong).lineLimit(1)
                            PhIcon(.close, size: 13, tint: LF.brandStrong)
                        }
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(LF.brandSoft, in: RoundedRectangle(cornerRadius: 4))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Stop filtering by \(tag.name)")
                }
                TextField("Search", text: $text, prompt: Text(chosen.isEmpty ? prompt : "").foregroundStyle(LF.muted))
                    .font(.lfBodyLarge)
                    .foregroundStyle(LF.text)
                    .tint(LF.brand)
                    .focused($focused)
                    .submitLabel(.search)
                    .autocorrectionDisabled()
                    // Not "Search", which a chooser's own search in a sheet over the page is called.
                    .accessibilityLabel("Search: \(prompt)")
                    .accessibilityIdentifier("Search the list")
                if !text.isEmpty {
                    Button { text = "" } label: { PhIcon(.close, size: 18, tint: LF.muted, label: "Clear the search") }.buttonStyle(.plain)
                } else {
                    PhIcon(.search, size: 18, tint: LF.muted)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture { focused = true }
            // The field inside is what VoiceOver finds, not the box around it.
            .accessibilityElement(children: .contain)
            let choices = tags.filter { t in !chosen.contains { $0.name == t } }
            if focused && text.isEmpty && !choices.isEmpty {
                // A layer of the panel, so it reads on the grass.
                Flow(spacing: 6) {
                    ForEach(choices, id: \.self) { t in
                        Button { chosen.append(SearchTag(name: t)) } label: { Chip(t) }.buttonStyle(.plain)
                    }
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(LF.surface, in: RoundedRectangle(cornerRadius: 6))
                .ground(.panel)
                .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.15), value: focused)
    }
}
