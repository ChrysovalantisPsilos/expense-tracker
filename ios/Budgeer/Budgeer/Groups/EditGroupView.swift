// Edit group (the owner), after the web's EditGroupPage: the picture (a
// photo from the library, or an emoji on a colour, over the group's photo
// now) and the name, with Save at the foot. Saving is GroupModel.saveEdit
// (the rename, then the picture as uploadGroupImage sends it, the same path
// as a new group's); what it says shows on the group's page.
import SwiftUI
import UIKit

@MainActor
struct EditGroupView: View {
    let model: GroupModel
    @Environment(AppLanguage.self) private var language
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var photo: UIImage?
    @State private var emoji: String?
    @State private var colour: String

    init(model: GroupModel, emoji: String? = nil, colour: String? = nil) {
        self.model = model
        _name = State(initialValue: model.groupName)
        _emoji = State(initialValue: emoji)
        _colour = State(initialValue: colour ?? model.figures?.colour.key ?? "")
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                if let message = model.message {
                    NativeNotice(text: message, warning: true).padding(.horizontal, 4)
                }
                GroupCoverPicker(photo: $photo, emoji: $emoji, colour: $colour, current: model.figures?.imageUrl)
                HStack(spacing: 12) {
                    NativeIconTile(symbol: "character.cursor.ibeam", color: NativeStyle.coral, size: 30)
                    TextField(language.t("groups:edit.name"), text: $name)
                        .font(.body.weight(.semibold))
                        .submitLabel(.done)
                        .accessibilityLabel(language.t("groups:edit.name"))
                        .accessibilityIdentifier("editGroup.name")
                }
                .frame(minHeight: 52)
                .padding(.horizontal, 14)
                .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom, spacing: 0) { saveBar }
        .nativeTabBarRoom()
        .background(NativeStyle.canvas.ignoresSafeArea())
        .navigationTitle(language.t("groups:edit.title"))
        .navigationBarTitleDisplayMode(.inline)
        // What the group's page said last isn't about this page.
        .onAppear { model.note(nil) }
    }

    private var saveBar: some View {
        Button {
            Task {
                let cover = GroupCoverFile.make(photo: photo, emoji: emoji, colour: colour)
                if await model.saveEdit(name: name, cover: cover) {
                    NativeHaptics.success()
                    dismiss()
                }
            }
        } label: {
            Group {
                if model.busy {
                    ProgressView().tint(Color.white)
                } else {
                    Text(language.t("common:actions.save"))
                }
            }
            .frame(maxWidth: .infinity)
        }
        .nativeGlassButton(prominent: true)
        .disabled(model.busy || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .nativeFootBar()
        .accessibilityIdentifier("editGroup.save")
    }
}
