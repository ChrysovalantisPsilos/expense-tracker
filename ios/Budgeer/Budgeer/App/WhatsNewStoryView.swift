// "What's new" as a story (the web's WhatsNewStory), full screen: one change
// per page, a segmented bar for the progress, the brand's ring with the
// page's one or two chips floating around it, "1 of 2 · 2 Oct", the title and
// the words, and the page's action when it has one (it opens that screen of
// the app and closes the story). Swipe between pages; Skip, and Next (Done
// on the last). Every word is the core's (whatsNewMath.storyFor).
import SwiftUI

@MainActor
struct WhatsNewStoryView: View {
    let story: WhatsNewStory
    /// The story is done: nil, or the web address of the page an action opens.
    let close: (String?) -> Void
    @Environment(AppLanguage.self) private var language
    @State private var index = 0

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                ForEach(Array(story.pages.indices), id: \.self) { page in
                    Capsule()
                        .fill(page <= index ? NativeStyle.tint : Color.primary.opacity(0.14))
                        .frame(height: 4)
                }
            }
            .animation(.easeOut(duration: 0.2), value: index)
            .accessibilityHidden(true)
            .padding(.top, 12)
            TabView(selection: $index) {
                ForEach(Array(story.pages.enumerated()), id: \.offset) { offset, page in
                    pageView(page, at: offset).tag(offset)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            HStack(spacing: 12) {
                Button(language.t("common:actions.skip")) { close(nil) }
                    .foregroundStyle(Color.primary)
                    .padding(.horizontal, 12)
                    .accessibilityIdentifier("whatsnew.skip")
                Button {
                    if index >= story.pages.count - 1 {
                        close(nil)
                    } else {
                        withAnimation { index += 1 }
                    }
                } label: {
                    Text(language.t(index >= story.pages.count - 1 ? "common:actions.done" : "common:actions.next"))
                        .frame(maxWidth: .infinity)
                }
                .nativeGlassButton(prominent: true)
                .accessibilityIdentifier("whatsnew.next")
            }
            .padding(.bottom, 12)
        }
        .padding(.horizontal, 24)
        .background(NativeStyle.canvas.ignoresSafeArea())
        .sensoryFeedback(.selection, trigger: index)
    }

    private func pageView(_ page: WhatsNewStory.Page, at offset: Int) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Spacer(minLength: 0)
            StoryRing(chips: page.chips)
                .frame(maxWidth: .infinity)
                .frame(height: 280)
                .accessibilityHidden(true)
            Spacer(minLength: 0)
            Text(language.t("whatsnew:story.counter", ["page": .int(offset + 1), "pages": .int(story.pages.count),
                                                        "day": .string(story.day)]).capsLabel)
                .font(.caption.weight(.semibold))
                .foregroundStyle(NativeStyle.tint)
            Text(page.title)
                .font(NativeStyle.title(26, lang: language.current))
                .fixedSize(horizontal: false, vertical: true)
            Text(page.body)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if let action = page.action {
                Button {
                    close(action.to)
                } label: {
                    HStack(spacing: 6) {
                        Text(action.label)
                        Image(systemName: "arrow.right")
                    }
                }
                .nativeGlassButton()
                .padding(.top, 6)
                .accessibilityIdentifier("whatsnew.action")
            }
            Spacer(minLength: 16)
        }
    }
}

/// The brand's ring (the mark's amber and coral arcs) with the page's chips
/// floating around it: top right, then bottom left.
private struct StoryRing: View {
    let chips: [String]

    var body: some View {
        GeometryReader { proxy in
            let side = min(proxy.size.width, proxy.size.height) * 0.72
            let center = CGPoint(x: proxy.size.width / 2, y: proxy.size.height / 2)
            ZStack {
                Circle()
                    .stroke(Color.primary.opacity(0.07), lineWidth: side * 0.16)
                Circle()
                    .trim(from: 0, to: 0.18)
                    .stroke(NativeStyle.amber, style: StrokeStyle(lineWidth: side * 0.16, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Circle()
                    .trim(from: 0.24, to: 0.86)
                    .stroke(NativeStyle.coral, style: StrokeStyle(lineWidth: side * 0.16, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            .frame(width: side, height: side)
            .position(center)
            ForEach(Array(chips.prefix(2).enumerated()), id: \.offset) { offset, chip in
                Text(chip)
                    .font(.footnote.weight(.bold))
                    .lineLimit(1)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(NativeStyle.card, in: Capsule())
                    .overlay(Capsule().stroke(Color.primary.opacity(0.1), lineWidth: 1))
                    .shadow(color: Color.black.opacity(0.08), radius: 8, x: 0, y: 3)
                    .fixedSize()
                    .position(x: proxy.size.width * (offset == 0 ? 0.72 : 0.3),
                              y: proxy.size.height * (offset == 0 ? 0.22 : 0.8))
            }
        }
    }
}
