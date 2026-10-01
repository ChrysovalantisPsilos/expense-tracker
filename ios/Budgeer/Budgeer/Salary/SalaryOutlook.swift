// Your salary's two outlook cards, each in two takes (DesignOptions.salary)
// with fewer figures up front and the rest a tap away.
//
// If things go on. A: the chart and the three ways by name; their figures,
// the yearly raise and the notes behind "Show details". B: the three ways
// with one figure each (what each adds up to); a tap opens a way in place:
// its line, the chart with that way lit, and for What if the raise to try.
//
// Against prices. A: the verdict, the real change big with the monthly gap
// under it; the country, the year, the headline and the two figures behind
// "Show details". B: the country and the year folded into one menu, then
// the pay, the prices and the real change as three lines, and the gap.
//
// Every figure and word is SalaryModel's (the core's) or salary's strings.
import SwiftUI

// MARK: If things go on

@MainActor
struct SalaryProjectionSection: View {
    let model: SalaryModel
    let projection: SalaryProjection
    @Environment(AppLanguage.self) private var language
    @Environment(\.design) private var design
    @State private var info = false
    /// A: the details shown.
    @State private var details = false
    /// B: the way open.
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
            switch design.salary {
            case .a: chartFirst
            case .b: waysFirst
            }
        } header: {
            SalaryInfoHeader(title: language.t("salary:projection.title"), shown: $info)
        }
        .listRowBackground(NativeStyle.card)
        .onAppear {
            guard design.unfolded else { return }
            details = true
            open = projection.ways.last?.id
        }
    }

    // MARK: A

    @ViewBuilder private var chartFirst: some View {
        VStack(alignment: .leading, spacing: 12) {
            ProjectionChartView(projection: projection)
                .animation(.smooth(duration: 0.45), value: projection.ways)
            VStack(alignment: .leading, spacing: 6) {
                ForEach(projection.ways) { way in
                    HStack(spacing: 10) {
                        SalaryWaySwatch(id: way.id, small: true)
                        Text(way.title).font(.footnote.weight(.semibold))
                    }
                }
            }
            .accessibilityElement(children: .combine)
        }
        .padding(.vertical, 8)
        if details {
            Text(projection.total).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            ForEach(projection.ways) { way in
                SalaryWayRow(way: way)
                if way.id == "whatIf" { SalaryWhatIfSlider(model: model, slider: projection.slider) }
            }
            notes
        }
        SalaryDetailsButton(open: $details)
    }

    // MARK: B

    @ViewBuilder private var waysFirst: some View {
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

    // MARK: Shared

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
    @Environment(\.design) private var design
    @State private var info = false
    /// A: the details shown.
    @State private var details = false

    var body: some View {
        Section {
            switch design.salary {
            case .a: verdict
            case .b: compared
            }
            if info {
                Text(prices.info).font(.footnote).foregroundStyle(.secondary)
            }
        } header: {
            SalaryInfoHeader(title: language.t("salary:inflation.title"), shown: $info)
        }
        .listRowBackground(NativeStyle.card)
        .onAppear { if design.unfolded { details = true } }
    }

    /// The real change's tile (the core's "real").
    private var real: SalaryPrices.Tile? { prices.tiles.first { $0.key == "real" } }

    private var countryBinding: Binding<String> {
        Binding(get: { country }, set: { value in Task { await model.setCountry(value) } })
    }

    private var sinceBinding: Binding<Int> {
        Binding(get: { prices.from ?? 0 }, set: { value in withAnimation(.snappy) { model.setSince(value) } })
    }

    // MARK: A

    @ViewBuilder private var verdict: some View {
        if let empty = prices.empty {
            Text(empty).font(.subheadline).foregroundStyle(.secondary)
        } else {
            VStack(alignment: .leading, spacing: 4) {
                if let real {
                    Text(real.label).font(.footnote).foregroundStyle(.secondary)
                    Text(real.text)
                        .font(NativeStyle.money(34))
                        .foregroundStyle(SavingsView.color(real.tone))
                        .monospacedDigit()
                        .contentTransition(.numericText())
                }
                if let gap = prices.gap {
                    NativeRich.text(model.rich(gap)).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 4)
        }
        if details {
            Picker(language.t("salary:inflation.country"), selection: countryBinding) {
                ForEach(prices.countries, id: \.value) { choice in Text(choice.label).tag(choice.value) }
            }
            .pickerStyle(.segmented)
            if prices.empty == nil {
                if prices.choices.count > 1 {
                    HStack {
                        Text(language.t("salary:inflation.since")).font(.subheadline).foregroundStyle(.secondary)
                        Picker(language.t("salary:inflation.since"), selection: sinceBinding) {
                            ForEach(prices.choices, id: \.value) { choice in Text(choice.label).tag(choice.value) }
                        }
                        .pickerStyle(.segmented)
                    }
                }
                if let headline = prices.headline {
                    Text(headline).font(.subheadline.weight(.semibold))
                }
                HStack(spacing: 8) {
                    ForEach(prices.tiles.filter { $0.key != "real" }, id: \.key) { tile in
                        SalaryTile(label: tile.label, text: tile.text, tone: tile.tone, note: nil)
                    }
                }
                .listRowInsets(EdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 12))
            }
        }
        SalaryDetailsButton(open: $details)
    }

    // MARK: B

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

/// "Show details" / "Hide details", its chevron turning.
struct SalaryDetailsButton: View {
    @Binding var open: Bool
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Button {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.86)) { open.toggle() }
        } label: {
            HStack(spacing: 6) {
                Text(language.t(open ? "ios:native.details.hide" : "ios:native.details.show"))
                Image(systemName: "chevron.down")
                    .font(.caption.weight(.semibold))
                    .rotationEffect(.degrees(open ? 180 : 0))
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(NativeStyle.tint)
        }
        .buttonStyle(.borderless)
    }
}

/// A way's colour as its line in the chart (what if dashed).
struct SalaryWaySwatch: View {
    let id: String
    var small = false

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(SalaryView.wayColor(id))
            .frame(width: small ? 14 : 18, height: small ? 3 : 4)
            .frame(width: small ? 18 : 32, height: small ? 12 : 32)
            .background(small ? Color.clear : Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// A way with its line (where the pay is by the end) and what it adds up to.
struct SalaryWayRow: View {
    let way: SalaryProjection.Way
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(spacing: 12) {
            SalaryWaySwatch(id: way.id)
            VStack(alignment: .leading, spacing: 2) {
                Text(way.title).font(.subheadline.weight(.semibold))
                Text(way.meta).font(.footnote).foregroundStyle(.secondary)
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 0) {
                Text(way.total).font(.subheadline.weight(.bold)).monospacedDigit().contentTransition(.numericText())
                Text(language.t("salary:projection.earned")).font(.caption).foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
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
