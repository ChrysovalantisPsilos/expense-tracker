// The category badge: every web icon key has an SF Symbol that exists on
// this iOS, and the look is the core's (categoryStyle.categoryLook).
import UIKit
import XCTest
import BudgeerCore
@testable import Budgeer

final class CategoryBadgeTests: XCTestCase {
    func testEverySymbolExists() {
        for (key, symbol) in CategoryBadge.symbols {
            XCTAssertNotNil(UIImage(systemName: symbol), "\(key) → \(symbol)")
        }
        XCTAssertNotNil(UIImage(systemName: CategoryBadge.symbol(for: "no-such-key")))
    }

    func testEveryKeyTheCoreAnswersHasASymbol() throws {
        // The names the web's hints turn into each key (categoryStyle NAME_HINTS).
        let names = ["Fuel", "Parking", "Taxi", "Bus", "Bike", "Flights", "Hotel", "Restaurants", "Bars", "Groceries",
                     "Transport", "Rent", "Housing", "Insurance", "Taxes", "Bank fees", "Music", "Streaming", "Water",
                     "Electricity", "Internet", "Phone", "Utilities", "Electronics", "Shopping", "Health", "Games",
                     "Books", "Sports", "Hobbies", "Entertainment", "Freelance", "Business", "Salary", "Travel",
                     "Coffee", "Gym", "Education", "Gifts received", "Gifts", "Refunds", "Cash", "Transfer",
                     "Investments", "Savings", "Something else"]
        for name in names {
            let look = try CategoryLook.of(.string(name), core: .shared)
            XCTAssertNotNil(CategoryBadge.symbols[look.key], "\(name) → \(look.key)")
        }
    }

    func testTheLookIsTheCores() throws {
        let pets: JSONValue = ["id": "c1", "name": "Pets", "icon": "gifts", "color": "blue"]
        let look = try CategoryLook.of(pets, kind: "expense", core: .shared)
        XCTAssertEqual(look, CategoryLook(key: "gifts", tone: "accent", tint: CategoryTint(fg: "#3A78D4", bg: "#3A78D429")))
        let salary = try CategoryLook.of(["name": "Salary", "icon": .null, "color": .null], kind: "income", core: .shared)
        XCTAssertEqual(salary, CategoryLook(key: "salary", tone: "positive", tint: nil))
        XCTAssertEqual(try CategoryLook.of(nil, core: .shared), CategoryLook(key: "other", tone: "accent", tint: nil))
    }
}
