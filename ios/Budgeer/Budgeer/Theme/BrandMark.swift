// The sign-in's intro: the website's loading ring played once
// (loaderTiming.js) — the amber arc draws, then the coral one, the stem
// stretches and settles, and the wordmark brightens beside it. The mark
// itself is BrandMarkCanvas.swift (shared with the widgets).
import BudgeerCore
import SwiftUI

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
