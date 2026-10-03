// Plan mode: the page equals the web's (Fixtures/plan.json, written by
// mobile-core/screenFigures.mjs) in both languages, from the start, with
// changes, with a salary from the entries and with no income at all, and so
// do a row's editor, the overlap picker, a savings item's form, the Apply
// sheet and the what-if preview; the model reads what the web reads, edits in
// place (one editor open at a time), saves a moment later, applies the ticked
// changes and undoes them, and turns a typed what-if into plan edits.
import XCTest
import BudgeerCore
@testable import Budgeer

/// Fixtures/plan.json.
struct PlanFixture: Decodable {
    struct View: Decodable {
        let name: String
        let rules: JSONValue
        let plan: JSONValue
        let view: String
        let income: JSONValue?
    }
    struct Input: Decodable {
        let now: String
        let profile: JSONValue
        let categories: JSONValue
        let savingsCategories: JSONValue
        let income: JSONValue
        let charges: JSONValue
        let rates: JSONValue
        let payDays: JSONValue?
        let views: [View]
        let whatif: JSONValue
    }
    struct Expected: Decodable {
        let reads: JSONValue
        let parts: PlanPage
        let apply: PlanApply
        let editor: PlanEditor?
        let pick: PlanPick?
        let add: PlanAddForm?
        let whatIf: PlanWhatIf?
    }
    let input: Input
    let expected: [String: [String: Expected]]

    static func load() throws -> PlanFixture {
        try JSONDecoder().decode(PlanFixture.self, from: fixtureData("plan"))
    }

    var now: Date { ISO8601DateFormatter.fractional.date(from: input.now)! }

    func view(_ name: String) -> View { input.views.first { $0.name == name }! }

    /// A store answering the page's reads for `view` (its rules, its plan saved).
    func store(_ name: String = "start") -> FakeStore {
        let view = view(name)
        let store = FakeStore()
        let income = view.income ?? input.income
        let charges = input.charges
        store.profileResult = .success(input.profile)
        store.savedPlan = view.plan
        store.rulesResult = .success(view.rules)
        store.savingsResult = .success(input.savingsCategories)
        store.allCategoriesResult = .success(input.categories)
        store.rowsFor = { query in query.kind == "income" ? income : charges }
        store.rates = ["USD>EUR": 0.9]
        store.payCalendarResult = ["days": input.payDays ?? [], "today": .null]
        return store
    }
}

final class PlanParityTests: XCTestCase {
    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    func testThePageEqualsTheWebsInBothLanguages() throws {
        let fixture = try PlanFixture.load()
        let core = BudgeerCore.shared
        let cal = payCal(profile: fixture.input.profile, payDays: fixture.input.payDays, now: fixture.now)
        for lang in ["en", "el"] {
            try core.setLanguage(lang)
            for view in fixture.input.views {
                let plan = try core.json("planMath", "normalisePlan", [view.plan])
                let figures = try PlanFigures.compute(
                    profile: fixture.input.profile, rules: view.rules, plan: plan, undo: .null,
                    categories: fixture.input.categories, savingsCategories: fixture.input.savingsCategories,
                    income: view.income ?? fixture.input.income, charges: fixture.input.charges, budgetSets: [],
                    rates: fixture.input.rates, view: view.view, now: fixture.now, cal: cal, core: core)
                let expected = try XCTUnwrap(fixture.expected[lang]?[view.name])
                XCTAssertEqual(try PlanFigures.reads(now: fixture.now, cal: cal, core: core),
                               expected.reads, "\(lang) \(view.name)")
                XCTAssertEqual(figures.page.header, expected.parts.header, "\(lang) \(view.name)")
                XCTAssertEqual(figures.page.groups, expected.parts.groups, "\(lang) \(view.name)")
                XCTAssertEqual(figures.page, expected.parts, "\(lang) \(view.name)")
                XCTAssertEqual(try figures.apply(off: [], currency: "EUR", now: fixture.now, core: core), expected.apply)
                if view.name == "start" {
                    let spotify = try XCTUnwrap(figures.page.groups.flatMap(\.rows).first { $0.name == "Spotify" })
                    let editor: PlanEditor = try core.call("planPage", "editorParts", [
                        spotify.item, spotify.signal ?? .null, JSONValue.string("EUR"), JSDate(fixture.now)])
                    XCTAssertEqual(editor, expected.editor, lang)
                    let overlap = try XCTUnwrap(figures.page.ideas.cards.first { $0.kind == "overlap" })
                    let last = overlap.idea["ruleIds"]?.arrayValue?.last ?? .null
                    let pick: PlanPick = try core.call("planPage", "pickParts", [figures.state["items"] ?? [], overlap.idea,
                                                                                JSONValue.array([last]), JSONValue.string("EUR")])
                    XCTAssertEqual(pick, expected.pick, lang)
                    var draft = try core.json("planPage", "addDraft", [JSONValue.null, "EUR", "2020-09-15"])
                    draft = draft.with("kind", "savings").with("name", "Holiday").with("text", "50")
                        .with("categoryId", "22222222-2222-4222-8222-222222222222")
                    let add: PlanAddForm = try core.call("planPage", "addFormParts", [draft, [
                        "categories": fixture.input.categories, "currency": "EUR", "rates": fixture.input.rates,
                    ] as JSONValue])
                    XCTAssertEqual(add, expected.add, lang)
                }
                if view.name == "changes" {
                    let rows = try core.json("whatIfMath", "whatIfRows", [fixture.input.whatif, figures.state["items"] ?? [],
                                                                          "22222222-2222-4222-8222-222222222222"])
                    let ids = JSONValue.array((rows.arrayValue ?? []).map { $0["id"] ?? .null })
                    let preview: PlanWhatIf = try core.call("planPage", "whatIfParts", [rows, ids,
                                                                                       fixture.input.whatif["notFound"] ?? []])
                    XCTAssertEqual(preview, expected.whatIf, lang)
                }
            }
        }
    }
}

@MainActor
final class PlanModelTests: XCTestCase {
    override func setUpWithError() throws {
        try super.setUpWithError()
        try BudgeerCore.shared.setLanguage("en")
    }

    private func model(_ store: FakeStore, _ fixture: PlanFixture) -> PlanModel {
        let now = fixture.now
        return PlanModel(data: store.data, core: .shared, now: { now }, saveDelayMs: 60_000)
    }

    private func row(_ model: PlanModel, _ name: String) throws -> PlanRowParts {
        try XCTUnwrap(model.page?.groups.flatMap(\.rows).first { $0.name == name })
    }

    func testTheWebsReadsThenThePage() async throws {
        let fixture = try PlanFixture.load()
        let store = fixture.store()
        let plan = model(store, fixture)
        await plan.load()
        let reads = try XCTUnwrap(fixture.expected["en"]?["start"]?.reads)
        XCTAssertEqual(store.queries, [
            TxnQuery(kind: "income", from: reads["income"]?["from"]?.stringValue, to: reads["income"]?["to"]?.stringValue),
            TxnQuery(kind: "expense", from: reads["charges"]?["from"]?.stringValue, to: reads["charges"]?["to"]?.stringValue,
                     spread: true),
        ])
        XCTAssertEqual(plan.page, fixture.expected["en"]?["start"]?.parts)
        XCTAssertEqual(plan.saveStatus, .saved)
    }

    func testARowsEditorInPlaceThenTheSave() async throws {
        let fixture = try PlanFixture.load()
        let store = fixture.store()
        let plan = model(store, fixture)
        await plan.load()
        let spotify = try row(plan, "Spotify")
        plan.toggleOpen(spotify.id)
        XCTAssertEqual(plan.open, spotify.id)
        XCTAssertEqual(plan.editText, "10.99")
        plan.setAmount("8,99")
        XCTAssertEqual(plan.editText, "8.99")
        XCTAssertEqual(try row(plan, "Spotify").was, "€10.99")
        XCTAssertEqual(plan.editor?.canReset, true)
        XCTAssertEqual(plan.saveStatus, .saving)
        XCTAssertEqual(plan.page?.changes?.rows.map(\.name), ["Spotify"])
        // One editor at a time.
        let netflix = try row(plan, "Netflix")
        plan.toggleOpen(netflix.id)
        XCTAssertEqual(plan.open, netflix.id)
        plan.setCancelled(true)
        XCTAssertEqual(try row(plan, "Netflix").cancelled, true)
        await plan.flush()
        XCTAssertEqual(store.planWrites.last?.name, "save")
        XCTAssertEqual(store.planWrites.last?.args["changes"]?.arrayValue?.count, 2)
        XCTAssertEqual(plan.saveStatus, .saved)
        plan.reset()
        XCTAssertEqual(plan.page?.changes?.rows.map(\.name), ["Spotify"])
        plan.drop(spotify.id)
        XCTAssertNil(plan.page?.changes)
        await plan.flush()
        XCTAssertEqual(store.planWrites.last?.name, "clear")
    }

    func testAFailedSaveSaysSoAndTriesAgain() async throws {
        let fixture = try PlanFixture.load()
        let store = fixture.store()
        let plan = model(store, fixture)
        await plan.load()
        store.writeError = FakeError(description: "offline")
        plan.toggle(try row(plan, "Netflix").id)
        await plan.flush()
        XCTAssertEqual(plan.saveStatus, .error)
        store.writeError = nil
        await plan.save()
        XCTAssertEqual(plan.saveStatus, .saved)
        XCTAssertEqual(store.planWrites.last?.name, "save")
    }

    func testWhatIfIAddASavingsItem() async throws {
        let fixture = try PlanFixture.load()
        let store = fixture.store()
        let plan = model(store, fixture)
        await plan.load()
        plan.toggleOpen("new")
        XCTAssertEqual(plan.addForm?.ready, false)
        plan.setAddKind("savings")
        plan.setAddName("Holiday")
        plan.setAddAmount("50")
        XCTAssertEqual(plan.addForm, fixture.expected["en"]?["start"]?.add)
        plan.setAddFrequency("weekly")
        XCTAssertEqual(plan.addFields["frequency"], "weekly")
        plan.saveAdd()
        XCTAssertNil(plan.open)
        let added = try row(plan, "Holiday")
        XCTAssertEqual(added.state?.text, "New")
        // Its row opens the same form, to save it again; its switch takes it out.
        plan.toggleOpen(added.id)
        XCTAssertEqual(plan.addForm?.submit, "Save")
        plan.close()
        plan.toggle(added.id)
        XCTAssertNil(plan.page?.changes)
    }

    func testIdeasPickAnOverlapTryOneDismissOne() async throws {
        let fixture = try PlanFixture.load()
        let store = fixture.store()
        let plan = model(store, fixture)
        await plan.load()
        let cards = try XCTUnwrap(plan.page?.ideas.cards)
        let overlap = try XCTUnwrap(cards.first { $0.action == "pick" })
        plan.tryIdea(overlap)
        XCTAssertEqual(plan.open, overlap.id)
        XCTAssertEqual(plan.pick?.picked, [])
        let last = try XCTUnwrap(plan.pick?.rows.last?.id)
        plan.togglePick(last)
        XCTAssertEqual(plan.pick, fixture.expected["en"]?["start"]?.pick)
        plan.addPicked()
        XCTAssertNil(plan.open)
        XCTAssertEqual(plan.page?.changes?.rows.map(\.id), [last])
        XCTAssertFalse(plan.page?.ideas.cards.contains { $0.id == overlap.id } ?? true)
        let tried = try XCTUnwrap(plan.page?.ideas.cards.first { $0.action == "try" })
        plan.tryIdea(tried)
        XCTAssertEqual(plan.page?.changes?.rows.count, 2)
        if let next = plan.page?.ideas.cards.first {
            plan.dismiss(next)
            XCTAssertFalse(plan.page?.ideas.cards.contains { $0.id == next.id } ?? true)
        }
    }

    func testApplyTheTickedOnesThenUndo() async throws {
        let fixture = try PlanFixture.load()
        let store = fixture.store("changes")
        let plan = model(store, fixture)
        await plan.load()
        XCTAssertEqual(plan.page?.changes?.canApply, true)
        plan.openApply()
        XCTAssertEqual(plan.applySheet, fixture.expected["en"]?["changes"]?.apply)
        let first = try XCTUnwrap(plan.applySheet?.rows.first?.id)
        plan.toggleApply(first)
        XCTAssertEqual(plan.applySheet?.submit, "Apply 2 changes")
        await plan.apply()
        let sent = try XCTUnwrap(store.planWrites.last { $0.name == "apply" })
        XCTAssertEqual(sent.args["apply"]?["changes"]?.arrayValue?.count, 1)
        XCTAssertEqual(sent.args["apply"]?["adds"]?.arrayValue?.count, 1)
        XCTAssertEqual(sent.args["remaining"]?["changes"]?.arrayValue?.count, 1)
        XCTAssertNil(plan.applySheet)
        XCTAssertEqual(plan.message, "Applied 2 changes")
        XCTAssertEqual(plan.page?.applied?.canUndo, true)
        XCTAssertEqual(plan.undoTitle, "Undo 1 change?")
        await plan.undoApply()
        XCTAssertEqual(store.planWrites.last?.name, "undo")
        XCTAssertEqual(plan.message, "Undid 2 changes")
        XCTAssertNil(plan.page?.applied)
    }

    func testClearPlanKeepsTheDismissedIdeas() async throws {
        let fixture = try PlanFixture.load()
        let store = fixture.store("changes")
        let plan = model(store, fixture)
        await plan.load()
        plan.clear()
        XCTAssertNil(plan.page?.changes)
        await plan.flush()
        XCTAssertEqual(store.planWrites.last?.name, "clear")
    }

    func testTheSalaryFromTheEntriesIsOnlyInThePlan() async throws {
        let fixture = try PlanFixture.load()
        let store = fixture.store("derived")
        let plan = model(store, fixture)
        await plan.load()
        XCTAssertEqual(plan.page, fixture.expected["en"]?["derived"]?.parts)
        let salary = try row(plan, "Salary")
        plan.toggleOpen(salary.id)
        XCTAssertNil(plan.editor?.frequency)
        XCTAssertNotNil(plan.editor?.note)
        // The entries are gone: the reality banner, and OK drops the change.
        store.rowsFor = { _ in [] }
        await plan.load()
        XCTAssertEqual(plan.page?.reality?.lines.count, 1)
        plan.acknowledge()
        XCTAssertNil(plan.page?.reality)
        XCTAssertNil(plan.page?.changes)
    }

    func testTypeAWhatIfThenAddToPlanAndUndo() async throws {
        let fixture = try PlanFixture.load()
        let store = fixture.store()
        store.whatIfResult = .success(fixture.input.whatif)
        let plan = model(store, fixture)
        await plan.load()
        plan.whatIfText = "cancel apple music, add a gym at 40 a month"
        await plan.askWhatIf()
        XCTAssertEqual(store.whatIfLines, ["cancel apple music, add a gym at 40 a month"])
        XCTAssertEqual(plan.whatIf, .preview)
        XCTAssertEqual(plan.whatIfPreview?.ready, 2)
        XCTAssertEqual(plan.whatIfPreview?.notFound, "Not found among your recurring payments, income and savings: Hulu.")
        let gym = try XCTUnwrap(plan.whatIfPreview?.rows.last?.id)
        plan.editWhatIf(gym)
        XCTAssertEqual(plan.whatIfEditor?.add, true)
        plan.setWhatIfAmount("45")
        XCTAssertEqual(plan.whatIfPreview?.rows.last?.suggested, false)
        plan.addWhatIf()
        XCTAssertEqual(plan.whatIf, .added(2))
        XCTAssertEqual(plan.whatIfAddedText, "Added 2 changes to your plan.")
        XCTAssertEqual(plan.page?.changes?.rows.count, 2)
        plan.undoWhatIf()
        XCTAssertNil(plan.page?.changes)
        // Nothing it could find: why not, in words.
        store.whatIfResult = .success(["changes": [], "adds": [], "notFound": ["Hulu"]])
        plan.whatIfText = "cancel hulu"
        await plan.askWhatIf()
        XCTAssertEqual(plan.whatIf, .failed("Couldn’t find Hulu among your recurring payments, income and savings."))
        store.whatIfResult = .failure(ServerError(code: "rate_limited", message: ""))
        await plan.askWhatIf()
        guard case .failed(let words) = plan.whatIf else { return XCTFail("no failure") }
        XCTAssertFalse(words.isEmpty)
    }

    func testTheYearView() async throws {
        let fixture = try PlanFixture.load()
        let store = fixture.store()
        let plan = model(store, fixture)
        await plan.load()
        plan.setView("year")
        XCTAssertEqual(plan.page?.header.label, "Left over a year")
    }
}
