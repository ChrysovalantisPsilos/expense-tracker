// The design round's switch: A unless a launch argument (UserDefaults) picks B.
import XCTest
@testable import Budgeer

final class DesignOptionsTests: XCTestCase {
    func testATakeUnlessPicked() {
        let defaults = UserDefaults(suiteName: "DesignOptionsTests")!
        defaults.removePersistentDomain(forName: "DesignOptionsTests")
        XCTAssertEqual(DesignOptions.stored(defaults), DesignOptions())
        defaults.set("b", forKey: "design.home")
        defaults.set("b", forKey: "design.lock")
        defaults.set("x", forKey: "design.salary")
        let picked = DesignOptions.stored(defaults)
        XCTAssertEqual(picked.home, .b)
        XCTAssertEqual(picked.lock, .b)
        XCTAssertEqual(picked.categories, .a)
        XCTAssertEqual(picked.salary, .a)
        XCTAssertEqual(DesignOptions.all(.b).vouchers, .b)
    }
}
