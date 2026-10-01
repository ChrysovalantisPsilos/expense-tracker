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
    @State private var removing: MemberRow?
    @State private var email = ""
    @State private var copied = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Space.s4) {
                if let message = model.message { Note(text: message, tone: Theme.Colors.textPrimary) }
                if let figures = model.figures {
                    Panel {
                        VStack(alignment: .leading, spacing: Theme.Space.s3) {
                            CardHeader(title: language.t("groups:members.inGroup"), icon: "person.2", subtitle: figures.members)
                            VStack(spacing: 0) {
                                ForEach(figures.memberRows) { row in
                                    if row.id != figures.memberRows.first?.id { Divider().overlay(Theme.Colors.border) }
                                    memberRow(row)
                                }
                            }
                        }
                    }
                    if figures.myMemberId != nil { invitePanel }
                }
            }
            .padding(Theme.Space.s4)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.Colors.canvas.ignoresSafeArea())
        .navigationTitle(language.t("groups:members.title"))
        .navigationBarTitleDisplayMode(.inline)
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
            Text(row.label)
                .font(Theme.Fonts.body(15, weight: row.isMe ? .bold : .regular, lang: language.current))
                .foregroundStyle(Theme.Colors.textPrimary)
            if let owner = row.owner {
                Text(owner.capsLabel)
                    .font(Theme.Fonts.body(11, weight: .bold, lang: language.current))
                    .foregroundStyle(Theme.Colors.accentFg)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Theme.Colors.accentSubtle)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md / 2))
            }
            Spacer(minLength: Theme.Space.s2)
            if row.canRemove {
                Button { removing = row } label: {
                    Image(systemName: "person.badge.minus")
                        .foregroundStyle(Theme.Colors.negative)
                        .frame(width: 36, height: 36)
                }
                .accessibilityLabel(row.removeLabel)
            }
        }
        .frame(minHeight: 56)
    }

    private var invitePanel: some View {
        Panel {
            VStack(alignment: .leading, spacing: Theme.Space.s3) {
                CardHeader(title: language.t("groups:members.invite.title"), icon: "envelope",
                           subtitle: language.t("groups:members.invite.subtitle"))
                FormRow(label: language.t("groups:members.invite.email"), help: language.t("groups:members.invite.emailHint")) {
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
                    Label(language.t("groups:members.invite.send"), systemImage: "envelope")
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(model.busy || email.trimmingCharacters(in: .whitespaces).isEmpty)
                Button {
                    copied = false
                    Task { await model.makeInviteLink() }
                } label: {
                    Label(language.t("groups:members.invite.copyLink"), systemImage: "link")
                }
                .buttonStyle(OutlineButtonStyle())
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
