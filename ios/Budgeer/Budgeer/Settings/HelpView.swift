// Help & FAQ (the web's Help page), native: the intro and the hobby-project
// notice, a search over every question (every word must match its question,
// answer, steps or section; the count says how many), then the sections with
// each question opening its answer in place: the paragraphs, the numbered
// steps, the app's clip (played from the website) and "Copy link to this
// answer" (the website's address of it). With nothing found, the web's
// line and Show all questions. Then the Privacy page and the service status.
// A link to one question (/help#bank-import) opens with it open.
// The questions, answers and search are the core's (faqContent, faqMath),
// in the app's language; the web's install sketches are drawings of a
// browser's menus, so they stay on the website.
import AVKit
import SwiftUI
import UIKit
import BudgeerCore

struct FaqMedia: Decodable, Equatable {
    /// 'clip' or 'install'.
    let type: String
    let name: String?
    let alt: String?
}

struct FaqItem: Decodable, Equatable, Identifiable {
    let id: String
    let q: String
    let a: [String]
    let steps: [String]?
    let media: FaqMedia?
}

struct FaqSection: Decodable, Equatable, Identifiable {
    let id: String
    let title: String
    let items: [FaqItem]
}

enum HelpFigures {
    /// faqContent.faqSections: the sections whose questions match `query`.
    static func sections(_ query: String, core: BudgeerCore = .shared) -> [FaqSection] {
        (try? core.call("faqContent", "faqSections", [query])) ?? []
    }

    /// Every section as the core answers it (for faqMath's own calls).
    static func sectionsJSON(core: BudgeerCore = .shared) -> JSONValue {
        (try? core.json("faqContent", "faqSections", [""])) ?? []
    }

    /// faqMath.questionLink: the website's address of one answer.
    static func link(site: String, id: String, core: BudgeerCore = .shared) -> String {
        (try? core.call("faqMath", "questionLink", [site, "/help", id])) ?? site + "/help#" + id
    }

    /// faqMath.clipSources' MP4 (H.264, every iPhone), on the website.
    static func clip(site: String, name: String, core: BudgeerCore = .shared) -> URL? {
        guard let sources = try? core.json("faqMath", "clipSources", [name]),
              let path = sources["mp4"]?.stringValue else { return nil }
        return URL(string: site + path)
    }
}

@MainActor
struct HelpView: View {
    let site: String
    @Environment(AppLanguage.self) private var language
    @State private var query = ""
    @State private var open: Set<String>
    @State private var copied: String?
    @State private var web: WebPage?

    /// `anchor`: a question to open (faqMath.anchorFromHash: only one that exists).
    init(site: String, anchor: String? = nil) {
        self.site = site
        let found: JSONValue? = anchor.flatMap { name in
            try? BudgeerCore.shared.json("faqMath", "anchorFromHash", [name, HelpFigures.sectionsJSON()])
        }
        _open = State(initialValue: Set([found?.stringValue].compactMap { $0 }))
    }

    var body: some View {
        let sections = HelpFigures.sections(query)
        let count = sections.reduce(0) { $0 + $1.items.count }
        return List {
            Section {
                Text(language.t("help:intro")).font(.subheadline).foregroundStyle(.secondary)
            }
            .listRowBackground(Color.clear)
            if query.trimmingCharacters(in: .whitespaces).isEmpty {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(language.t("common:hobby.title")).font(.subheadline.weight(.semibold))
                        Text(language.t("common:hobby.notice")).font(.footnote).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }
                .listRowBackground(NativeStyle.card)
            } else {
                Section {
                    Text(language.t("help:search.found", ["count": .int(count)]))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("help.found")
                }
                .listRowBackground(Color.clear)
            }
            ForEach(sections) { section in
                Section {
                    ForEach(section.items) { item in question(item) }
                } header: {
                    NativeCapsHeader(title: section.title)
                }
                .listRowBackground(NativeStyle.card)
            }
            if count == 0 {
                Section {
                    VStack(spacing: 8) {
                        Text(language.t("help:search.none", ["query": .string(query.trimmingCharacters(in: .whitespaces))]))
                            .font(.subheadline.weight(.semibold))
                        Text(language.t("help:search.noneHint")).font(.footnote).foregroundStyle(.secondary)
                        Button(language.t("help:search.showAll")) { query = "" }
                            .nativeGlassButton()
                            .padding(.top, 4)
                    }
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                }
                .listRowBackground(NativeStyle.card)
            }
            Section {
                VStack(spacing: 10) {
                    rich(language.t("help:seeAlso", ["disclaimer": .string(language.t("common:hobby.disclaimer"))]),
                         link: "/privacy")
                    if let status = SettingsFigures.contact()?.status {
                        rich(language.t("help:status"), link: status)
                    }
                }
                .font(.footnote)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
            }
            .listRowBackground(Color.clear)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("help:title"))
        .searchable(text: $query, prompt: language.t("help:search.label"))
        .sheet(item: $web) { page in SafariView(url: page.url).ignoresSafeArea() }
        .sensoryFeedback(.success, trigger: copied)
        // The questions are worded in the language on screen.
        .id(language.current)
    }

    /// One question: tap to open its answer in place.
    private func question(_ item: FaqItem) -> some View {
        DisclosureGroup(isExpanded: Binding(get: { open.contains(item.id) },
                                            set: { shown in
                                                if shown { open.insert(item.id) } else { open.remove(item.id) }
                                            })) {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(item.a.enumerated()), id: \.offset) { _, paragraph in
                    Text(paragraph).font(.subheadline).foregroundStyle(.secondary)
                }
                if let steps = item.steps {
                    ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(verbatim: "\(index + 1).").monospacedDigit()
                            Text(step)
                        }
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    }
                }
                if let media = item.media, media.type == "clip", let name = media.name,
                   let url = HelpFigures.clip(site: site, name: name) {
                    FaqClipView(url: url, alt: media.alt ?? "")
                }
                Button {
                    UIPasteboard.general.string = HelpFigures.link(site: site, id: item.id)
                    copied = item.id
                } label: {
                    Label(language.t(copied == item.id ? "help:linkCopied" : "help:copyLink"),
                          systemImage: copied == item.id ? "checkmark" : "link")
                        .font(.footnote.weight(.semibold))
                }
                .buttonStyle(.borderless)
                .foregroundStyle(NativeStyle.tint)
                .accessibilityIdentifier("help.copy.\(item.id)")
            }
            .padding(.vertical, 4)
        } label: {
            Text(item.q).font(.body.weight(.medium)).padding(.vertical, 4)
        }
        .tint(Color.secondary)
        .accessibilityIdentifier("help.q.\(item.id)")
    }

    /// A line with one <link>: the words, the link's in the tint; a tap opens it in the app.
    private func rich(_ text: String, link: String) -> some View {
        let nodes = SettingsFigures.rich(text).arrayValue ?? []
        let line = nodes.reduce(Text(verbatim: "")) { line, node in
            if let plain = node.stringValue { return line + Text(plain).foregroundColor(.secondary) }
            let inner = (node["children"]?.arrayValue ?? []).compactMap(\.stringValue).joined()
            return line + Text(inner).foregroundColor(NativeStyle.tint).fontWeight(.semibold)
        }
        return Button { web = WebPage(link, site: site) } label: { line }
            .buttonStyle(.plain)
    }
}

/// An answer's clip from the app (muted, looping, with the controls), from the website.
private struct FaqClipView: View {
    let url: URL
    let alt: String
    @State private var player: AVPlayer?

    var body: some View {
        VideoPlayer(player: player)
            .aspectRatio(16 / 10, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .accessibilityLabel(alt)
            .onAppear {
                if player == nil {
                    let made = AVPlayer(url: url)
                    made.isMuted = true
                    player = made
                }
            }
            .onDisappear { player?.pause() }
    }
}
