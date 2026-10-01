// Add's "Who's it for?", after the web's TransactionPage + WhoForChips: a
// new expense offers "Just me" and the user's groups (most recently used
// first) as one row of chips under Expense | Income. Picking a group turns
// the form into that group's quick expense form (GroupExpenseView's quick
// layout); "Just me" (or Income) turns it back. What was typed (amount,
// currency, description, date) travels either way, as quickAddMath's
// carryDraft carries it. Someone in no group sees Add as it always was.
import SwiftUI
import BudgeerCore

/// The row of chips: "Just me", then each group with its picture.
struct WhoForChips: View {
    let groups: [JSONValue]
    /// The picked group's id; nil is "Just me".
    let value: String?
    let onPick: (String?) -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s2) {
            FieldLabel(text: language.t("groups:whoFor.label"))
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Theme.Space.s2) {
                        chip(id: nil, name: language.t("groups:whoFor.justMe")) {
                            LucideIcon(icon: .user, size: 14)
                                .foregroundStyle(Theme.Colors.textMuted)
                                .frame(width: 28, height: 28)
                                .background(Theme.Colors.subtle)
                                .clipShape(Circle())
                        }
                        ForEach(groups.indices, id: \.self) { index in
                            let group = groups[index]
                            chip(id: group["id"]?.stringValue, name: group["name"]?.stringValue ?? "") {
                                GroupMark(imageUrl: group["image_url"]?.stringValue, size: 28)
                            }
                        }
                    }
                    .padding(.vertical, 2)
                }
                .onAppear { proxy.scrollTo(value ?? "me", anchor: .center) }
            }
        }
    }

    private func chip<Icon: View>(id: String?, name: String, @ViewBuilder icon: () -> Icon) -> some View {
        let on = id == value
        return Button { onPick(id) } label: {
            HStack(spacing: Theme.Space.s2) {
                icon().overlay(Circle().stroke(on ? Color.white : Color.clear, lineWidth: 2).padding(-1))
                Text(name)
                    .font(Theme.Fonts.body(14, weight: on ? .bold : .semibold, lang: language.current))
                    .lineLimit(1)
            }
            .foregroundStyle(on ? Theme.Colors.onAccent : Theme.Colors.textPrimary)
            .padding(.leading, 6)
            .padding(.trailing, Theme.Space.s4)
            .frame(minHeight: 44)
            .frame(maxWidth: 220)
            .background(on ? Theme.Colors.accentSolid : Theme.Colors.surface)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(on ? Theme.Colors.accentSolid : Theme.Colors.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .id(id ?? "me")
        .accessibilityAddTraits(on ? .isSelected : [])
        .accessibilityIdentifier("whoFor.\(id ?? "me")")
    }
}

/// The Add page: the entry form, or a group's quick form once a group is picked.
@MainActor
struct AddEntryHost: View {
    let data: DataLayer
    let userId: String
    let groups: MyGroupsModel?
    let onDone: () -> Void
    @Environment(AppLanguage.self) private var language
    @State private var entry: EntryFormModel
    @State private var groupForm: GroupExpenseModel?
    @State private var groupId: String?

    init(sheet: EntrySheet, data: DataLayer, userId: String, groups: MyGroupsModel?, onDone: @escaping () -> Void) {
        self.data = data
        self.userId = userId
        self.groups = groups
        self.onDone = onDone
        _entry = State(initialValue: sheet.model)
    }

    private var offersGroups: Bool {
        entry.mode == .add && !(groups?.groups.isEmpty ?? true)
    }

    var body: some View {
        Group {
            if let groupForm {
                GroupExpenseView(model: groupForm, onDone: { _ in onDone() }, back: onDone) { lead }
            } else {
                EntryFormView(model: entry, who: offersGroups ? AnyView(chips) : nil) { _ in onDone() }
            }
        }
        .task { if entry.mode == .add { await groups?.load() } }
    }

    private var chips: some View {
        WhoForChips(groups: groups?.groups ?? [], value: groupId) { pick($0) }
    }

    /// The quick form's lead: Expense | Income (Income goes back to Just me), and the chips.
    private var lead: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s5) {
            SegmentedControl(options: [("expense", language.t("transactions:kinds.expense")),
                                       ("income", language.t("transactions:kinds.income"))],
                             value: "expense", size: .sm, fitted: true) { kind in
                if kind == "income" { pick(nil, kind: "income") }
            }
            .accessibilityLabel(language.t("transactions:form.kind"))
            chips
        }
    }

    /// Switch sides, carrying what was typed (carryDraft).
    private func pick(_ id: String?, kind: String = "expense") {
        guard id != groupId || kind == "income" else { return }
        let core = BudgeerCore.shared
        let draft = groupForm?.whoForDraft ?? entry.whoForDraft
        if let id, let group = groups?.group(id) {
            let currency = group["currency"] ?? "EUR"
            let initial = (try? core.json("quickAddMath", "carryDraft", [draft, currency])) ?? .null
            let members = group["members"] ?? []
            let me = (try? core.json("groupFormat", "groupViewer", [group, members, JSONValue.string(userId)]))?["myMember"]?["id"]?
                .stringValue
            groupForm = GroupExpenseModel(group: group, members: members, myMemberId: me, userId: userId, expense: nil,
                                          initial: initial, quick: true, data: data)
            groupId = id
        } else {
            let initial = (try? core.json("quickAddMath", "carryDraft", [draft, JSONValue.string(entry.baseCurrency)])) ?? .null
            entry = EntryFormModel(mode: .add, kind: kind, initial: initial, data: data)
            groupForm = nil
            groupId = nil
        }
    }
}
