// The form pieces, after the web's Chakra fields in its theme: a FormLabel
// (16 pt, 500, a red "*" when required) over its field with Type it's
// "Suggested" mark, the inline error or a helper line under it; the warm
// outline field (40 pt, 6 pt corners, the hairline on the surface); the
// Select (the same box with its chevron, opening the options); the date
// field (the box with the day and a calendar, opening the system picker
// in place); the Switch (34 × 20, sand off, coral on); a muted note; a
// failed load with Retry.
import SwiftUI

/// A labelled field: label (and mark) over the content, then the error or the help.
struct FormRow<Content: View>: View {
    let label: String
    var required = false
    var suggested = false
    var error: String? = nil
    var help: String? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s2) {
            HStack(alignment: .firstTextBaseline) {
                FieldLabel(text: label, required: required)
                if suggested {
                    Spacer(minLength: Theme.Space.s2)
                    SuggestedMark()
                }
            }
            content()
            if let error {
                Note(text: error, tone: Theme.Colors.negative, size: 14)
            } else if let help {
                Note(text: help, size: 14)
            }
        }
    }
}

/// A FormLabel: 16 pt, medium, the required "*" in the negative tone.
struct FieldLabel: View {
    let text: String
    var required = false
    var size: CGFloat = 16
    @Environment(AppLanguage.self) private var language

    var body: some View {
        (Text(text).foregroundColor(Theme.Colors.textPrimary)
            + Text(required ? " *" : "").foregroundColor(Theme.Colors.negative))
            .font(Theme.Fonts.body(size, weight: .semibold, lang: language.current))
    }
}

/// A small muted line (a helper, a note under a figure).
struct Note: View {
    let text: String
    var tone: Color = Theme.Colors.textMuted
    var size: CGFloat = 12
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Text(text)
            .font(Theme.Fonts.body(size, lang: language.current))
            .foregroundStyle(tone)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// Type it's mark on a field it filled: a sparkle and "Suggested".
struct SuggestedMark: View {
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(spacing: 3) {
            LucideIcon(icon: .sparkle, size: 12)
            Text(language.t("ai:suggested"))
        }
        .font(Theme.Fonts.body(12, weight: .semibold, lang: language.current))
        .foregroundStyle(Theme.Colors.accentFg)
    }
}

// MARK: Fields

/// The warm outline field (Input/Select md): border.default on bg.surface,
/// 6 pt corners, 40 pt tall (32 small), 16 pt inside.
struct FieldStyle: ViewModifier {
    var small = false
    var focused = false
    @Environment(AppLanguage.self) private var language

    func body(content: Content) -> some View {
        content
            .font(Theme.Fonts.body(small ? 14 : 16, lang: language.current))
            .foregroundStyle(Theme.Colors.textPrimary)
            .padding(.horizontal, small ? Theme.Space.s3 : Theme.Space.s4)
            .frame(minHeight: small ? 32 : 40)
            .background(Theme.Colors.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .stroke(focused ? Theme.Palette.brand400 : Theme.Colors.border, lineWidth: focused ? 2 : 1))
    }
}

extension View {
    func fieldStyle(small: Bool = false) -> some View { modifier(FieldStyle(small: small)) }
}

/// A Select: the field's box with the picked option and the chevron; tapping
/// lists the options (the system's menu, as a phone's browser does).
struct SelectMenu: View {
    let options: [(value: String, label: String)]
    let value: String
    /// What the box says when nothing is picked ("Select").
    var placeholder: String? = nil
    var small = false
    var label: String = ""
    let pick: (String) -> Void

    var body: some View {
        Menu {
            Picker(label, selection: Binding(get: { value }, set: { pick($0) })) {
                ForEach(options, id: \.value) { Text($0.label).tag($0.value) }
            }
        } label: {
            HStack(spacing: Theme.Space.s2) {
                Text(options.first { $0.value == value }?.label ?? placeholder ?? "")
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                LucideIcon(icon: .chevronDown, size: 16)
            }
            .fieldStyle(small: small)
            .contentShape(Rectangle())
        }
        .accessibilityLabel(label)
    }
}

/// A date field: the box with the day as the phone writes it and the
/// calendar icon; a tap opens the system's date picker on it (the web's
/// native date input). Stored as the web's 'YYYY-MM-DD' (ISODay).
struct DayField: View {
    let label: String
    @Binding var iso: String
    var small = false
    @Environment(AppLanguage.self) private var language

    var body: some View {
        ZStack {
            HStack(spacing: Theme.Space.s2) {
                Text(ISODay.date(iso).map { shown($0) } ?? "")
                    .frame(maxWidth: .infinity, alignment: .leading)
                LucideIcon(icon: .calendarDays, size: 16).foregroundStyle(Theme.Colors.textPrimary)
            }
            .fieldStyle(small: small)
            // The system picker, invisible over the box, takes the tap.
            DatePicker(label, selection: Binding(
                get: { ISODay.date(iso) ?? Date() },
                set: { iso = ISODay.string($0) }
            ), displayedComponents: .date)
            .labelsHidden()
            .datePickerStyle(.compact)
            .tint(Theme.Colors.accentFg)
            .environment(\.locale, locale)
            .scaleEffect(x: 4, y: 1.2)
            .colorMultiply(.clear)
            .opacity(0.02)
            .accessibilityLabel(label)
        }
        .clipped()
    }

    private var locale: Locale { language.current == "el" ? Locale(identifier: "el_GR") : Locale.current }

    /// The day in the language's numeric short form (as a phone's browser
    /// shows its date input).
    private func shown(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = TimeZone.current
        formatter.setLocalizedDateFormatFromTemplate("ddMMyyyy")
        return formatter.string(from: date)
    }
}

// MARK: Switch

/// Chakra's Switch (md): a 34 × 20 track, sand.300 off (sand.700 dark),
/// brand.500 on, the white thumb.
struct KitSwitchStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        KitSwitchBody(configuration: configuration)
    }
}

private struct KitSwitchBody: View {
    let configuration: ToggleStyleConfiguration

    var body: some View {
        HStack(spacing: Theme.Space.s3) {
            configuration.label
            Spacer(minLength: 0)
            KitSwitch(isOn: configuration.$isOn)
        }
    }
}

/// The switch alone (a card header's, a row's), with its accessible name.
struct KitSwitch: View {
    @Binding var isOn: Bool
    var label: String = ""
    @Environment(\.colorScheme) private var scheme
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        Button {
            isOn.toggle()
        } label: {
            ZStack(alignment: isOn ? .trailing : .leading) {
                Capsule()
                    .fill(isOn ? Theme.Palette.brand500 : (scheme == .dark ? Theme.Palette.sand700 : Theme.Palette.sand300))
                    .frame(width: 34, height: 20)
                Circle().fill(Color.white).frame(width: 16, height: 16).padding(2)
            }
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
            .animation(.easeOut(duration: 0.15), value: isOn)
        }
        .buttonStyle(.plain)
        .opacity(isEnabled ? 1 : 0.4)
        .accessibilityLabel(label)
        .accessibilityValue(isOn ? "1" : "0")
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

/// A switch row: the label (and a note under it) with the switch at the end.
struct SwitchRow: View {
    let label: String
    var note: String? = nil
    var icon: Lucide? = nil
    @Binding var isOn: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s1) {
            Toggle(isOn: $isOn) {
                HStack(spacing: Theme.Space.s2) {
                    if let icon { LucideIcon(icon: icon, size: 14) }
                    Text(label).kitText(16, .semibold)
                }
                .foregroundStyle(Theme.Colors.textPrimary)
            }
            .toggleStyle(KitSwitchStyle())
            if let note { Note(text: note, size: 14) }
        }
    }
}

// MARK: Errors

/// A read that failed (QueryError): the web's words, the detail, and Retry.
struct LoadErrorBlock: View {
    let message: String
    let retry: () async -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s3) {
            HStack(spacing: Theme.Space.s2) {
                LucideIcon(icon: .circleAlert, size: 16).foregroundStyle(Theme.Colors.negative)
                Text(language.t("common:errors.connection")).kitText(14)
            }
            Text(message)
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(Theme.Colors.textMuted)
                .lineLimit(3)
            Button {
                Task { await retry() }
            } label: {
                IconLabel(text: language.t("common:actions.retry"), icon: .rotateCw, size: 14)
            }
            .buttonStyle(.kit(.outline, .sm, scheme: .gray))
        }
    }
}
