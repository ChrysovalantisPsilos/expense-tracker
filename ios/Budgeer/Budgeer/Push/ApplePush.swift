// The system side of push: UserNotifications for the permission, UIKit's
// remote-notification registration for the APNs device token (the app
// delegate receives it), banners while the app is open, and a tapped
// notification's web path ('/groups/<id>', '/budgets', …; notify-user's
// urlFor, the same path web push opens) handed to the frame, which opens it
// as the bell's rows do (AppRouter.open(path:)).
import Observation
import SwiftUI
import UIKit
import UserNotifications

/// A tapped notification's path (or an opened link's page, AppLink),
/// waiting for the signed-in frame.
@MainActor
@Observable
final class PushInbox {
    static let shared = PushInbox()
    var path: String?
}

/// The token (or the failure) iOS hands the app delegate, for the one
/// register() call waiting on it.
@MainActor
final class PushRelay {
    static let shared = PushRelay()
    private var waiting: [CheckedContinuation<String, Error>] = []

    func wait() async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            waiting.append(continuation)
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    func deliver(_ result: Result<String, Error>) {
        let all = waiting
        waiting = []
        for continuation in all { continuation.resume(with: result) }
    }
}

struct ApplePushSystem: PushSystem {
    func permission() async -> PushPermission {
        switch await UNUserNotificationCenter.current().notificationSettings().authorizationStatus {
        case .authorized, .provisional, .ephemeral: return .allowed
        case .denied: return .denied
        default: return .notDetermined
        }
    }

    func requestPermission() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    func register() async throws -> String {
        try await PushRelay.shared.wait()
    }
}

/// The app delegate: the APNs token, banners in the foreground, taps.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { @MainActor in PushRelay.shared.deliver(.success(hex)) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Task { @MainActor in PushRelay.shared.deliver(.failure(error)) }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let path = response.notification.request.content.userInfo["url"] as? String
        Task { @MainActor in
            // Only an app path ('/…', never '//host'), as the web's landing routes take.
            if let path, path.hasPrefix("/"), !path.hasPrefix("//") { PushInbox.shared.path = path }
            completionHandler()
        }
    }
}

/// iOS's Settings page for this app (where notifications are allowed again).
@MainActor
func openAppSettings() {
    if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
}
