// Join a group (the Groups tab's "Join with a link", or a budgeer://join
// link): paste the link (Paste reads the clipboard only when tapped), then
// the group as the web's join page shows it (its picture and name, "You've
// been invited to join", the members), Accept & join or Decline. An unusable
// link says so, with Go to groups. Everything it says is JoinModel's (the
// core's).
import SwiftUI
import UIKit

/// Holds the join page's model while it's in the stack.
@MainActor
struct JoinHost: View {
    let token: String?
    let data: DataLayer
    /// In the group (joined, or already in it): open it.
    let onJoined: (String) -> Void
    @State private var model: JoinModel?

    var body: some View {
        Group {
            if let model { JoinView(model: model, onJoined: onJoined) } else { NativeLoading() }
        }
        .onAppear { if model == nil { model = JoinModel(token: token, data: data) } }
    }
}

@MainActor
struct JoinView: View {
    @Bindable var model: JoinModel
    let onJoined: (String) -> Void
    @Environment(AppLanguage.self) private var language
    @Environment(\.dismiss) private var dismiss
    @FocusState private var typing: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                switch model.state {
                case .entering:
                    entering
                case .looking, .joined:
                    VStack(spacing: 12) {
                        ProgressView()
                        Text(language.t("groups:join.loading")).font(.subheadline).foregroundStyle(.secondary)
                    }
                    .padding(.top, 80)
                case .joinable(let preview):
                    joinable(preview)
                case .invalid(let message):
                    invalid(message)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, NativeFoot.room)
        }
        .scrollDismissesKeyboard(.interactively)
        .nativeTabBarRoom()
        .background(NativeStyle.canvas.ignoresSafeArea())
        .navigationTitle(language.t("ios:native.join.entry"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
        .onChange(of: model.state) { _, state in
            if case .joined(let id) = state {
                NativeHaptics.success()
                onJoined(id)
            }
        }
    }

    // MARK: The link

    private var entering: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                NativeIconTile(symbol: "link", color: NativeStyle.coral, size: 34)
                Text(language.t("ios:native.join.lead")).font(.subheadline)
            }
            HStack(spacing: 8) {
                TextField(language.t("ios:native.join.field"), text: $model.text)
                    .keyboardType(.URL)
                    .textContentType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.go)
                    .focused($typing)
                    .onSubmit { Task { await model.look() } }
                    .padding(.horizontal, 14)
                    .frame(minHeight: 44)
                    .background(Theme.Colors.subtle, in: Capsule())
                    .accessibilityLabel(language.t("ios:native.join.field"))
                    .accessibilityIdentifier("join.link")
                Button {
                    // The clipboard is read only now, on the user's tap.
                    if let pasted = UIPasteboard.general.string { model.text = pasted }
                } label: {
                    Label(language.t("ios:native.join.paste"), systemImage: "doc.on.clipboard")
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 14)
                        .frame(minHeight: 44)
                        .nativeGlass(Capsule(), interactive: true)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("join.paste")
            }
            if let problem = model.problem {
                Text(problem).font(.footnote.weight(.semibold)).foregroundStyle(NativeStyle.negative)
            }
            Button { Task { await model.look() } } label: {
                Text(language.t("ios:native.join.next")).frame(maxWidth: .infinity)
            }
            .nativeGlassButton(prominent: true)
            .disabled(model.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .accessibilityIdentifier("join.next")
        }
        .padding(16)
        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    // MARK: The group

    private func joinable(_ preview: JoinPreview) -> some View {
        VStack(spacing: 18) {
            VStack(spacing: 10) {
                GroupPicture(imageUrl: preview.imageUrl, colour: preview.colour, size: 96)
                    .shadow(color: Color.black.opacity(0.12), radius: 18, x: 0, y: 10)
                Text(preview.name)
                    .font(NativeStyle.title(28, lang: language.current, relativeTo: .largeTitle))
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)
                Text(language.t("groups:join.invited")).font(.subheadline).foregroundStyle(.secondary)
            }
            .padding(.top, 12)
            if !preview.members.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    Text(language.t("groups:join.members"))
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(.bottom, 6)
                    ForEach(Array(preview.members.enumerated()), id: \.offset) { index, member in
                        if index > 0 { Divider().padding(.leading, 44) }
                        HStack(spacing: 12) {
                            NativeAvatar(avatar: member, size: 32)
                            Text(member.name).font(.body.weight(.medium))
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 8)
                    }
                }
                .padding(16)
                .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
            if let problem = model.problem { NativeNotice(text: problem, warning: true) }
            VStack(spacing: 10) {
                Button { Task { await model.accept() } } label: {
                    Group {
                        if model.busy {
                            ProgressView().tint(Color.white)
                        } else {
                            Label(language.t("groups:join.accept"), systemImage: "checkmark")
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                .nativeGlassButton(prominent: true)
                .accessibilityIdentifier("join.accept")
                Button { dismiss() } label: {
                    Label(language.t("groups:actions.decline"), systemImage: "xmark").frame(maxWidth: .infinity)
                }
                .nativeGlassButton()
            }
            .disabled(model.busy)
        }
    }

    // MARK: An unusable link

    private func invalid(_ message: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "link.badge.plus")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(NativeStyle.tint)
                .padding(.top, 40)
            Text(language.t("groups:join.unavailableTitle")).font(.title3.weight(.semibold))
            Text(message).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Button { model.again() } label: {
                Text(language.t("ios:native.join.entry")).frame(maxWidth: .infinity)
            }
            .nativeGlassButton()
            Button { dismiss() } label: {
                Text(language.t("groups:join.toGroups")).frame(maxWidth: .infinity)
            }
            .nativeGlassButton(prominent: true)
        }
        .padding(.horizontal, 8)
    }
}
