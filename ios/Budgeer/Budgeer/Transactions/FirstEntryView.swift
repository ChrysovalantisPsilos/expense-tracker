// Nothing logged yet (listHeading.isFirstRun), as the web's FirstEntry on
// Home and Transactions: the two ways to start, add an expense or import a
// bank statement.
import SwiftUI

struct FirstEntryView: View {
    /// Add your first expense (the Add sheet).
    let add: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "tray")
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(NativeStyle.tint)
                .frame(width: 64, height: 64)
                .background(NativeStyle.tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            Text(language.t("transactions:firstEntry.title")).font(.headline).multilineTextAlignment(.center)
            Text(language.t("transactions:firstEntry.text")).font(.subheadline).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            VStack(spacing: 10) {
                Button(action: add) {
                    Label(language.t("transactions:firstEntry.add"), systemImage: "plus").frame(maxWidth: .infinity)
                }
                .nativeGlassButton(prominent: true)
                .accessibilityIdentifier("firstEntry.add")
                NavigationLink(value: AppRoute.importStatement) {
                    Label(language.t("transactions:firstEntry.import"), systemImage: "tablecells").frame(maxWidth: .infinity)
                }
                .nativeGlassButton()
                .accessibilityIdentifier("firstEntry.import")
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
        .padding(.horizontal, 16)
    }
}
