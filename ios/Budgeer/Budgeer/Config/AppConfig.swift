// Which Supabase project the build talks to. The values come from the
// configuration's xcconfig (Config/Dev.xcconfig or Prod.xcconfig) through
// Info.plist, never from Swift source: the "Budgeer Dev" scheme builds
// against the TEST project, "Budgeer Prod" against PROD.
import Foundation

struct AppConfig: Equatable, Sendable {
    enum Environment: String, Sendable { case dev, prod }

    let environment: Environment
    let supabaseURL: URL
    let supabaseAnonKey: String
    /// Which APNs host this build's device token belongs to: 'sandbox' for a
    /// Debug build run from Xcode, 'production' for a Release build
    /// (TestFlight, the App Store); from the configuration (APNS_ENVIRONMENT).
    var apnsEnvironment = "sandbox"

    /// The website of this build's project: where an invite link opens.
    var siteURL: String {
        environment == .prod ? "https://www.budgeer.com" : "https://dev.budgeer.com"
    }

    enum Error: Swift.Error, CustomStringConvertible {
        case missing(String)
        var description: String {
            switch self {
            case .missing(let key): return "Info.plist has no usable \(key): check Config/*.xcconfig and the scheme's configuration"
            }
        }
    }

    /// The config of `bundle`'s Info.plist.
    static func load(from bundle: Bundle = .main) throws -> AppConfig {
        func value(_ key: String) throws -> String {
            guard let text = bundle.object(forInfoDictionaryKey: key) as? String, !text.isEmpty, !text.hasPrefix("$(") else {
                throw Error.missing(key)
            }
            return text
        }
        guard let environment = Environment(rawValue: try value("BudgeerEnvironment")) else { throw Error.missing("BudgeerEnvironment") }
        guard let url = URL(string: try value("SupabaseURL")), url.scheme == "https" else { throw Error.missing("SupabaseURL") }
        return AppConfig(environment: environment, supabaseURL: url, supabaseAnonKey: try value("SupabaseAnonKey"),
                         apnsEnvironment: (try? value("APNSEnvironment")) == "production" ? "production" : "sandbox")
    }
}
