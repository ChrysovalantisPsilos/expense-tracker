// /groups/new as one rich page: the group's picture (a photo from the
// library, or an emoji on a colour), its name and currency, the people to
// invite (by email, and a share link), and what happens next; Create group
// floats at the foot. Once made, the page says how the extras went (each
// invite, the link to share) and opens the group. Everything it says and
// checks is NewGroupModel's (the core's); this file draws, and turns the
// picture into an image to upload.
import BudgeerCore
import PhotosUI
import SwiftUI
import UIKit

/// Holds the new group's model while its page is in the stack.
@MainActor
struct NewGroupHost: View {
    let data: DataLayer
    let site: String
    /// The group made: open it.
    let onCreated: (String) -> Void
    @State private var model: NewGroupModel?

    var body: some View {
        Group {
            if let model { NewGroupView(model: model, onCreated: onCreated) } else { NativeLoading() }
        }
        .onAppear { if model == nil { model = NewGroupModel(data: data, site: site) } }
    }
}

/// The emoji and colours a cover can be made of, and how its image is drawn:
/// groupCover.coverChoices, the website's picker's too.
enum GroupCoverArt {
    static let choices: CoverChoices = (try? BudgeerCore.shared.call("groupCover", "coverChoices", [Encodable]()))
        ?? CoverChoices(emoji: [], colours: [], image: nil)

    /// The brand's colour (the first), for tiles that aren't a group's.
    static var brand: LinearGradient { (choices.colours.first ?? CoverColour.coral).gradient }

    /// A colour by its key, else the brand's.
    static func colour(_ key: String) -> CoverColour {
        choices.colours.first { $0.key == key } ?? choices.colours.first ?? CoverColour.coral
    }
}

/// The picker's choices (groupCover.coverChoices).
struct CoverChoices: Codable, Sendable {
    /// COVER_IMAGE: the image's side in px, the emoji's share of it, its type.
    struct Drawing: Codable, Sendable {
        let size: Double
        let emoji: Double
        let type: String
        let ext: String
    }
    let emoji: [String]
    let colours: [CoverColour]
    let image: Drawing?
}

/// A cover colour (groupCover.js): its key and the gradient's two ends.
struct CoverColour: Codable, Equatable, Sendable {
    let key: String
    let from: String
    let to: String

    /// The brand's own, when the core can't be asked.
    static let coral = CoverColour(key: "coral", from: "", to: "")

    /// Top-left to bottom-right.
    var gradient: LinearGradient {
        LinearGradient(colors: [Color(hexString: from) ?? Theme.Palette.brand500, Color(hexString: to) ?? Theme.Palette.amber400],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

/// A cover: the photo, or the emoji (or the group's photo now, else the
/// people symbol) on its colour; square-cornered for the image to upload.
struct GroupCoverView: View {
    var photo: UIImage? = nil
    var emoji: String? = nil
    var colour: CoverColour = GroupCoverArt.colour("")
    /// The group's photo now, under a new pick (the edit page).
    var current: String? = nil
    var size: CGFloat = 132
    var rounded = true

    var body: some View {
        ZStack {
            if let photo {
                Image(uiImage: photo).resizable().scaledToFill()
            } else {
                colour.gradient
                if let emoji {
                    Text(verbatim: emoji).font(.system(size: size * (GroupCoverArt.choices.image?.emoji ?? 0.46)))
                } else {
                    Image(systemName: "person.2.fill")
                        .font(.system(size: size * 0.32, weight: .semibold))
                        .foregroundStyle(Color.white.opacity(0.92))
                    if let current, let url = URL(string: current) {
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            Color.clear
                        }
                    }
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: rounded ? size * 0.26 : 0, style: .continuous))
    }
}

/// The picture's choices, the website's CoverPicker: a photo from the
/// library, or an emoji on a colour (groupCover.coverChoices), with the
/// preview on top and × to keep the picture as it was. `current` is the
/// group's photo now (the edit page).
@MainActor
struct GroupCoverPicker: View {
    @Binding var photo: UIImage?
    @Binding var emoji: String?
    @Binding var colour: String
    var current: String? = nil
    @Environment(AppLanguage.self) private var language
    @State private var pick: PhotosPickerItem?

    var body: some View {
        VStack(spacing: 14) {
            GroupCoverView(photo: photo, emoji: emoji, colour: GroupCoverArt.colour(colour), current: current)
                .shadow(color: Color.black.opacity(0.12), radius: 18, x: 0, y: 10)
                .accessibilityLabel(language.t("groups:cover.title"))
            HStack(spacing: 10) {
                PhotosPicker(selection: $pick, matching: .images) {
                    Label(language.t("groups:cover.photo"), systemImage: "photo.on.rectangle")
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 16)
                        .frame(minHeight: 40)
                        .nativeGlass(Capsule(), interactive: true)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("newGroup.photo")
                if photo != nil || emoji != nil {
                    Button {
                        photo = nil
                        emoji = nil
                        pick = nil
                    } label: {
                        Label(language.t("groups:cover.reset"), systemImage: "xmark")
                            .labelStyle(.iconOnly)
                            .font(.subheadline.weight(.semibold))
                            .frame(width: 40, height: 40)
                            .nativeGlass(Circle(), interactive: true)
                    }
                    .buttonStyle(.plain)
                }
            }
            VStack(alignment: .leading, spacing: 10) {
                Text(language.t("groups:cover.emoji"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 4)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(GroupCoverArt.choices.emoji, id: \.self) { symbol in
                            Button {
                                emoji = emoji == symbol ? nil : symbol
                                photo = nil
                            } label: {
                                Text(verbatim: symbol)
                                    .font(.system(size: 24))
                                    .frame(width: 46, height: 46)
                                    .background(emoji == symbol ? Theme.Colors.accentSubtle : Theme.Colors.subtle,
                                                in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                    .overlay {
                                        if emoji == symbol {
                                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                                .stroke(NativeStyle.tint, lineWidth: 2)
                                        }
                                    }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 4)
                }
                .scrollClipDisabled()
                HStack(spacing: 12) {
                    ForEach(GroupCoverArt.choices.colours, id: \.key) { choice in
                        let picked = GroupCoverArt.colour(colour).key == choice.key
                        Button {
                            colour = choice.key
                            photo = nil
                        } label: {
                            Circle()
                                .fill(choice.gradient)
                                .frame(width: 32, height: 32)
                                .overlay { Circle().stroke(NativeStyle.card, lineWidth: picked ? 3 : 0) }
                                .overlay {
                                    Circle().stroke(picked ? NativeStyle.tint : Color.clear, lineWidth: 2)
                                        .padding(-3)
                                }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(language.t("groups:cover.colours.\(choice.key)"))
                        .accessibilityAddTraits(picked ? .isSelected : [])
                    }
                }
                .padding(.horizontal, 6)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .onChange(of: pick) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                    photo = image
                    emoji = nil
                }
            }
        }
    }
}

@MainActor
struct NewGroupView: View {
    @Bindable var model: NewGroupModel
    let onCreated: (String) -> Void
    @Environment(AppLanguage.self) private var language
    @State private var photo: UIImage?
    @State private var emoji: String?
    @State private var colour: String
    @FocusState private var typing: Bool

    init(model: NewGroupModel, onCreated: @escaping (String) -> Void, photo: UIImage? = nil, emoji: String? = nil,
         colour: String = "") {
        self.model = model
        self.onCreated = onCreated
        _photo = State(initialValue: photo)
        _emoji = State(initialValue: emoji)
        _colour = State(initialValue: colour)
    }

    var body: some View {
        Group {
            if let done = model.done { doneView(done) } else { form }
        }
        .background(NativeStyle.canvas.ignoresSafeArea())
        .navigationTitle(language.t("groups:create.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
    }

    // MARK: The form

    private var form: some View {
        ScrollView {
            VStack(spacing: 18) {
                if let message = model.message {
                    NativeNotice(text: message, warning: true).padding(.horizontal, 4)
                }
                cover
                details
                people
                next
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom, spacing: 0) { createBar }
        .nativeTabBarRoom()
    }

    private var cover: some View {
        GroupCoverPicker(photo: $photo, emoji: $emoji, colour: $colour)
    }

    private var details: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                NativeIconTile(symbol: "character.cursor.ibeam", color: NativeStyle.coral, size: 30)
                TextField(language.t("groups:create.nameHint"), text: $model.name)
                    .font(.body.weight(.semibold))
                    .submitLabel(.done)
                    .accessibilityLabel(language.t("groups:create.name"))
                    .accessibilityIdentifier("groups.newName")
            }
            .frame(minHeight: 52)
            Divider().padding(.leading, 42)
            HStack(spacing: 12) {
                NativeIconTile(symbol: "dollarsign.arrow.circlepath", color: Color(hex: 0x2E9B62), size: 30)
                // Outside a Form a menu picker drops its label: the label is its own text.
                Text(language.t("groups:create.currency"))
                Spacer(minLength: 12)
                Picker(language.t("groups:create.currency"), selection: $model.currency) {
                    ForEach(model.currencyOptions, id: \.self) { Text(verbatim: $0).tag($0) }
                }
                .pickerStyle(.menu)
                .labelsHidden()
                .fixedSize()
                .tint(NativeStyle.tint)
            }
            .frame(minHeight: 52)
        }
        .padding(.horizontal, 14)
        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var people: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(language.t("groups:members.invite.title")).font(.headline)
                Text(language.t("groups:members.invite.subtitle")).font(.footnote).foregroundStyle(.secondary)
            }
            HStack(spacing: 8) {
                TextField(language.t("groups:members.invite.email"), text: $model.emailText)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                    .focused($typing)
                    .onSubmit { if model.addEmail() { typing = true } }
                    .padding(.horizontal, 14)
                    .frame(minHeight: 44)
                    .background(Theme.Colors.subtle, in: Capsule())
                    .accessibilityIdentifier("newGroup.email")
                Button { model.addEmail() } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(Color.white)
                        .frame(width: 44, height: 44)
                        .nativeGlass(Circle(), tint: NativeStyle.solid, interactive: true)
                }
                .buttonStyle(.plain)
                .disabled(model.emailText.trimmingCharacters(in: .whitespaces).isEmpty)
                .accessibilityLabel(language.t("groups:members.invite.send"))
            }
            if let problem = model.emailProblem {
                Text(problem).font(.footnote.weight(.semibold)).foregroundStyle(NativeStyle.negative)
            }
            ForEach(model.emails, id: \.self) { address in
                HStack(spacing: 10) {
                    NativeIconTile(symbol: "envelope.fill", color: NativeStyle.coral, size: 30)
                    Text(verbatim: address).font(.subheadline).lineLimit(1).truncationMode(.middle)
                    Spacer(minLength: 4)
                    Button { model.removeEmail(address) } label: {
                        Image(systemName: "xmark.circle.fill").font(.title3).foregroundStyle(.tertiary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(language.t("common:actions.delete"))
                }
            }
            Toggle(isOn: $model.shareLink) {
                Label(language.t("ios:native.newGroup.shareLink"), systemImage: "link")
                    .font(.subheadline.weight(.medium))
            }
            .tint(NativeStyle.solid)
            Text(language.t("groups:members.invite.emailHint")).font(.caption).foregroundStyle(.secondary)
        }
        .padding(16)
        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var next: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(language.t("ios:native.newGroup.next.title")).font(.headline)
            ForEach(Array(model.nextSteps.enumerated()), id: \.offset) { index, step in
                HStack(alignment: .top, spacing: 12) {
                    Text(verbatim: "\(index + 1)")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(NativeStyle.tint)
                        .frame(width: 24, height: 24)
                        .background(Theme.Colors.accentSubtle, in: Circle())
                    Text(step).font(.subheadline).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NativeStyle.card.opacity(0.6), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Color.primary.opacity(0.08), style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
        }
    }

    private var createBar: some View {
        Button {
            Task {
                if await model.create(cover: GroupCoverFile.make(photo: photo, emoji: emoji, colour: colour)) {
                    NativeHaptics.success()
                }
            }
        } label: {
            Group {
                if model.busy {
                    ProgressView().tint(Color.white)
                } else {
                    Text(language.t("groups:create.submit"))
                }
            }
            .frame(maxWidth: .infinity)
        }
        .nativeGlassButton(prominent: true)
        .disabled(!model.canCreate)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .nativeFootBar()
        .accessibilityIdentifier("newGroup.create")
    }

    // MARK: Done

    private func doneView(_ done: NewGroupModel.Done) -> some View {
        ScrollView {
            VStack(spacing: 18) {
                GroupCoverView(photo: photo, emoji: emoji, colour: GroupCoverArt.colour(colour), size: 112)
                    .overlay(alignment: .bottomTrailing) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 34))
                            .symbolRenderingMode(.palette)
                            .foregroundStyle(Color.white, NativeStyle.positive)
                            .background(NativeStyle.canvas, in: Circle())
                            .offset(x: 10, y: 10)
                    }
                    .padding(.top, 12)
                Text(language.t("ios:native.newGroup.done", ["name": .string(done.name)]))
                    .font(NativeStyle.title(26, lang: language.current))
                    .multilineTextAlignment(.center)
                if let problem = done.photoProblem {
                    NativeNotice(text: problem, warning: true)
                }
                if !done.sent.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(language.t("groups:members.invite.title")).font(.headline)
                        ForEach(done.sent) { sent in
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: sent.ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                                    .foregroundStyle(sent.ok ? NativeStyle.positive : NativeStyle.warning)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(verbatim: sent.email).font(.subheadline.weight(.semibold))
                                    Text(sent.text).font(.footnote).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                }
                if let link = done.link { InviteLinkCard(link: link) }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 40)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Button { onCreated(done.id) } label: {
                Text(language.t("ios:native.newGroup.open")).frame(maxWidth: .infinity)
            }
            .nativeGlassButton(prominent: true)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .nativeFootBar()
            .accessibilityIdentifier("newGroup.open")
        }
        .nativeTabBarRoom()
    }
}

extension GroupCoverFile {
    /// The cover to upload: the photo as a JPEG at most 1600 px across (the
    /// bucket takes 5 MB), or the emoji on its colour as the website draws it
    /// (groupCover.COVER_IMAGE: a 600 px PNG); none when neither was picked.
    @MainActor
    static func make(photo: UIImage?, emoji: String?, colour: String) -> GroupCoverFile? {
        if let photo {
            let side = max(photo.size.width, photo.size.height)
            let scale = min(1, 1600 / max(side, 1))
            let size = CGSize(width: photo.size.width * scale, height: photo.size.height * scale)
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1
            let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
                photo.draw(in: CGRect(origin: .zero, size: size))
            }
            guard let data = resized.jpegData(compressionQuality: 0.85) else { return nil }
            return GroupCoverFile(data: data, contentType: "image/jpeg", ext: "jpg")
        }
        guard let emoji, let image = GroupCoverArt.choices.image else { return nil }
        let renderer = ImageRenderer(content: GroupCoverView(emoji: emoji, colour: GroupCoverArt.colour(colour),
                                                             size: image.size, rounded: false))
        renderer.scale = 1
        guard let data = renderer.uiImage?.pngData() else { return nil }
        return GroupCoverFile(data: data, contentType: image.type, ext: image.ext)
    }
}

/// A join link to share: the link itself, Copy and Share in glass.
struct InviteLinkCard: View {
    let link: String
    /// On its own card (false: inside another card).
    var framed = true
    @Environment(AppLanguage.self) private var language
    @State private var copied = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(language.t("groups:modals.invite.field"), systemImage: "link")
                .font(.headline)
            Text(verbatim: link)
                .font(.system(size: 13, design: .monospaced))
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .truncationMode(.middle)
                .textSelection(.enabled)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            HStack(spacing: 10) {
                Button {
                    UIPasteboard.general.string = link
                    copied = true
                } label: {
                    Label(language.t(copied ? "groups:modals.invite.copied" : "groups:modals.invite.copy"),
                          systemImage: copied ? "checkmark" : "doc.on.doc")
                        .frame(maxWidth: .infinity)
                }
                .nativeGlassButton()
                if let url = URL(string: link) {
                    ShareLink(item: url, subject: Text(language.t("groups:modals.invite.shareTitle"))) {
                        Label(language.t("groups:actions.share"), systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                    .nativeGlassButton(prominent: true)
                }
            }
        }
        .padding(framed ? 16 : 0)
        .background(framed ? NativeStyle.card : Color.clear, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}
