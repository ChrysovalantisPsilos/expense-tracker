// The form pieces the entry form and the other screens share, after the
// web's FormControl look: a label over its field (with Type it's
// "Suggested" mark), the inline error or a helper line under it, a date
// field over the web's 'YYYY-MM-DD' strings, a muted note, the danger
// button, a failed load with Retry, and a Suggested mark.
import SwiftUI

/// A labelled field: label (and mark) over the content, then the error or the help.
struct FormRow<Content: View>: View {
    let label: String
    var suggested = false
    var error: String? = nil
    var help: String? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s2) {
            HStack(alignment: .firstTextBaseline) {
                FieldLabel(text: label)
                if suggested {
                    Spacer(minLength: Theme.Space.s2)
                    SuggestedMark()
                }
            }
            content()
            if let error {
                Note(text: error, tone: Theme.Colors.negative)
            } else if let help {
                Note(text: help)
            }
        }
    }
}

/// A small muted line (a helper, a note under a figure).
struct Note: View {
    let text: String
    var tone: Color = Theme.Colors.textMuted
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Text(text)
            .font(Theme.Fonts.body(13, lang: language.current))
            .foregroundStyle(tone)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// Type it's mark on a field it filled: a sparkle and "Suggested".
struct SuggestedMark: View {
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: "sparkle").font(.system(size: 10, weight: .semibold))
            Text(language.t("ai:suggested"))
        }
        .font(Theme.Fonts.body(12, weight: .semibold, lang: language.current))
        .foregroundStyle(Theme.Colors.accentFg)
    }
}

/// A day, stored as the web's 'YYYY-MM-DD' (ISODay converts).
struct DayField: View {
    let label: String
    @Binding var iso: String
    @Environment(AppLanguage.self) private var language

    var body: some View {
        DatePicker(label, selection: Binding(
            get: { ISODay.date(iso) ?? Date() },
            set: { iso = ISODay.string($0) }
        ), displayedComponents: .date)
        .labelsHidden()
        .datePickerStyle(.compact)
        .tint(Theme.Colors.accentFg)
        .accessibilityLabel(label)
        // The day in the app's language (Greek months on the Greek form).
        .environment(\.locale, language.current == "el" ? Locale(identifier: "el_GR") : Locale.current)
    }
}

/// The outline button in the danger tone (Delete).
struct DangerButtonStyle: ButtonStyle {
    @Environment(AppLanguage.self) private var language

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.Fonts.body(15, weight: .semibold, lang: language.current))
            .foregroundStyle(Theme.Colors.negative)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(configuration.isPressed ? Theme.Colors.negativeSubtle : Theme.Colors.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                .stroke(Theme.Colors.negative.opacity(0.5), lineWidth: 1))
    }
}

/// A read that failed: the web's QueryError words, the detail, and Retry.
struct LoadErrorBlock: View {
    let message: String
    let retry: () async -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s3) {
            Text(language.t("common:errors.connection"))
                .font(Theme.Fonts.body(15, lang: language.current))
                .foregroundStyle(Theme.Colors.textPrimary)
            Text(message)
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(Theme.Colors.textMuted)
                .lineLimit(3)
            Button {
                Task { await retry() }
            } label: {
                Text(language.t("common:actions.retry"))
            }
            .buttonStyle(OutlineButtonStyle())
        }
    }
}

/// A switch row: the label (and a note under it) with the toggle at the end.
struct SwitchRow: View {
    let label: String
    var note: String? = nil
    var systemImage: String? = nil
    @Binding var isOn: Bool
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s1) {
            Toggle(isOn: $isOn) {
                HStack(spacing: Theme.Space.s2) {
                    if let systemImage {
                        Image(systemName: systemImage).font(.system(size: 13, weight: .semibold))
                    }
                    Text(label).font(Theme.Fonts.body(15, weight: .semibold, lang: language.current))
                }
                .foregroundStyle(Theme.Colors.textPrimary)
            }
            .tint(Theme.Colors.accentSolid)
            if let note { Note(text: note) }
        }
    }
}
