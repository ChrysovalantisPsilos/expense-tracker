// Pictures of the native redesign's mockups (ios/Budgeer/Budgeer/Native)
// for the owner's sign-off: Home, the Add sheet collapsed and pulled up,
// Activity (plain, with rows held mid-swipe, and asking before a delete), a
// group's page (and settled, with its confetti), More, the widgets, the Siri
// phrases and the Face ID lock, each in light and dark, English and Greek, at an
// iPhone 15's size, as "native-<screen>-<variant>.png". Written to
// SNAPSHOT_DIR like SnapshotTests' pictures; nothing is compared.
import SwiftUI
import XCTest
import BudgeerCore
@testable import Budgeer

@MainActor
final class NativeSnapshotTests: XCTestCase {
    private static let size = CGSize(width: 393, height: 852)
    private static let variants = [("en", false), ("en", true), ("el", false), ("el", true)]

    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    func testHome() throws {
        try shoot("home") { NativeAppMock(sample: $0) }
    }

    func testAddSheet() throws {
        try shoot("add", settle: 1.6) { NativeAppMock(sample: $0, adding: true) }
        try shoot("add-expanded", settle: 1.6) { NativeAppMock(sample: $0, adding: true, expanded: true) }
    }

    func testActivity() throws {
        try shoot("activity") { NativeAppMock(sample: $0, tab: .activity) }
        try shoot("activity-swipe") {
            NativeAppMock(sample: $0, tab: .activity, swipe: .open(delete: "e2", actions: "e3"))
        }
        try shoot("activity-delete", settle: 1.6) { NativeAppMock(sample: $0, tab: .activity, confirming: "e2") }
    }

    func testGroup() throws {
        try shoot("group", settle: 1.2) { NativeAppMock(sample: $0, tab: .groups, groupOpen: true) }
        try shoot("group-settled", settle: 1.2) {
            NativeAppMock(sample: $0, tab: .groups, groupOpen: true, groupSettled: true)
        }
    }

    func testMore() throws {
        try shoot("more") { NativeAppMock(sample: $0, tab: .more) }
    }

    func testExtras() throws {
        try shoot("widgets") { NativeWidgetsGallery(sample: $0) }
        try shoot("shortcuts") { NativeShortcutsView(sample: $0) }
        try shoot("lock") { NativeLockView(sample: $0) }
    }

    // MARK: Helpers

    /// `name` in each variant: the language set (and the core told), the
    /// sample worded in it, the bar titles in the brand's face.
    private func shoot<V: View>(_ name: String, settle: TimeInterval = 0.8,
                                _ make: (NativeSample) -> V) throws {
        for (lang, dark) in NativeSnapshotTests.variants {
            let language = AppLanguage(preference: lang, defaults: UserDefaults(suiteName: "NativeSnapshotTests")!,
                                       deviceLanguages: ["en"])
            NativeStyle.installTitles(lang: language.current)
            let sample = NativeSample.make(lang: language.current)
            let view = make(sample).environment(language)
            try snapshot(AnyView(view), name: "native-\(name)-\(lang)\(dark ? "-dark" : "")", dark: dark, settle: settle)
        }
    }

    private func snapshot(_ view: AnyView, name: String, dark: Bool, settle: TimeInterval) throws {
        let host = NativeHost(rootView: view)
        host.overrideUserInterfaceStyle = dark ? .dark : .light
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: .zero)
        window.frame = CGRect(origin: .zero, size: NativeSnapshotTests.size)
        window.overrideUserInterfaceStyle = dark ? .dark : .light
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.layoutIfNeeded()
        // Let SwiftUI lay out, and a sheet or dialog finish coming up.
        RunLoop.main.run(until: Date(timeIntervalSinceNow: settle))
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { context in
            if !window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) {
                window.layer.render(in: context.cgContext)
            }
        }
        let data = try XCTUnwrap(image.pngData())
        let attachment = XCTAttachment(image: image)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let dir = ProcessInfo.processInfo.environment["SNAPSHOT_DIR"], !dir.isEmpty {
            let folder = URL(fileURLWithPath: dir, isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try data.write(to: folder.appendingPathComponent("\(name).png"))
        }
        // Take a presented sheet down with the window, so the next picture starts clean.
        host.dismiss(animated: false)
        window.isHidden = true
    }
}
