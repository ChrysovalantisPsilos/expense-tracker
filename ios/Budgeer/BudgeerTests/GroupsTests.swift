// Groups: the figures equal the web's (Fixtures/groups.json, written by
// mobile-core/groupFigures.mjs) in both languages, and the models read the
// web's queries and write through the same RPCs: the list and its invites,
// a group's page and what it can do, the expense form, settle up, comments
// and Add's "Who's it for?" order.
import XCTest
import BudgeerCore
@testable import Budgeer

/// Fixtures/groups.json.
struct GroupsFixture: Decodable {
    struct Form: Decodable {
        let name: String
        let expenseId: String?
        let rate: Double
        let quick: Bool
        let initial: JSONValue?
        let edits: JSONValue
    }
    struct Input: Decodable {
        let now: String
        let today: String
        let userId: String
        let sofiaId: String
        let groups: JSONValue
        let summaries: [String: JSONValue]
        let invites: JSONValue
        let detail: JSONValue
        let auditLog: JSONValue
        let counts: JSONValue
        let forms: [Form]
    }
    /// An expense form case: where it opened, then its figures after the edits.
    struct FormCase: Decodable {
        let start: ExpenseFormState
        let figures: ExpenseFormFigures
        private enum Keys: String, CodingKey { case start }
        init(from decoder: Decoder) throws {
            start = try decoder.container(keyedBy: Keys.self).decode(ExpenseFormState.self, forKey: .start)
            figures = try ExpenseFormFigures(from: decoder)
        }
    }
    /// A settle-up case: the page as it opens, and the form's words and arguments.
    struct SettleCase: Decodable {
        let others: [String]
        let start: SettleStart
        let suggestions: [SettleSuggestion]
        let state: SettleState
        private enum Keys: String, CodingKey { case others, start, suggestions }
        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: Keys.self)
            others = try container.decode([String].self, forKey: .others)
            start = try container.decode(SettleStart.self, forKey: .start)
            suggestions = try container.decode([SettleSuggestion].self, forKey: .suggestions)
            state = try SettleState(from: decoder)
        }
    }
    struct Expected: Decodable {
        let list: GroupsListFigures
        let owner: GroupPageFigures
        let member: GroupPageFigures
        let forms: [String: FormCase]
        let settleOwed: SettleCase
        let settlePay: SettleCase
    }
    let input: Input
    let expected: [String: Expected]

    static func load() throws -> GroupsFixture {
        try JSONDecoder().decode(GroupsFixture.self, from: fixtureData("groups"))
    }

    var now: Date { ISO8601DateFormatter.fractional.date(from: input.now)! }
    var group: JSONValue { input.detail["group"] ?? [:] }
    var members: JSONValue { input.detail["members"] ?? [] }
    var groupId: String { group["id"]?.stringValue ?? "" }

    func expense(_ id: String?) -> JSONValue? {
        guard let id else { return nil }
        return input.detail["ledger"]?["expenses"]?.arrayValue?.first { $0["id"]?.stringValue == id }
    }

    /// A store answering the groups' reads with the fixture's inputs.
    func store() -> FakeStore {
        let store = FakeStore()
        store.groupsResult = .success(input.groups)
        store.invitesResult = .success(input.invites)
        store.summaries = input.summaries
        store.details = [groupId: input.detail]
        store.activityRows = input.auditLog
        store.commentCountRows = input.counts
        return store
    }
}

final class GroupsParityTests: XCTestCase {
    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    func testTheListAndAGroupsPageEqualTheWebsInBothLanguages() throws {
        let fixture = try GroupsFixture.load()
        let input = fixture.input
        for lang in ["en", "el"] {
            try BudgeerCore.shared.setLanguage(lang)
            let expected = try XCTUnwrap(fixture.expected[lang])
            let list = try GroupsListFigures.compute(groups: input.groups, summaries: input.summaries, invites: input.invites,
                                                     userId: input.userId, core: .shared)
            XCTAssertEqual(list, expected.list, lang)
            for (userId, page) in [(input.userId, expected.owner), (input.sofiaId, expected.member)] {
                let figures = try GroupPageFigures.compute(detail: input.detail, auditLog: input.auditLog, counts: input.counts,
                                                           userId: userId, now: fixture.now, core: .shared)
                XCTAssertEqual(figures.balances, page.balances, "\(lang) \(userId)")
                XCTAssertEqual(figures.expenses, page.expenses, "\(lang) \(userId)")
                XCTAssertEqual(figures, page, "\(lang) \(userId)")
            }
        }
    }

    func testTheExpenseFormEqualsTheWebsInBothLanguages() throws {
        let fixture = try GroupsFixture.load()
        for lang in ["en", "el"] {
            try BudgeerCore.shared.setLanguage(lang)
            for form in fixture.input.forms {
                let expected = try XCTUnwrap(fixture.expected[lang]?.forms[form.name])
                let expense = fixture.expense(form.expenseId)
                let start = try GroupExpenseFigures.start(group: fixture.group, members: fixture.members, myMemberId: "m1",
                                                          expense: expense, initial: form.initial ?? .null,
                                                          today: fixture.input.today, core: .shared)
                XCTAssertEqual(start, expected.start, "\(lang) \(form.name)")
                // The user's edits over the start, as the fixture made them.
                var fields = try JSONValue.from(start).objectValue ?? [:]
                for (key, value) in form.edits.objectValue ?? [:] { fields[key] = value }
                let edited: ExpenseFormState = try JSONValue.object(fields).decode()
                let figures = try GroupExpenseFigures.evaluate(edited, group: fixture.group, members: fixture.members,
                                                               myMemberId: "m1", expense: expense, rate: form.rate,
                                                               fxLoading: false, quick: form.quick, core: .shared)
                XCTAssertEqual(figures, expected.figures, "\(lang) \(form.name)")
            }
        }
    }

    func testSettleUpEqualsTheWebsFromBothSides() throws {
        let fixture = try GroupsFixture.load()
        let balances = try BudgeerCore.shared.json("groupFormat", "balancesFrom", [fixture.input.detail["balances"] ?? []])
        for lang in ["en", "el"] {
            try BudgeerCore.shared.setLanguage(lang)
            let expected = try XCTUnwrap(fixture.expected[lang])
            for (me, settle) in [("m1", expected.settleOwed), ("m2", expected.settlePay)] {
                let opened = try SettleFigures.open(group: fixture.group, members: fixture.members, balances: balances,
                                                    myMemberId: me, today: fixture.input.today, core: .shared)
                XCTAssertEqual(opened.others, settle.others, "\(lang) \(me)")
                XCTAssertEqual(opened.start, settle.start, "\(lang) \(me)")
                XCTAssertEqual(opened.suggestions, settle.suggestions, "\(lang) \(me)")
                let state = try SettleFigures.state(group: fixture.group, members: fixture.members, balances: balances,
                                                    myMemberId: me, direction: opened.start.direction,
                                                    otherId: opened.start.otherId, amount: opened.start.amount,
                                                    settledAt: opened.start.settledAt, core: .shared)
                XCTAssertEqual(state, settle.state, "\(lang) \(me)")
            }
        }
    }
}

@MainActor
final class GroupsModelTests: XCTestCase {
    private let user = AuthUser.sample.id.uuidString.lowercased()

    override func setUpWithError() throws {
        try super.setUpWithError()
        try BudgeerCore.shared.setLanguage("en")
    }

    func testTheListReadsEveryGroupsSummaryAndAnswersAnInvite() async throws {
        let fixture = try GroupsFixture.load()
        let store = fixture.store()
        let model = GroupsModel(data: store.data, userId: user)
        await model.load()
        XCTAssertEqual(model.figures, fixture.expected["en"]?.list)
        let invite = try XCTUnwrap(model.figures?.invites.first)
        let opened = await model.respond(invite, accept: true)
        XCTAssertEqual(opened, "g-joined")
        XCTAssertEqual(store.groupWrites.last?.name, "respond_to_invite")
        XCTAssertEqual(store.groupWrites.last?.args["p_invite"], "i1")
    }

    func testANewGroupIsCreatedWithItsPictureInvitesAndLink() async throws {
        let store = GroupsFixture.emptyStore()
        store.profileResult = .success(["base_currency": "CHF"])
        let model = NewGroupModel(data: store.data, site: "https://dev.budgeer.com")
        await model.load()
        XCTAssertEqual(model.currency, "CHF")
        // Nothing named: nothing sent.
        model.name = "   "
        let none = await model.create(cover: nil)
        XCTAssertFalse(none)
        XCTAssertTrue(store.groupWrites.isEmpty)
        // An address is checked before it's added, and kept once.
        model.emailText = "not an email"
        XCTAssertFalse(model.addEmail())
        XCTAssertEqual(model.emailProblem, BudgeerCore.shared.text("common:errors.emailInvalid"))
        model.emailText = " sam@example.com "
        XCTAssertTrue(model.addEmail())
        model.emailText = "SAM@example.com"
        model.addEmail()
        XCTAssertEqual(model.emails, ["sam@example.com"])
        XCTAssertNil(model.emailProblem)
        XCTAssertEqual(model.nextSteps.count, 3)
        // The group, its picture, the invite (as the Members page sends it) and a link.
        model.name = " Ski week "
        model.shareLink = true
        XCTAssertEqual(model.nextSteps.count, 4)
        let cover = NewGroupModel.CoverFile(data: Data([1, 2, 3]), contentType: "image/png", ext: "png")
        let made = await model.create(cover: cover)
        XCTAssertTrue(made)
        XCTAssertEqual(store.groupWrites.map { $0.name },
                       ["create_group", "group-images", "invite_user_to_group", "group_invites"])
        XCTAssertEqual(store.groupWrites[0].args, ["p_name": "Ski week", "p_currency": "CHF"])
        XCTAssertEqual(store.groupWrites[1].args, ["path": "g-new/cover.png", "contentType": "image/png", "bytes": 3])
        XCTAssertEqual(store.groupWrites[2].args, ["p_group": "g-new", "p_email": "sam@example.com"])
        XCTAssertEqual(model.done, NewGroupModel.Done(
            id: "g-new", name: "Ski week", link: "https://dev.budgeer.com/join/tok-1",
            sent: [.init(email: "sam@example.com", text: "Request sent to sam@example.com They’ll see it in Budgeer.", ok: true)],
            photoProblem: nil))
    }

    func testANewGroupThatFailsSaysWhy() async throws {
        let store = GroupsFixture.emptyStore()
        store.writeError = ServerError(code: "23514", message: "Group names must be 1–60 characters.")
        let model = NewGroupModel(data: store.data, site: "")
        await model.load()
        model.name = "Flat"
        let made = await model.create(cover: nil)
        XCTAssertFalse(made)
        XCTAssertNil(model.done)
        XCTAssertNotNil(model.message)
    }

    func testAGroupsPageAndWhatItCanDo() async throws {
        let fixture = try GroupsFixture.load()
        let store = fixture.store()
        let now = fixture.now
        let model = GroupModel(groupId: fixture.groupId, userId: user, site: "https://dev.budgeer.com",
                               data: store.data, now: { now })
        await model.load()
        XCTAssertEqual(model.figures, fixture.expected["en"]?.owner)
        XCTAssertEqual(model.myMemberId, "m1")
        XCTAssertTrue(model.deleteConfirmed(" Lisbon trip "))
        XCTAssertFalse(model.deleteConfirmed("lisbon trip"))

        await model.remove(memberId: "m3")
        XCTAssertEqual(store.groupWrites.last?.args, ["p_member": "m3", "p_silent": false])
        XCTAssertEqual(model.message, "Removed Marco Rossi")

        let left = await model.leave(silent: true)
        XCTAssertTrue(left)
        XCTAssertEqual(store.groupWrites.last?.args, ["p_member": "m1", "p_silent": true])

        store.writeError = ServerError(code: "P0001", message: "This member still has an outstanding balance — settle up first.")
        let deleted = await model.delete()
        XCTAssertFalse(deleted)
        XCTAssertEqual(model.message, "This member still has an outstanding balance — settle up first.")
    }

    func testInvitesByEmailAndByLink() async throws {
        let fixture = try GroupsFixture.load()
        let store = fixture.store()
        let model = GroupModel(groupId: fixture.groupId, userId: user, site: "https://dev.budgeer.com", data: store.data)
        await model.load()
        let sent = await model.invite(email: " sam@example.com ")
        XCTAssertTrue(sent)
        XCTAssertEqual(model.message, "Request sent to sam@example.com They’ll see it in Budgeer.")

        store.inviteStatus = "no_account"
        store.emailError = ServerError(code: nil, message: "Email invites aren’t available right now.", edge: true)
        _ = await model.invite(email: "new@example.com")
        XCTAssertEqual(model.inviteLink, "https://dev.budgeer.com/join/tok-1")
        XCTAssertEqual(model.message, "Couldn’t send the email — share this link instead")

        store.inviteStatus = "already_member"
        let refused = await model.invite(email: "sofia@example.com")
        XCTAssertFalse(refused)
        XCTAssertEqual(model.message, "That person is already in this group.")
    }

    func testANewExpenseSavesTheWebsArguments() async throws {
        let fixture = try GroupsFixture.load()
        let store = fixture.store()
        let now = fixture.now
        let groupModel = GroupModel(groupId: fixture.groupId, userId: user, site: "", data: store.data, now: { now })
        await groupModel.load()
        let form = groupModel.expenseForm(expenseId: nil)
        let empty = await form.save()
        XCTAssertFalse(empty)
        XCTAssertEqual(form.errors["description"], "Add a description")
        form.setDescription("Taxi")
        form.setAmount("84,60")
        XCTAssertEqual(form.figures?.card.line, "All 4 · €21.15 each")
        let saved = await form.save()
        XCTAssertTrue(saved)
        let expected = try XCTUnwrap(fixture.expected["en"]?.forms["new"])
        XCTAssertEqual(store.groupWrites.last?.name, "create_group_expense_v2")
        XCTAssertEqual(store.groupWrites.last?.args, expected.figures.args.with("spentAt", .string("2026-09-20")))
        XCTAssertEqual(form.saved?.title, "Expense added")
    }

    func testAnExactSplitShortOfTheTotalIsStopped() async throws {
        let fixture = try GroupsFixture.load()
        let store = fixture.store()
        let form = GroupExpenseModel(group: fixture.group, members: fixture.members, myMemberId: "m1", expense: nil,
                                     data: store.data)
        form.setDescription("Groceries")
        form.setAmount("30")
        form.pickMode("exact")
        form.toggle("m3")
        form.toggle("m4")
        form.setShare("m1", "10")
        form.setShare("m2", "12,50")
        let saved = await form.save()
        XCTAssertFalse(saved)
        XCTAssertEqual(form.notice, ToastText(title: "Amounts must add up to the total", description: "Missing €7.50"))
        XCTAssertTrue(store.groupWrites.isEmpty)
        form.pickMode("percent")
        XCTAssertEqual(form.form.values, ["m1": "50", "m2": "50"])
    }

    func testSettleUpRecordsTheTopSuggestionAndReminds() async throws {
        let fixture = try GroupsFixture.load()
        let store = fixture.store()
        let now = fixture.now
        let groupModel = GroupModel(groupId: fixture.groupId, userId: user, site: "", data: store.data, now: { now })
        await groupModel.load()
        let settle = try XCTUnwrap(groupModel.settleUp())
        XCTAssertEqual(settle.state?.otherLine, "Sofia owes €89.25 overall")
        let recorded = await settle.record()
        XCTAssertTrue(recorded)
        XCTAssertEqual(store.groupWrites.last?.args, fixture.expected["en"]?.settleOwed.state.args)
        await settle.remind("m2")
        XCTAssertEqual(store.groupWrites.last?.name, "nudge_member")
        XCTAssertEqual(settle.message, "Reminder sent")
        settle.setAmount("")
        XCTAssertEqual(settle.state?.problem, "Enter an amount")
    }

    func testCommentsOnAnExpense() async throws {
        let fixture = try GroupsFixture.load()
        let store = fixture.store()
        store.commentRows = [["id": "c1", "body": "Thanks!", "created_at": "2026-09-19T14:05:00Z",
                              "author_id": .string(user), "author": ["display_name": "Alex Morgan"]]]
        let groupModel = GroupModel(groupId: fixture.groupId, userId: user, site: "", data: store.data)
        await groupModel.load()
        let comments = try XCTUnwrap(groupModel.comments(itemId: "e2"))
        XCTAssertEqual(comments.label, "Museum tickets")
        await comments.load()
        guard case .loaded(let rows) = comments.state else { return XCTFail("not loaded") }
        XCTAssertEqual(rows.first?.author, "Alex Morgan")
        XCTAssertEqual(rows.first?.canDelete, true)
        comments.draft = "  See you there "
        await comments.send()
        XCTAssertEqual(store.groupWrites.last?.args["p_body"], "See you there")
        XCTAssertEqual(store.groupWrites.last?.args["p_target_type"], "expense")
        XCTAssertNil(groupModel.comments(itemId: "nope"))
    }

    func testWhoForOffersTheMostRecentlyUsedGroupFirst() async throws {
        let fixture = try GroupsFixture.load()
        let store = fixture.store()
        let defaults = UserDefaults(suiteName: "GroupsModelTests")!
        defaults.removeObject(forKey: MyGroupsModel.recentKey)
        let model = MyGroupsModel(data: store.data, userId: user, defaults: defaults)
        await model.load()
        XCTAssertEqual(model.groups.compactMap { $0["id"]?.stringValue }, ["g-lisbon", "g-flat"])
        MyGroupsModel.remember(groupId: "g-flat", core: .shared, defaults: defaults)
        await model.load()
        XCTAssertEqual(model.groups.compactMap { $0["id"]?.stringValue }, ["g-flat", "g-lisbon"])
        XCTAssertEqual(model.group("g-flat")?["members"]?.arrayValue?.count, 2)
    }
}

extension GroupsFixture {
    /// A store with no groups at all.
    static func emptyStore() -> FakeStore {
        let store = FakeStore()
        store.groupsResult = .success([])
        store.invitesResult = .success([])
        return store
    }
}
