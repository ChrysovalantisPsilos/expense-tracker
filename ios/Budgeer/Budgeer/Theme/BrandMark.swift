// Budgeer's mark, drawn in SwiftUI (no image asset), and the sign-in's
// intro: the website's loading ring played once (loaderTiming.js) — the
// amber arc draws, then the coral one, the stem stretches and settles, and
// the wordmark brightens beside it.
import BudgeerCore
import SwiftUI

/// One moment of the ring's draw (loaderTiming.ringFrame): how much of each
/// arc is in (0…1), the ring's opacity, the stem's vertical scale and the
/// wordmark's opacity.
struct RingFrame: Codable, Equatable, Sendable {
    let amber: Double
    let coral: Double
    let opacity: Double
    let stem: Double
    let word: Double

    /// The still, full mark.
    static let full = RingFrame(amber: 1, coral: 1, opacity: 1, stem: 1, word: 1)
}

/// Budgeer's mark (public/budgeer-mark.svg, markGeometry.js): a lowercase b
/// whose bowl is a budget ring, amber then coral, drawn on a 48-unit grid.
/// `frame` draws a moment of the loading ring's draw, on its sand track.
struct BrandMark: View {
    var size: CGFloat = 26
    var frame: RingFrame = .full

    var body: some View {
        Canvas { context, canvas in
            let unit = canvas.width / 48
            // The stem stretches from its foot (the loader's rl-breathe).
            let foot = (3.6 + 29.4) * unit
            let height = 29.4 * unit * frame.stem
            let stem = CGRect(x: 9.25 * unit, y: foot - height, width: 7.5 * unit, height: height)
            context.fill(Path(roundedRect: stem, cornerRadius: 3.75 * unit), with: .color(Theme.Palette.brand500))
            let center = CGPoint(x: 24 * unit, y: 29.6 * unit)
            let radius = 11 * unit
            let circumference = 2 * Double.pi * 11
            let style = StrokeStyle(lineWidth: 7.5 * unit)
            if frame != .full {
                var track = Path()
                track.addArc(center: center, radius: radius, startAngle: .zero, endAngle: .degrees(360), clockwise: false)
                context.stroke(track, with: .color(Theme.Colors.subtle), style: style)
            }
            // The SVG's dashes (19 then 48.2 from 21) as turns from the top, clockwise.
            let arcs: [(from: Double, length: Double, drawn: Double, color: Color)] = [
                (0, 19, frame.amber, Theme.Palette.amber400), (21, 48.2, frame.coral, Theme.Palette.brand500),
            ]
            var ring = context
            ring.opacity = frame.opacity
            for arc in arcs where arc.drawn > 0 {
                var path = Path()
                let start = -Double.pi / 2 + arc.from / circumference * 2 * Double.pi
                let end = start + arc.length * arc.drawn / circumference * 2 * Double.pi
                path.addArc(center: center, radius: radius, startAngle: .radians(start), endAngle: .radians(end), clockwise: false)
                ring.stroke(path, with: .color(arc.color), style: style)
            }
        }
        .frame(width: size, height: size)
        .accessibilityLabel("Budgeer")
    }
}

/// The mark and the wordmark side by side, playing the loading ring's draw
/// once when it appears (loaderTiming.ringIntro: the frames, their length,
/// the word) and coming to rest on the full mark. Reduced motion, or a
/// picture's frozen moment (nativeFrozenMotion, 0…1), skip the playing.
struct BrandIntro: View {
    var markSize: CGFloat = 46
    var wordSize: CGFloat = 34
    @Environment(\.nativeFrozenMotion) private var frozen
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start: Date?
    @State private var finished = false

    /// One draw's frames at 60 a second, from the core.
    private static let intro: Intro = (try? BudgeerCore.shared.call("loaderTiming", "ringIntro", [108]))
        ?? Intro(wordmark: "budgeer", cycleMs: 1800, frames: [.full])

    struct Intro: Codable {
        let wordmark: String
        let cycleMs: Double
        let frames: [RingFrame]
    }

    var body: some View {
        Group {
            if let frozen {
                lockup(BrandIntro.frame(at: frozen))
            } else if reduceMotion || finished {
                lockup(.full)
            } else {
                TimelineView(.animation) { context in
                    lockup(BrandIntro.frame(at: progress(context.date)))
                }
                .task {
                    try? await Task.sleep(nanoseconds: UInt64(BrandIntro.intro.cycleMs * 1_000_000))
                    finished = true
                }
            }
        }
        .onAppear { if start == nil { start = Date() } }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: "Budgeer"))
        .accessibilityAddTraits(.isHeader)
    }

    private func lockup(_ frame: RingFrame) -> some View {
        HStack(spacing: markSize * 0.22) {
            BrandMark(size: markSize, frame: frame)
            Text(verbatim: BrandIntro.intro.wordmark)
                .font(.custom("Poppins-Bold", size: wordSize, relativeTo: .largeTitle))
                .tracking(-0.02 * wordSize)
                .foregroundStyle(Color.primary)
                .opacity(frame.word)
        }
    }

    /// How far through the draw the intro is at `date` (0…1).
    private func progress(_ date: Date) -> Double {
        guard let start else { return 0 }
        return min(1, max(0, date.timeIntervalSince(start) * 1000 / BrandIntro.intro.cycleMs))
    }

    /// The frame `progress` of the way through (the nearest of the core's).
    static func frame(at progress: Double) -> RingFrame {
        let frames = intro.frames
        guard !frames.isEmpty else { return .full }
        let index = Int((min(1, max(0, progress)) * Double(frames.count - 1)).rounded())
        return frames[index]
    }
}
