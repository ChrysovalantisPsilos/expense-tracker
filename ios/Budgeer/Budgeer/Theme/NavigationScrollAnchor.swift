// The page's own vertical scroll view, named as the one its navigation bar
// follows. A page whose first content is a sideways pager (Home's months)
// holds two scroll views at its top, and the bar can follow the pager
// instead: the large title then never folds away and the page's top slides
// under it, blurred ("This month · Spent" behind "Home"). Placed in the
// page's scroll content (outside the pager), this finds the scroll view
// around it and hands it to the page's controller in the navigation stack
// (UIViewController.setContentScrollView), so the title folds as Activity's
// does. Nothing to draw; harmless where the bar already follows it.
import SwiftUI
import UIKit

struct NavigationScrollAnchor: UIViewRepresentable {
    func makeUIView(context: Context) -> AnchorView {
        let view = AnchorView()
        view.isUserInteractionEnabled = false
        view.isHidden = true
        return view
    }

    func updateUIView(_ view: AnchorView, context: Context) {
        view.claim()
    }

    final class AnchorView: UIView {
        override func didMoveToWindow() {
            super.didMoveToWindow()
            claim()
        }

        /// The nearest scroll view around this one, to the controller the navigation stack shows.
        func claim() {
            guard window != nil else { return }
            var node = superview
            while let current = node, !(current is UIScrollView) { node = current.superview }
            guard let scroll = node as? UIScrollView else { return }
            var responder: UIResponder? = next
            while let current = responder {
                if let controller = current as? UIViewController, controller.parent is UINavigationController {
                    if controller.contentScrollView(for: .top) !== scroll {
                        controller.setContentScrollView(scroll, for: .top)
                    }
                    return
                }
                responder = current.next
            }
        }
    }
}
