// A group's members, after the web's MembersPage: "In this group" (you and
// the owner first, the owner's badge, the owner's remove button behind a
// confirm), then "Invite people": by email (an in-app request to someone on
// Budgeer, else an emailed join link) or with a share link, shown here to
// copy or share. Everything it shows is GroupModel's (memberRowParts).
import SwiftUI
import UIKit

@MainActor
struct MembersView: View {
    @Bindable var model: GroupModel
    @Environment(AppLanguage.self) private var language
    @Environment(\.dismiss) private var dismiss
    @State private var removing: MemberRow?
    @State private var email = ""
    @State private var copied = false

    var body: some View {
        Page {
            PageHeader(title: language.t("groups:members.title"), eyebrow: model.groupName, back: { dismiss() })
            if let message = model.message { Note(text: message, tone: Theme.Colors.textPrimary, size: 14) }
            if let figures = model.figures {
                Panel(title: language.t("groups:members.inGroup"), icon: .users, subtitle: figures.members) {
                    VStack(spacing: 0) {
                        ForEach(figures.memberRows) { row in
                            if row.id != figures.memberRows.first?.id { Rectangle().fill(Theme.Colors.border).frame(height: 1) }
                            memberRow(row)
                        }
                    }
                }
                if figures.myMemberId != nil { invitePanel }
            }
        }
        .confirmationDialog(language.t("groups:modals.remove.title", ["name": .string(removing?.avatar.name ?? "")]),
                            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                            titleVisibility: .visible) {
            Button(language.t("groups:modals.remove.confirm"), role: .destructive) {
                if let id = removing?.avatar.id { Task { await model.remove(memberId: id) } }
            }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        } message: {
            Text(language.t("groups:modals.remove.body"))
        }
    }

    private func memberRow(_ row: MemberRow) -> some View {
        HStack(spacing: Theme.Space.s3) {
            AvatarCircle(avatar: row.avatar, size: 32)
            Text(row.label).kitText(16, row.isMe ? .semibold : .regular)
            if let owner = row.owner {
                Text(owner.capsLabel)
                    .font(Theme.Fonts.body(11, weight: .bold, lang: language.current))
                    .kerning(0.5)
                    .foregroundStyle(Theme.Colors.accentFg)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 1)
                    .background(Theme.Colors.accentSubtle)
                    .clipShape(RoundedRectangle(cornerRadius: 2))
            }
            Spacer(minLength: Theme.Space.s2)
            if row.canRemove {
                KitIconButton(icon: .userMinus, label: row.removeLabel, size: .sm, iconSize: 16) { removing = row }
                    .foregroundStyle(Theme.Colors.accentFg)
            }
        }
        .frame(minHeight: 56)
    }

    private var invitePanel: some View {
        Panel(title: language.t("groups:members.invite.title"), icon: .mail, subtitle: language.t("groups:members.invite.subtitle")) {
            VStack(alignment: .leading, spacing: Theme.Space.s3) {
                FormRow(label: language.t("groups:members.invite.email"), required: true,
                        help: language.t("groups:members.invite.emailHint")) {
                    TextField("", text: $email, prompt: Text(verbatim: "friend@example.com"))
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .fieldStyle()
                        .accessibilityIdentifier("members.email")
                }
                Button {
                    Task { if await model.invite(email: email) { email = "" } }
                } label: {
                    IconLabel(text: language.t("groups:members.invite.send"), icon: .mail)
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(model.busy || email.trimmingCharacters(in: .whitespaces).isEmpty)
                Button {
                    copied = false
                    Task { await model.makeInviteLink() }
                } label: {
                    IconLabel(text: language.t("groups:members.invite.copyLink"), icon: .link2)
                }
                .buttonStyle(.kit(.outline, .md, full: true))
                .disabled(model.busy)
                if let link = model.inviteLink { linkBox(link) }
            }
        }
    }

    /// The link to copy or share (the web's InviteLinkModal, inline).
    private func linkBox(_ link: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Space.s2) {
            Note(text: language.t("groups:modals.invite.body"))
            Text(link)
                .font(.system(size: 13, design: .monospaced))
                .foregroundStyle(Theme.Colors.textPrimary)
                .textSelection(.enabled)
                .accessibilityLabel(language.t("groups:modals.invite.field"))
            HStack(spacing: Theme.Space.s3) {
                Button(language.t("groups:modals.invite.copy")) {
                    UIPasteboard.general.string = link
                    copied = true
                }
                if let url = URL(string: link) {
                    ShareLink(item: url, subject: Text(language.t("groups:modals.invite.shareTitle"))) {
                        Text(language.t("groups:actions.share"))
                    }
                }
            }
            .font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
            .tint(Theme.Colors.accentFg)
            if copied {
                Note(text: language.t("groups:modals.invite.copied") + " · " + language.t("groups:members.linkCopiedHint"),
                     tone: Theme.Colors.positive)
            }
        }
        .padding(Theme.Space.s3)
        .background(Theme.Colors.subtle)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
    }
}
