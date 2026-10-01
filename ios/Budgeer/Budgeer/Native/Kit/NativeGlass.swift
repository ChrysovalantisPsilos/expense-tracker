// Liquid Glass for the control layer (the tab bar, the + button, floating
// controls, the Settle up button), as Apple's guidance puts it: glass for
// navigation and controls that float above the content, never for the
// content's own cards. iOS 26 draws the real material (glassEffect, the
// .glass / .glassProminent button styles); iOS 17 and 18 get the closest
// standard material (.regularMaterial, a hairline and a soft shadow), so an
// older phone keeps the same shapes. The iOS 26 branch only compiles with
// the iOS 26 SDK (Swift 6.2, Xcode 26+).
import SwiftUI

extension View {
    /// The glass behind a floating control, in `shape`; `tint` makes it the
    /// prominent (coloured) kind, `interactive` lets it react to touch.
    func nativeGlass<S: Shape>(_ shape: S, tint: Color? = nil, interactive: Bool = false) -> some View {
        modifier(NativeGlassModifier(shape: shape, tint: tint, interactive: interactive))
    }

    /// A button in glass: the plain kind, or the prominent one in the tint.
    func nativeGlassButton(prominent: Bool = false) -> some View {
        modifier(NativeGlassButtonModifier(prominent: prominent))
    }
}

struct NativeGlassModifier<S: Shape>: ViewModifier {
    let shape: S
    var tint: Color?
    var interactive: Bool

    #if compiler(>=6.2)
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(glass, in: shape)
        } else {
            fallback(content)
        }
    }

    @available(iOS 26.0, *)
    private var glass: Glass {
        var glass = Glass.regular
        if let tint { glass = glass.tint(tint) }
        if interactive { glass = glass.interactive() }
        return glass
    }
    #else
    func body(content: Content) -> some View {
        fallback(content)
    }
    #endif

    /// iOS 17–18: the standard material (or the tint), a hairline edge and a soft lift.
    private func fallback(_ content: Content) -> some View {
        content
            .background {
                if let tint {
                    shape.fill(tint)
                } else {
                    shape.fill(.regularMaterial)
                }
            }
            .overlay { shape.stroke(Color.primary.opacity(0.08), lineWidth: 0.5) }
            .shadow(color: Color.black.opacity(0.10), radius: 18, x: 0, y: 4)
    }
}

struct NativeGlassButtonModifier: ViewModifier {
    var prominent: Bool

    #if compiler(>=6.2)
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            if prominent {
                content.buttonStyle(.glassProminent).controlSize(.large)
            } else {
                content.buttonStyle(.glass).controlSize(.large)
            }
        } else {
            content.buttonStyle(NativeFallbackGlassButtonStyle(prominent: prominent))
        }
    }
    #else
    func body(content: Content) -> some View {
        content.buttonStyle(NativeFallbackGlassButtonStyle(prominent: prominent))
    }
    #endif
}

/// The glass button's shape on iOS 17–18: a 48 pt capsule in material (or
/// the solid accent), pressed a touch smaller.
struct NativeFallbackGlassButtonStyle: ButtonStyle {
    var prominent: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(prominent ? Color.white : NativeStyle.tint)
            .padding(.horizontal, 20)
            .frame(minHeight: 48)
            .nativeGlass(Capsule(), tint: prominent ? NativeStyle.solid : nil)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .opacity(configuration.isPressed ? 0.9 : 1)
            .animation(.snappy(duration: 0.2), value: configuration.isPressed)
    }
}
