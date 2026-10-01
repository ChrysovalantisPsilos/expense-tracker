// The groups' remaining pieces, each the web's: Edit group (the name and a
// new picture, the same upload as a new group's), the PDF statement (the
// group-report function's file, named as the website names it), joining
// from an invite link (the token from a pasted or opened link, the
// preview, Accept & join, the server's refusals) and Settle up's ask for
// your payment details (saved as Getting paid saves them, Not now kept).
import XCTest
import BudgeerCore
@testable import Budgeer

@MainActor
final class GroupLinksTests: XCTestCase {
    private let user = AuthUser.sample.id.uuidString.lowercased()

    override func setUpWithError() throws {
        try super.setUpWithError()
        try BudgeerCore.shared.setLanguage("en")
    }

    // MARK: Edit group

    func testEditGroupRenamesThenUploadsTheNewPicture() async throws {
        let fixture = try GroupsFixture.load()
        let store = fixture.store()
        let model = GroupModel(groupId: fixture.groupId, userId: user, site: "", data: store.data)
        await model.load()
        // Nothing changed: nothing written.
        let same = await model.saveEdit(name: " \(model.groupName) ", cover: nil)
        XCTAssertTrue(same)
        XCTAssertTrue(store.groupWrites.isEmpty)
        XCTAssertNil(model.message)
        // A blank name isn't saved.
        let blank = await model.saveEdit(name: "  ", cover: nil)
        XCTAssertFalse(blank)
        // The name, then the picture, each said.
        let cover = GroupCoverFile(data: Data([1, 2, 3, 4]), contentType: "image/jpeg", ext: "jpg")
        let saved = await model.saveEdit(name: " Lisbon 2027 ", cover: cover)
        XCTAssertTrue(saved)
        XCTAssertEqual(store.groupWrites.map(\.name), ["rename_group", "group-images"])
        XCTAssertEqual(store.groupWrites[0].args, ["id": .string(fixture.groupId), "name": "Lisbon 2027"])
        XCTAssertEqual(store.groupWrites[1].args,
                       ["path": .string("\(fixture.groupId)/cover.jpg"), "contentType": "image/jpeg", "bytes": 4])
        XCTAssertEqual(model.message, "Group renamed\nGroup photo updated")
    }

    func testAPictureThatFailsSaysSoUnderThePhotosTitle() async throws {
        let fixture = try GroupsFixture.load()
        let store = fixture.store()
        let model = GroupModel(groupId: fixture.groupId, userId: user, site: "", data: store.data)
        await model.load()
        store.writeError = ServerError(code: "403", message: "new row violates row-level security policy")
        let cover = GroupCoverFile(data: Data([1]), contentType: "image/png", ext: "png")
        let saved = await model.saveEdit(name: model.groupName, cover: cover)
        XCTAssertFalse(saved)
        XCTAssertEqual(model.message?.hasPrefix("Couldn’t update photo. "), true)
    }

    // MARK: The statement

    func testTheStatementIsTheGroupReportsPdfNamedAsOnTheWeb() async throws {
        let fixture = try GroupsFixture.load()
        let store = fixture.store()
        let model = GroupModel(groupId: fixture.groupId, userId: user, site: "", data: store.data)
        await model.load()
        await model.makeStatement()
        XCTAssertEqual(store.groupWrites.last?.name, "group-report")
        XCTAssertEqual(store.groupWrites.last?.args, ["group_id": .string(fixture.groupId)])
        let file = try XCTUnwrap(model.statementFile)
        XCTAssertEqual(file.lastPathComponent, "Lisbon-trip-statement.pdf")
        XCTAssertEqual(try Data(contentsOf: file), Data("%PDF-1.7 group".utf8))
        // A refusal: the web's title, then why.
        store.writeError = ServerError(code: nil, message: "Too many report requests. Please try again later.", edge: true)
        await model.makeStatement()
        XCTAssertNil(model.statementFile)
        XCTAssertEqual(model.message, "Couldn’t generate the report. Too many report requests. Please try again later.")
    }

    // MARK: Joining from a link

    static let preview: JSONValue = [
        "status": "joinable",
        "preview": [
            "group": ["name": "Ski week", "image_url": .null], "member_count": 2,
            "members": [
                ["id": "s1", "display_name": "Marco Rossi", "avatar_url": .null],
                ["id": "s2", "display_name": "Eleni", "avatar_url": .null],
            ],
        ],
    ]

    func testAPastedLinkIsLookedUpThenJoined() async throws {
        let store = GroupsFixture.emptyStore()
        store.linkPreviews["a1b2c3d4e5f6a7b8c9"] = GroupLinksTests.preview
        let model = JoinModel(token: nil, data: store.data)
        XCTAssertEqual(model.state, .entering)
        // Not a link: said, nothing read.
        model.text = "hello there"
        await model.look()
        XCTAssertEqual(model.problem, "That isn’t an invite link. It looks like budgeer.com/join/…")
        XCTAssertEqual(model.state, .entering)
        // The website's link, pasted.
        model.text = " https://dev.budgeer.com/join/a1b2c3d4e5f6a7b8c9 "
        await model.look()
        XCTAssertNil(model.problem)
        guard case .joinable(let preview) = model.state else { return XCTFail("not joinable: \(model.state)") }
        XCTAssertEqual(preview.name, "Ski week")
        XCTAssertNil(preview.imageUrl)
        XCTAssertEqual(preview.members.map(\.name), ["Marco Rossi", "Eleni"])
        XCTAssertEqual(preview.members.map(\.initials), ["MR", "E"])
        XCTAssertTrue(store.groupWrites.isEmpty)
        await model.accept()
        XCTAssertEqual(store.groupWrites.map(\.name), ["join_via_link"])
        XCTAssertEqual(store.groupWrites[0].args, ["p_token": "a1b2c3d4e5f6a7b8c9"])
        XCTAssertEqual(model.state, .joined("g-joined"))
    }

    func testAnOpenedLinkForAGroupYoureInGoesStraightThere() async throws {
        let store = GroupsFixture.emptyStore()
        store.linkPreviews["tok123456"] = ["status": "already_member", "group_id": "g-lisbon"]
        let model = JoinModel(token: "tok123456", data: store.data)
        XCTAssertEqual(model.state, .looking)
        await model.load()
        XCTAssertEqual(model.state, .joined("g-lisbon"))
        XCTAssertTrue(store.groupWrites.isEmpty)
    }

    func testAnExpiredLinkAndTheDemoAccountsRefusalAreTheWebsWords() async throws {
        let store = GroupsFixture.emptyStore()
        store.linkPreviews["expired1"] = ["status": "invalid"]
        store.linkPreviews["skiweek1"] = GroupLinksTests.preview
        let expired = JoinModel(token: "expired1", data: store.data)
        await expired.load()
        XCTAssertEqual(expired.state, .invalid(
            "This invite link is invalid or has expired. Ask whoever invited you for a fresh link."))
        expired.again()
        XCTAssertEqual(expired.state, .entering)

        let demo = JoinModel(token: "skiweek1", data: store.data)
        await demo.load()
        store.writeError = ServerError(code: "P0001", message: "That isn’t available on the demo account.")
        await demo.accept()
        XCTAssertEqual(demo.problem, "Couldn’t join. That isn’t available on the demo account.")
        guard case .joinable = demo.state else { return XCTFail("left the preview") }
    }

    func testTheAppsOwnLinkIsAnInvite() {
        XCTAssertEqual(AppLink.of(URL(string: "budgeer://join/a1b2c3d4e5f6a7b8c9")!, hosts: ["dev.budgeer.com"]),
                       .join("a1b2c3d4e5f6a7b8c9"))
        XCTAssertNil(AppLink.of(URL(string: "budgeer://auth-callback#access_token=x")!, hosts: ["dev.budgeer.com"]))
    }

    // MARK: Settle up's ask for your payment details

    private func settle(_ store: FakeStore, defaults: UserDefaults) async throws -> SettleUpModel {
        let fixture = try GroupsFixture.load()
        let now = fixture.now
        let group = GroupModel(groupId: fixture.groupId, userId: user, site: "", data: store.data, now: { now })
        await group.load()
        let context = try XCTUnwrap(group.context)
        return SettleUpModel(group: group.group, members: group.members, balances: context.balances,
                             myMemberId: try XCTUnwrap(group.myMemberId), data: store.data, now: { now },
                             defaults: defaults)
    }

    private func freshDefaults() -> UserDefaults {
        let defaults = UserDefaults(suiteName: "GroupLinksTests")!
        defaults.removeObject(forKey: SettleUpModel.askKey)
        return defaults
    }

    func testBeingPaidWithoutDetailsAsksAndSavesAsGettingPaidDoes() async throws {
        let store = try GroupsFixture.load().store()
        store.myPayment = [:]
        let model = try await settle(store, defaults: freshDefaults())
        XCTAssertEqual(model.direction, "in")
        XCTAssertFalse(model.asksForDetails) // not read yet
        await model.loadMyInfo()
        XCTAssertTrue(model.asksForDetails)
        model.openAsk()
        XCTAssertTrue(model.askOpen)
        // A PayPal field that isn't a PayPal.me name: Settings' words, nothing saved.
        model.paypal = "not a paypal name!"
        await model.saveDetails()
        XCTAssertEqual(model.askProblem, "A PayPal.me name is up to 20 letters and numbers.")
        XCTAssertTrue(store.settingsWrites.isEmpty)
        // Saved tidied, as Settings › Account saves them; once in, the ask goes.
        model.iban = "be68 5390 0754 7034"
        model.revolut = "@sam"
        model.paypal = "paypal.me/SamM"
        store.myPayment = ["payment_iban": "BE68539007547034", "payment_revolut": "sam", "payment_paypal": "SamM"]
        await model.saveDetails()
        XCTAssertEqual(store.settingsWrites.last?.name, "savePaymentInfo")
        XCTAssertEqual(store.settingsWrites.last?.args, ["iban": "BE68539007547034", "revolut": "sam", "paypal": "SamM"])
        XCTAssertNil(model.askProblem)
        XCTAssertFalse(model.asksForDetails)
        XCTAssertEqual(model.message, "Payment details saved")
    }

    func testNotNowIsRememberedAndPayingSomeoneNeverAsks() async throws {
        let store = try GroupsFixture.load().store()
        let defaults = freshDefaults()
        let model = try await settle(store, defaults: defaults)
        await model.loadMyInfo()
        XCTAssertTrue(model.asksForDetails)
        model.notNow()
        XCTAssertFalse(model.asksForDetails)
        XCTAssertEqual(defaults.string(forKey: SettleUpModel.askKey), "1")
        // The next Settle up on this phone doesn't ask.
        let next = try await settle(store, defaults: defaults)
        await next.loadMyInfo()
        XCTAssertFalse(next.asksForDetails)
        // Paying someone: no ask.
        let paying = try await settle(store, defaults: freshDefaults())
        paying.setDirection("out")
        await paying.loadMyInfo()
        XCTAssertFalse(paying.asksForDetails)
        // Details already saved: no ask.
        store.myPayment = ["payment_iban": .null, "payment_revolut": "sam", "payment_paypal": .null]
        let set = try await settle(store, defaults: freshDefaults())
        await set.loadMyInfo()
        XCTAssertFalse(set.asksForDetails)
    }
}
