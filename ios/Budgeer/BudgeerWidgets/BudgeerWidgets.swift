// Budgeer's widgets (the BudgeerWidgets app extension): "This month" on the
// Home Screen (small and medium) and on the Lock Screen (the rectangle and
// the line over the clock), and the Lock Screen's "+ Add". They show the
// snapshot the app leaves in the App Group (WidgetShelf, written by
// WidgetSync); this extension runs no core, reads no server and holds no
// session. A snapshot of another month shows "open the app" instead of old
// figures, so each timeline also has an entry at the next midnight. A tap
// opens Home, the + (and the circle) Add as a new expense (WidgetLinks).
import SwiftUI
import WidgetKit

@main
struct BudgeerWidgets: WidgetBundle {
    var body: some Widget {
        MonthWidget()
        AddWidget()
    }
}

struct MonthEntry: TimelineEntry {
    let date: Date
    /// This month's figures, nil when there are none for `date`'s month.
    let figures: WidgetSnapshot?
    let words: WidgetWords
}

struct MonthProvider: TimelineProvider {
    func placeholder(in context: Context) -> MonthEntry {
        MonthEntry(date: Date(), figures: nil, words: WidgetWords(language: nil))
    }

    func getSnapshot(in context: Context, completion: @escaping (MonthEntry) -> Void) {
        completion(entry(at: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MonthEntry>) -> Void) {
        let now = Date()
        let midnight = Calendar.current.nextDate(after: now, matching: DateComponents(hour: 0, minute: 0),
                                                 matchingPolicy: .nextTime) ?? now.addingTimeInterval(3600)
        completion(Timeline(entries: [entry(at: now), entry(at: midnight)], policy: .after(midnight)))
    }

    private func entry(at date: Date) -> MonthEntry {
        let kept = WidgetShelf.shared.read()
        let current = kept.flatMap { $0.covers(WidgetSnapshot.isoDay(date)) ? $0 : nil }
        return MonthEntry(date: date, figures: current, words: WidgetWords(language: kept?.language))
    }
}

struct MonthEntryView: View {
    let entry: MonthEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        content
            .widgetURL(WidgetLinks.home)
            .containerBackground(for: .widget) {
                if family == .systemSmall || family == .systemMedium { Theme.Colors.surface } else { Color.clear }
            }
    }

    @ViewBuilder private var content: some View {
        switch family {
        case .systemMedium:
            MonthWidgetView(figures: entry.figures, words: entry.words, size: .medium)
        case .accessoryRectangular:
            LockMonthView(figures: entry.figures, words: entry.words)
        case .accessoryInline:
            LockInlineView(figures: entry.figures, words: entry.words)
        default:
            MonthWidgetView(figures: entry.figures, words: entry.words, size: .small)
        }
    }
}

struct MonthWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetShelf.monthKind, provider: MonthProvider()) { entry in
            MonthEntryView(entry: entry)
        }
        .configurationDisplayName(Text(verbatim: WidgetWords(language: WidgetShelf.shared.read()?.language).thisMonth))
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

/// "+ Add" on the Lock Screen: no figures, the same at every moment.
struct AddEntry: TimelineEntry {
    let date: Date
    let words: WidgetWords
}

struct AddProvider: TimelineProvider {
    func placeholder(in context: Context) -> AddEntry { entry() }

    func getSnapshot(in context: Context, completion: @escaping (AddEntry) -> Void) {
        completion(entry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<AddEntry>) -> Void) {
        completion(Timeline(entries: [entry()], policy: .never))
    }

    private func entry() -> AddEntry {
        AddEntry(date: Date(), words: WidgetWords(language: WidgetShelf.shared.read()?.language))
    }
}

struct AddWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetShelf.addKind, provider: AddProvider()) { entry in
            AddCircleView(words: entry.words)
                .widgetURL(WidgetLinks.add)
                .containerBackground(for: .widget) { Color.clear }
        }
        .configurationDisplayName(Text(verbatim: WidgetWords(language: WidgetShelf.shared.read()?.language).add))
        .supportedFamilies([.accessoryCircular])
    }
}
