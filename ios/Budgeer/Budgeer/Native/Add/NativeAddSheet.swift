// Add, redesigned as an amount-first sheet. Collapsed (about 60% of the
// screen): the big amount, a number keypad, then the category chips. Pull it
// up (the large detent) and the keypad steps aside for the details: what it
// was for, the date, Repeat, Currency, Receipt, "Who's it for?", Paid from
// and Notes. Swipe down to cancel; Save gives a success tap.
import SwiftUI

extension PresentationDetent {
    /// Add's collapsed height: the amount, the keypad and the chips.
    static let nativeAdd = PresentationDetent.fraction(0.6)
}

extension View {
    /// The Add sheet's presentation: two detents and the grabber; on iOS 17–18
    /// the sand canvas behind it (iOS 26 keeps the system's glass sheet).
    func nativeAddPresentation(detent: Binding<PresentationDetent>) -> some View {
        modifier(NativeAddPresentation(detent: detent))
    }
}

struct NativeAddPresentation: ViewModifier {
    @Binding var detent: PresentationDetent

    #if compiler(>=6.2)
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .presentationDetents([.nativeAdd, .large], selection: $detent)
                .presentationDragIndicator(.visible)
        } else {
            content
                .presentationDetents([.nativeAdd, .large], selection: $detent)
                .presentationDragIndicator(.visible)
                .presentationBackground(NativeStyle.canvas)
                .presentationCornerRadius(28)
        }
    }
    #else
    func body(content: Content) -> some View {
        content
            .presentationDetents([.nativeAdd, .large], selection: $detent)
            .presentationDragIndicator(.visible)
            .presentationBackground(NativeStyle.canvas)
            .presentationCornerRadius(28)
    }
    #endif
}

struct NativeAddSheet: View {
    let sample: NativeSample
    @Binding var detent: PresentationDetent
    @Environment(AppLanguage.self) private var language
    @State private var kind = "expense"
    @State private var category = "coffee"
    @State private var note = ""
    @State private var memo = ""
    @State private var forWhom = "me"
    @State private var saved = 0

    private var expanded: Bool { detent == .large }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    amount
                    if !expanded {
                        NativeKeypad()
                            .transition(.move(edge: .top).combined(with: .opacity))
                    }
                    chips
                    if expanded {
                        details
                            .transition(.opacity)
                    } else {
                        Label(language.t("ios:native.add.pullUp"), systemImage: "chevron.compact.up")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                    }
                }
                .padding(.top, 4)
                .padding(.bottom, 24)
                .animation(.snappy, value: expanded)
            }
            .scrollDisabled(!expanded)
            .navigationTitle(language.t(kind == "income" ? "ios:native.add.newIncome" : "ios:native.add.newExpense"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {} label: {
                        Image(systemName: "xmark")
                    }
                    .accessibilityLabel(language.t("common:actions.cancel"))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(language.t("common:actions.save")) { saved += 1 }
                        .fontWeight(.semibold)
                }
            }
            .sensoryFeedback(.success, trigger: saved)
        }
    }

    // MARK: The amount

    private var amount: some View {
        VStack(spacing: 10) {
            Picker("", selection: $kind) {
                Text(language.t("transactions:kinds.expense")).tag("expense")
                Text(language.t("transactions:kinds.income")).tag("income")
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 260)
            NativeMoney(text: sample.addAmount, value: sample.addAmountMinor, font: NativeStyle.money(58),
                        color: kind == "income" ? NativeStyle.positive : Color.primary)
                .padding(.horizontal, 20)
            HStack(spacing: 8) {
                pill(symbol: "calendar", text: language.t("ios:native.add.today"))
                pill(symbol: "eurosign.circle", text: "EUR")
            }
        }
        .padding(.top, 6)
    }

    private func pill(symbol: String, text: String) -> some View {
        Button {} label: {
            HStack(spacing: 5) {
                Image(systemName: symbol)
                Text(text)
                Image(systemName: "chevron.down").font(.caption2.weight(.bold))
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(Color.primary)
            .padding(.horizontal, 12)
            .frame(minHeight: 32)
            .background(Color.primary.opacity(0.06), in: Capsule())
        }
        .buttonStyle(.plain)
    }

    // MARK: Category chips

    private var chips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(sample.chips) { chip in
                    let picked = chip.id == category
                    Button { category = chip.id } label: {
                        HStack(spacing: 7) {
                            CategoryBadge(look: chip.look, size: 26)
                            Text(chip.name)
                                .font(.subheadline.weight(picked ? .semibold : .regular))
                                .lineLimit(1)
                        }
                        .padding(.leading, 6)
                        .padding(.trailing, 12)
                        .frame(minHeight: 44)
                        .background(picked ? Theme.Colors.accentSubtle : NativeStyle.card, in: Capsule())
                        .overlay {
                            Capsule().stroke(picked ? NativeStyle.tint : Color.primary.opacity(0.08),
                                             lineWidth: picked ? 1.5 : 0.5)
                        }
                        .foregroundStyle(Color.primary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(picked ? .isSelected : [])
                }
            }
            .padding(.horizontal, 16)
        }
        .sensoryFeedback(.selection, trigger: category)
    }

    // MARK: The details (expanded)

    private var details: some View {
        VStack(spacing: 18) {
            NativeCard {
                TextField(language.t("ios:native.add.whatFor"), text: $note)
                    .padding(.vertical, 12)
                Divider()
                NativeDetailRow(symbol: "calendar", color: NativeStyle.coral, title: language.t("transactions:form.date"),
                                value: language.t("ios:native.add.today"))
            }
            NativeCard(title: language.t("ios:native.add.details")) {
                NativeDetailRow(symbol: "repeat", color: Color(hex: 0x8558D0),
                                title: language.t("transactions:form.repeat.title"), value: language.t("ios:native.add.repeatOff"))
                Divider()
                NativeDetailRow(symbol: "eurosign", color: Color(hex: 0x3A78D4),
                                title: language.t("transactions:form.currency"), value: "EUR")
                Divider()
                NativeDetailRow(symbol: "camera.fill", color: Color(hex: 0x6B7280),
                                title: language.t("common:receipt.alt"), value: language.t("ios:native.add.receiptAdd"))
                Divider()
                NativeDetailRow(symbol: "creditcard.fill", color: NativeStyle.amber,
                                title: language.t("ios:native.add.paidFrom"), value: language.t("ios:native.add.account"))
            }
            NativeCard(title: language.t("groups:whoFor.label")) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        whoChip("me", language.t("ios:native.add.justMe"), symbol: "person.fill")
                        whoChip("trip", sample.trip.name, symbol: "person.2.fill")
                    }
                    .padding(.vertical, 10)
                }
            }
            NativeCard(title: language.t("transactions:form.notes")) {
                TextField(language.t("transactions:form.notes"), text: $memo, axis: .vertical)
                    .lineLimit(2...4)
                    .padding(.vertical, 12)
            }
        }
        .padding(.horizontal, 16)
    }

    private func whoChip(_ id: String, _ title: String, symbol: String) -> some View {
        let picked = forWhom == id
        return Button { forWhom = id } label: {
            Label(title, systemImage: symbol)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .padding(.horizontal, 14)
                .frame(minHeight: 40)
                .foregroundStyle(picked ? Color.white : Color.primary)
                .background(picked ? NativeStyle.solid : Color.primary.opacity(0.06), in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// A rounded card of rows (an inset-grouped section drawn in a scroll view).
struct NativeCard<Content: View>: View {
    var title: String? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let title {
                Text(title)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.leading, 16)
            }
            VStack(spacing: 0) { content() }
                .padding(.horizontal, 16)
                .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }
}

/// A detail row: its icon tile, its name, its value and a chevron.
struct NativeDetailRow: View {
    let symbol: String
    let color: Color
    let title: String
    let value: String

    var body: some View {
        HStack(spacing: 12) {
            NativeIconTile(symbol: symbol, color: color, size: 28)
            Text(title).lineLimit(1)
            Spacer(minLength: 8)
            Text(value)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .frame(minHeight: 48)
    }
}

/// The number pad: 1–9, the decimal point, 0 and delete, with a light tap
/// on every key.
struct NativeKeypad: View {
    @State private var taps = 0
    private let keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"]

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
            ForEach(keys, id: \.self) { key in
                Button { taps += 1 } label: {
                    Group {
                        if key == "⌫" {
                            Image(systemName: "delete.left")
                        } else {
                            Text(verbatim: key)
                        }
                    }
                    .font(.system(size: 26, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.primary)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .sensoryFeedback(.impact(weight: .light), trigger: taps)
    }
}
