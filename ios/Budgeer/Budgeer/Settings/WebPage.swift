// A page of the website (the Privacy Notice, the Terms of Use, Help & FAQ,
// the status page) in Safari inside the app (SFSafariViewController), so
// the words are the website's own and you come straight back.
import SafariServices
import SwiftUI

/// A website page to show.
struct WebPage: Identifiable, Equatable {
    let url: URL
    var id: String { url.absoluteString }

    /// A path on this build's website ('/privacy'), or a whole address.
    init?(_ address: String, site: String) {
        guard let url = URL(string: address.hasPrefix("/") ? site + address : address) else { return nil }
        self.url = url
    }
}

struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let controller = SFSafariViewController(url: url)
        controller.preferredControlTintColor = UIColor(NativeStyle.tint)
        controller.dismissButtonStyle = .done
        return controller
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
