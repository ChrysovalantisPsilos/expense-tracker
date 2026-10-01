// A first sign-in's store call on the fake store (WelcomeModel): seeding
// the default categories, recorded with Settings' writes.
import Foundation
@testable import Budgeer

extension FakeStore {
    func ensureDefaultCategories() async throws {
        if let writeError { throw writeError }
        settingsWrites.append(("ensureDefaultCategories", .null))
    }
}
