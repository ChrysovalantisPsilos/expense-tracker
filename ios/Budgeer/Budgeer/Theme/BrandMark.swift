// Budgeer's mark, drawn in SwiftUI (no image asset).
import SwiftUI


/// Budgeer's mark (public/budgeer-mark.svg, markGeometry.js): a lowercase b
/// whose bowl is a budget ring, amber then coral, drawn on a 48-unit grid.
struct BrandMark: View {
    var size: CGFloat = 26

    var body: some View {
        Canvas { context, canvas in
            let unit = canvas.width / 48
            let stem = CGRect(x: 9.25 * unit, y: 3.6 * unit, width: 7.5 * unit, height: 29.4 * unit)
            context.fill(Path(roundedRect: stem, cornerRadius: 3.75 * unit), with: .color(Theme.Palette.brand500))
            let center = CGPoint(x: 24 * unit, y: 29.6 * unit)
            let radius = 11 * unit
            let circumference = 2 * Double.pi * 11
            // The SVG's dashes (19 then 48.2 from 21) as turns from the top, clockwise.
            let arcs: [(from: Double, length: Double, color: Color)] = [
                (0, 19, Theme.Palette.amber400), (21, 48.2, Theme.Palette.brand500),
            ]
            for arc in arcs {
                var path = Path()
                let start = -Double.pi / 2 + arc.from / circumference * 2 * Double.pi
                let end = start + arc.length / circumference * 2 * Double.pi
                path.addArc(center: center, radius: radius, startAngle: .radians(start), endAngle: .radians(end), clockwise: false)
                context.stroke(path, with: .color(arc.color), style: StrokeStyle(lineWidth: 7.5 * unit))
            }
        }
        .frame(width: size, height: size)
        .accessibilityLabel("Budgeer")
    }
}
