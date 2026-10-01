// A comment thread, after the web's CommentsPage: the item's name, the
// comments oldest first (avatar, who, when, the text, delete on your own),
// and the box to write one (members only). Live while open.
import SwiftUI

@MainActor
struct CommentsView: View {
    @Bindable var model: CommentsModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Space.s4) {
                Text(model.label)
                    .font(Theme.Fonts.body(13, weight: .semibold, lang: language.current))
                    .foregroundStyle(Theme.Colors.textMuted)
                if let message = model.message { Note(text: message, tone: Theme.Colors.negative) }
                Panel {
                    switch model.state {
                    case .loading:
                        ProgressView().frame(maxWidth: .infinity, minHeight: 80)
                    case .failed(let message):
                        LoadErrorBlock(message: message) { await model.load() }
                    case .loaded(let rows):
                        if rows.isEmpty {
                            Note(text: language.t("groups:comments.empty"))
                        } else {
                            VStack(alignment: .leading, spacing: Theme.Space.s4) {
                                ForEach(rows) { row in comment(row) }
                            }
                        }
                    }
                }
                if model.myMemberId != nil {
                    HStack(alignment: .bottom, spacing: Theme.Space.s2) {
                        TextField(language.t("groups:comments.placeholder"), text: $model.draft, axis: .vertical)
                            .lineLimit(2...5)
                            .padding(.vertical, Theme.Space.s2)
                            .fieldStyle()
                            .accessibilityLabel(language.t("groups:comments.write"))
                        Button { Task { await model.send() } } label: {
                            Image(systemName: "paperplane.fill")
                                .foregroundStyle(Theme.Colors.onAccent)
                                .frame(width: 44, height: 44)
                                .background(Theme.Colors.accentSolid)
                                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
                        }
                        .disabled(!model.canSend)
                        .opacity(model.canSend ? 1 : 0.5)
                        .accessibilityLabel(language.t("groups:comments.send"))
                    }
                } else {
                    Note(text: language.t("groups:comments.joinFirst"))
                }
            }
            .padding(Theme.Space.s4)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.Colors.canvas.ignoresSafeArea())
        .navigationTitle(language.t("groups:comments.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task(id: language.current) { await model.load() }
    }

    private func comment(_ row: CommentRow) -> some View {
        HStack(alignment: .top, spacing: Theme.Space.s3) {
            AvatarCircle(avatar: row.avatar)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: Theme.Space.s2) {
                    Text(row.author)
                        .font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
                        .foregroundStyle(Theme.Colors.textPrimary)
                    Text(row.when)
                        .font(Theme.Fonts.body(12, lang: language.current))
                        .foregroundStyle(Theme.Colors.textMuted)
                    Spacer(minLength: 0)
                    if row.canDelete {
                        Button { Task { await model.delete(row.id) } } label: {
                            Image(systemName: "trash").font(.system(size: 13)).foregroundStyle(Theme.Colors.negative)
                        }
                        .disabled(model.busy)
                        .accessibilityLabel(language.t("groups:comments.delete"))
                    }
                }
                Text(row.body)
                    .font(Theme.Fonts.body(14, lang: language.current))
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
