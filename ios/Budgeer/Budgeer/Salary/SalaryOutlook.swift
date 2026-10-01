// Your salary's two outlook cards, few figures up front and the rest a tap
// away.
//
// If things go on: the three ways with one figure each (what each adds up
// to); a tap opens a way in place: its line, the chart with that way lit,
// and for What if the raise to try.
//
// Against prices: the country and the year as one menu, then the pay, the
// prices and the real change as three lines, and the monthly gap.
//
// Every figure and word is SalaryModel's (the core's) or salary's strings.
import SwiftUI

// MARK: If things go on

@MainActor
struct SalaryProjectionSection: View {
    let model: SalaryModel
    let projection: SalaryProjection
    @Environment(AppLanguage.self) private var language
    @State private var info = false
    /// The way open.
    @State private var open: String?

    var body: some View {
        Section {
            Picker(language.t("salary:projection.horizon"),
                   selection: Binding(get: { model.years }, set: { value in withAnimation(.snappy) { model.setYears(value) } })) {
                ForEach(projection.horizons, id: \.value) { choice in Text(choice.label).tag(choice.value) }
            }
            .pickerStyle(.segmented)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 4, trailing: 0))
            if info {
                Text(language.t("salary:projection.info")).font(.footnote).foregroundStyle(.secondary)
            }
            ways
        } header: {
            SalaryInfoHeader(title: language.t("salary:projection.title"), shown: $info)
        }
        .listRowBackground(NativeStyle.card)
    }

    @ViewBuilder private var ways: some View {
        Text(projection.total).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
        ForEach(projection.ways) { way in
            Button {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.86)) { open = open == way.id ? nil : way.id }
            } label: {
                HStack(spacing: 12) {
                    SalaryWaySwatch(id: way.id)
                    Text(way.title)
                        .font(.subheadline.weight(.semibold))
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 6)
                    Text(way.total)
                        .font(.subheadline.weight(.bold))
                        .monospacedDigit()
                        .contentTransition(.numericText())
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .rotationEffect(.degrees(open == way.id ? 180 : 0))
                }
                .foregroundStyle(Color.primary)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(open == way.id ? .isSelected : [])
            if open == way.id {
                VStack(alignment: .leading, spacing: 12) {
                    Text(way.meta).font(.footnote).foregroundStyle(.secondary)
                    ProjectionChartView(projection: projection, focus: way.id)
                        .animation(.smooth(duration: 0.45), value: projection.ways)
                    if way.id == "whatIf" { SalaryWhatIfSlider(model: model, slider: projection.slider) }
                }
                .padding(.vertical, 4)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        if open != nil { notes }
    }

    /// The notes under an open way.
    @ViewBuilder private var notes: some View {
        if let later = projection.trendLater {
            Text(later).font(.footnote).foregroundStyle(.secondary)
        }
        Text(language.t("salary:projection.estimate")).font(.footnote).foregroundStyle(.secondary)
    }
}

// MARK: Against prices

@MainActor
struct SalaryPricesSection: View {
    let model: SalaryModel
    let prices: SalaryPrices
    let country: String
    @Environment(AppLanguage.self) private var language
    @State private var info = false

    var body: some View {
        Section {
            compared
            if info {
                Text(prices.info).font(.footnote).foregroundStyle(.secondary)
            }
        } header: {
            SalaryInfoHeader(title: language.t("salary:inflation.title"), shown: $info)
        }
        .listRowBackground(NativeStyle.card)
    }

    private var countryBinding: Binding<String> {
        Binding(get: { country }, set: { value in Task { await model.setCountry(value) } })
    }

    private var sinceBinding: Binding<Int> {
        Binding(get: { prices.from ?? 0 }, set: { value in withAnimation(.snappy) { model.setSince(value) } })
    }

    @ViewBuilder private var compared: some View {
        Menu {
            Picker(language.t("salary:inflation.country"), selection: countryBinding) {
                ForEach(prices.countries, id: \.value) { choice in Text(choice.label).tag(choice.value) }
            }
            if prices.choices.count > 1 {
                Picker(language.t("salary:inflation.since"), selection: sinceBinding) {
                    ForEach(prices.choices, id: \.value) { choice in Text(choice.label).tag(choice.value) }
                }
            }
        } label: {
            HStack(spacing: 6) {
                Text(menuTitle).font(.subheadline.weight(.semibold))
                Image(systemName: "chevron.up.chevron.down").font(.caption.weight(.semibold))
            }
            .foregroundStyle(NativeStyle.tint)
        }
        if let empty = prices.empty {
            Text(empty).font(.subheadline).foregroundStyle(.secondary)
        } else {
            ForEach(prices.tiles, id: \.key) { tile in
                let lead = tile.key == "real"
                HStack(alignment: .firstTextBaseline) {
                    Text(tile.label)
                        .font(lead ? .subheadline.weight(.semibold) : .subheadline)
                        .foregroundStyle(lead ? Color.primary : Color.secondary)
                    Spacer(minLength: 8)
                    Text(tile.text)
                        .font(lead ? .title3.weight(.bold) : .body.weight(.semibold))
                        .foregroundStyle(SavingsView.color(tile.tone))
                        .monospacedDigit()
                        .contentTransition(.numericText())
                }
                .accessibilityElement(children: .combine)
            }
            if let gap = prices.gap {
                NativeRich.text(model.rich(gap)).font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }

    /// "Belgium · since 2018" (or just the country before there's a year to pick).
    private var menuTitle: String {
        let place = prices.countries.first { $0.value == country }?.label ?? country
        guard let year = prices.choices.first(where: { $0.value == prices.from })?.label else { return place }
        return language.t("ios:native.salary.pricesFrom", ["country": .string(place), "year": .string(year)])
    }
}

// MARK: Pieces

/// A section's title with its ⓘ (opens the explanation in place).
struct SalaryInfoHeader: View {
    let title: String
    @Binding var shown: Bool
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(spacing: 6) {
            Text(title).font(.title3.weight(.semibold)).foregroundStyle(Color.primary)
            Button {
                withAnimation(.snappy) { shown.toggle() }
            } label: {
                Image(systemName: shown ? "info.circle.fill" : "info.circle")
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.borderless)
            .foregroundStyle(NativeStyle.tint)
            .accessibilityLabel(Text(language.t("common:info")))
        }
        .textCase(nil)
        .padding(.horizontal, -4)
    }
}

/// A way's colour as its line in the chart (what if dashed).
struct SalaryWaySwatch: View {
    let id: String

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(SalaryView.wayColor(id))
            .frame(width: 18, height: 4)
            .frame(width: 32, height: 32)
            .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// What if's yearly raise to try.
struct SalaryWhatIfSlider: View {
    let model: SalaryModel
    let slider: SalaryProjection.Slider
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(spacing: 10) {
            Text(language.t("salary:projection.slider")).font(.footnote).foregroundStyle(.secondary)
            Slider(value: Binding(get: { model.whatIf }, set: { model.setWhatIf($0) }),
                   in: slider.min...slider.max, step: slider.step)
                .tint(NativeStyle.tint)
                .accessibilityValue(Text(slider.value))
            Text(slider.value)
                .font(.subheadline.weight(.bold))
                .monospacedDigit()
                .contentTransition(.numericText())
                .frame(width: 52, alignment: .trailing)
        }
    }
}
