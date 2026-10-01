// What a link the app is opened with leads to: the website's own https links
// (Universal Links: the site's /.well-known/apple-app-site-association lists
// what the app opens, and the app claims its site in Associated Domains) and
// the app's budgeer:// scheme. A group invite (/join/<token>,
// groupFormat.inviteToken), an auth email's link (/auth/confirm,
// confirmLink.parseConfirmLink), or a page the app has (AppPaths). Links to
// another site, or to a page the app hasn't got, lead nowhere.
import BudgeerCore
import Foundation

enum AppLink: Equatable {
    /// Join a group: the invite's token.
    case join(String)
    /// Confirm a sign-up, reset the password, change the email.
    case email(EmailLink)
    /// A page of the app, by its web address (path and query; AppRouter.open(path:)).
    case page(String)

    /// Where `url` leads, for a build whose website is one of `hosts`.
    static func of(_ url: URL, hosts: [String], core: BudgeerCore = .shared) -> AppLink? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        switch components.scheme?.lowercased() {
        case "budgeer":
            // The app's own scheme: only an invite (budgeer://join/<token>);
            // budgeer://auth-callback is Google's, answered by its sheet.
            guard components.host?.lowercased() == "join" else { return nil }
            return token(url, core: core).map { .join($0) }
        case "https":
            guard let host = components.host?.lowercased(), hosts.contains(host) else { return nil }
            let path = components.percentEncodedPath
            if path.hasPrefix("/join/") { return token(url, core: core).map { .join($0) } }
            if path == "/auth/confirm" {
                let query = "?" + (components.percentEncodedQuery ?? "")
                let link: EmailLink? = try? core.call("confirmLink", "parseConfirmLink", [query])
                return link.map { .email($0) }
            }
            var page = path.isEmpty ? "/" : path
            if let query = components.percentEncodedQuery { page += "?\(query)" }
            if let fragment = components.percentEncodedFragment { page += "#\(fragment)" }
            return AppPaths.place(page) == nil ? nil : .page(page)
        default:
            return nil
        }
    }

    private static func token(_ url: URL, core: BudgeerCore) -> String? {
        try? core.call("groupFormat", "inviteToken", [url.absoluteString])
    }
}
