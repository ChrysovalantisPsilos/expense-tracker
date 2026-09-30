// Google's four-colour "G", drawn from the same paths as the web's
// GoogleIcon (viewBox 48×48). Google's guidelines: the mark keeps its own
// colours, so it is never tinted by the button it sits on.
import SwiftUI

struct GoogleMark: View {
    var size: CGFloat = 20

    var body: some View {
        Canvas { context, canvas in
            let scale = canvas.width / 48
            for part in GoogleMark.parts {
                var path = Path()
                part.draw(&path) { x, y in CGPoint(x: x * scale, y: y * scale) }
                context.fill(path, with: .color(Color(hex: part.color)))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private struct Part {
        let color: UInt32
        let draw: (inout Path, (CGFloat, CGFloat) -> CGPoint) -> Void
    }

    private static let parts: [Part] = [
        Part(color: 0xEA4335) { p, pt in
            p.move(to: pt(24, 9.5))
            p.addCurve(to: pt(33.21, 13.1), control1: pt(27.54, 9.5), control2: pt(30.71, 10.72))
            p.addLine(to: pt(40.06, 6.25))
            p.addCurve(to: pt(24, 0), control1: pt(35.9, 2.38), control2: pt(30.47, 0))
            p.addCurve(to: pt(2.56, 13.22), control1: pt(14.62, 0), control2: pt(6.51, 5.38))
            p.addLine(to: pt(10.54, 19.41))
            p.addCurve(to: pt(24, 9.5), control1: pt(12.43, 13.72), control2: pt(17.74, 9.5))
            p.closeSubpath()
        },
        Part(color: 0x4285F4) { p, pt in
            p.move(to: pt(46.98, 24.55))
            p.addCurve(to: pt(46.6, 20), control1: pt(46.98, 22.98), control2: pt(46.83, 21.46))
            p.addLine(to: pt(24, 20))
            p.addLine(to: pt(24, 29.02))
            p.addLine(to: pt(36.94, 29.02))
            p.addCurve(to: pt(32.16, 36.2), control1: pt(36.36, 31.98), control2: pt(34.68, 34.5))
            p.addLine(to: pt(39.89, 42.2))
            p.addCurve(to: pt(46.98, 24.55), control1: pt(44.4, 38.02), control2: pt(46.98, 31.84))
            p.closeSubpath()
        },
        Part(color: 0xFBBC05) { p, pt in
            p.move(to: pt(10.53, 28.59))
            p.addCurve(to: pt(9.77, 24), control1: pt(10.05, 27.14), control2: pt(9.77, 25.6))
            p.addCurve(to: pt(10.53, 19.41), control1: pt(9.77, 22.4), control2: pt(10.04, 20.86))
            p.addLine(to: pt(2.55, 13.22))
            p.addCurve(to: pt(0, 24), control1: pt(0.92, 16.46), control2: pt(0, 20.12))
            p.addCurve(to: pt(2.56, 34.78), control1: pt(0, 27.88), control2: pt(0.92, 31.54))
            p.addLine(to: pt(10.53, 28.59))
            p.closeSubpath()
        },
        Part(color: 0x34A853) { p, pt in
            p.move(to: pt(24, 48))
            p.addCurve(to: pt(39.89, 42.19), control1: pt(30.48, 48), control2: pt(35.93, 45.87))
            p.addLine(to: pt(32.16, 36.19))
            p.addCurve(to: pt(24, 38.49), control1: pt(30.01, 37.64), control2: pt(27.24, 38.49))
            p.addCurve(to: pt(10.53, 28.58), control1: pt(17.74, 38.49), control2: pt(12.43, 34.27))
            p.addLine(to: pt(2.55, 34.77))
            p.addCurve(to: pt(24, 48), control1: pt(6.51, 42.62), control2: pt(14.62, 48))
            p.closeSubpath()
        },
    ]
}
