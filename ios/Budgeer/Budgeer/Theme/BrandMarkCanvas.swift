// Budgeer's mark, drawn in SwiftUI (no image asset): the app's (the lock,
// the wizard, the sign-in's intro in BrandMark.swift) and the widgets'
// (compiled into the widget extension too, so nothing here reaches the core).
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
    /// One colour for the whole mark, the amber arc fainter (a Lock Screen
    /// widget, which the system draws in one tint); nil: the brand's colours.
    var mono: Color? = nil

    var body: some View {
        Canvas { context, canvas in
            let unit = canvas.width / 48
            // The stem stretches from its foot (the loader's rl-breathe).
            let foot = (3.6 + 29.4) * unit
            let height = 29.4 * unit * frame.stem
            let stem = CGRect(x: 9.25 * unit, y: foot - height, width: 7.5 * unit, height: height)
            context.fill(Path(roundedRect: stem, cornerRadius: 3.75 * unit), with: .color(mono ?? Theme.Palette.brand500))
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
                (0, 19, frame.amber, mono?.opacity(0.45) ?? Theme.Palette.amber400),
                (21, 48.2, frame.coral, mono ?? Theme.Palette.brand500),
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
