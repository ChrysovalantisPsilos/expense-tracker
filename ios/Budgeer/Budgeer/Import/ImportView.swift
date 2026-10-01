// Import a bank statement (ImportModel), one step at a time on one page, as
// on the web: the file (picked in Files, read on this phone), the layout
// with the columns to adjust and a live preview, the exchange rates the ECB
// couldn't give, the new merchants' categories, then what was imported.
// Every action sits at the end of what it acts on; a message from the last
// action shows over the step.
import SwiftUI
import UniformTypeIdentifiers

@MainActor
struct ImportView: View {
    @Bindable var model: ImportModel
    /// "View transactions": Activity over the imported entries' days.
    var viewTransactions: (_ from: String?, _ to: String?) -> Void = { _, _ in }
    @Environment(AppLanguage.self) private var language
    @State private var picking = false

    /// What the web's picker accepts: .csv, .txt, .tsv, .xlsx, .xls.
    static let fileTypes: [UTType] = [.commaSeparatedText, .tabSeparatedText, .plainText]
        + ["xlsx", "xls"].compactMap { UTType(filenameExtension: $0) }

    var body: some View {
        List {
            if let notice = model.notice {
                Section {
                    NativeNotice(text: notice.title, warning: notice.warning)
                    if let text = notice.text { Text(text).font(.footnote).foregroundStyle(.secondary) }
                }
                .listRowBackground(NativeStyle.card)
            }
            switch model.step {
            case .upload: upload
            case .map: map
            case .rates: rates
            case .review: review
            case .done: done
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .scrollDismissesKeyboard(.interactively)
        .nativeTabBarRoom()
        .navigationTitle(language.t("import:title"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
        .fileImporter(isPresented: $picking, allowedContentTypes: ImportView.fileTypes) { result in
            if case .success(let url) = result { Task { await model.read(url: url) } }
        }
        .sensoryFeedback(.success, trigger: model.step == .done)
    }

    // MARK: Upload

    private var upload: some View {
        Section {
            VStack(spacing: 14) {
                Image(systemName: "square.and.arrow.down.on.square.fill")
                    .font(.system(size: 30, weight: .semibold))
                    .foregroundStyle(NativeStyle.tint)
                    .frame(width: 64, height: 64)
                    .background(NativeStyle.tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                Text(language.t("import:upload.title")).font(.headline).multilineTextAlignment(.center)
                Text(language.t("import:upload.text")).font(.subheadline).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                if model.reading {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text(language.t("import:upload.reading")).font(.subheadline).foregroundStyle(.secondary)
                    }
                    .frame(minHeight: 48)
                } else {
                    Button {
                        picking = true
                    } label: {
                        Label(language.t("import:upload.choose"), systemImage: "doc.badge.plus")
                    }
                    .nativeGlassButton(prominent: true)
                    .accessibilityIdentifier("import.choose")
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18)
        } footer: {
            Text(model.uploadMore)
        }
        .listRowBackground(NativeStyle.card)
    }

    // MARK: Map

    @ViewBuilder private var map: some View {
        Section {
            HStack(spacing: 12) {
                NativeIconTile(symbol: "tablecells.fill")
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: model.fileName).font(.headline).lineLimit(1)
                    Text(model.rowsLabel).font(.footnote).foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                Button(language.t("import:map.changeFile")) { model.startOver() }
                    .font(.subheadline)
                    .buttonStyle(.borderless)
                    .accessibilityIdentifier("import.changeFile")
            }
            Text(model.detectionText).font(.subheadline).foregroundStyle(.secondary)
            Button {
                withAnimation(.snappy) { model.showMapping.toggle() }
            } label: {
                Label(language.t(model.showMapping ? "import:map.hideColumns" : "import:map.adjustColumns"),
                      systemImage: "slider.horizontal.3")
            }
            .accessibilityIdentifier("import.columns")
        }
        .listRowBackground(NativeStyle.card)

        if !model.holderMapped {
            Section {
                TextField(language.t("import:map.holderPlaceholder"),
                          text: Binding(get: { model.holderName }, set: { model.setHolderName($0) }))
                    .textContentType(.name)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("import.holder")
            } header: {
                NativeCapsHeader(title: language.t("import:map.holder"))
            } footer: {
                Text(language.t("import:map.holderHint"))
            }
            .listRowBackground(NativeStyle.card)
        }

        if model.showMapping { columns }

        Section {
            if model.previewRows.isEmpty {
                Text(language.t(model.mappingComplete ? "import:preview.unreadable" : "import:preview.mapToPreview"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            ForEach(model.previewRows) { row in
                HStack(spacing: 12) {
                    CategoryBadge(look: row.look, size: 32)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: row.title).lineLimit(1)
                        Text(verbatim: row.meta).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    Text(verbatim: row.amount)
                        .font(.body.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(row.income ? NativeStyle.positive : Color.primary)
                }
            }
            if let note = model.previewNote {
                Text(note).font(.footnote).foregroundStyle(.secondary)
            }
        } header: {
            NativeCapsHeader(title: language.t("import:preview.title"))
        } footer: {
            Text(language.t("import:preview.subtitle"))
        }
        .listRowBackground(NativeStyle.card)

        Section {
            actionRow {
                Button {
                    Task { await model.prepare() }
                } label: {
                    Label(language.t("import:preview.import", ["count": .int(model.ready)]), systemImage: "checkmark")
                        .frame(maxWidth: .infinity)
                }
                .nativeGlassButton(prominent: true)
                .disabled(model.ready == 0 || model.busy)
                .accessibilityIdentifier("import.import")
            } busy: { language.t("import:preview.importing", ["count": .int(model.ready)]) }
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
    }

    /// The column-mapping form (MappingFields): one picker per field, then
    /// how the file writes dates and decimals.
    private var columns: some View {
        Section {
            ForEach(model.fields, id: \.key) { field in
                Picker(selection: Binding(get: { model.column(field.key) }, set: { model.setColumn(field.key, $0) })) {
                    Text(language.t(field.required ? "import:mapping.selectColumn" : "import:mapping.noColumn")).tag("")
                    ForEach(model.headers, id: \.self) { header in Text(verbatim: header).tag(header) }
                } label: {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(language.t("import:fields.\(field.key).label")
                             + (field.required ? " *" : ""))
                        if field.hint {
                            Text(language.t("import:fields.\(field.key).hint")).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .pickerStyle(.menu)
                .accessibilityIdentifier("import.field.\(field.key)")
            }
            Picker(language.t("import:mapping.dateOrder"),
                   selection: Binding(get: { model.column("dateOrder").isEmpty ? (model.dateOrders.first ?? "") : model.column("dateOrder") },
                                      set: { model.setColumn("dateOrder", $0) })) {
                ForEach(model.dateOrders, id: \.self) { order in Text(language.t("import:mapping.dateOrders.\(order)")).tag(order) }
            }
            .pickerStyle(.menu)
            Picker(language.t("import:mapping.decimal"),
                   selection: Binding(get: { model.column("decimal").isEmpty ? (model.decimals.last?.value ?? "") : model.column("decimal") },
                                      set: { model.setColumn("decimal", $0) })) {
                ForEach(model.decimals, id: \.value) { option in Text(language.t("import:mapping.decimals.\(option.id)")).tag(option.value) }
            }
            .pickerStyle(.menu)
        } footer: {
            Text(language.t("import:map.help"))
        }
        .listRowBackground(NativeStyle.card)
    }

    // MARK: Rates

    @ViewBuilder private var rates: some View {
        Section {
            ForEach(model.missingRates, id: \.currency) { item in
                VStack(alignment: .leading, spacing: 6) {
                    Text(model.rateLabel(item.currency, count: item.count)).font(.subheadline)
                    TextField(language.t("import:rates.placeholder"),
                              text: Binding(get: { model.rateInput[item.currency] ?? "" },
                                            set: { model.setRate(item.currency, $0) }))
                        .keyboardType(.decimalPad)
                        .font(.body.weight(.semibold))
                        .monospacedDigit()
                        .accessibilityIdentifier("import.rate.\(item.currency)")
                }
                .padding(.vertical, 2)
            }
        } header: {
            NativeCapsHeader(title: language.t("import:rates.title"))
        } footer: {
            Text(language.t("import:rates.text"))
        }
        .listRowBackground(NativeStyle.card)

        Section {
            actionRow {
                HStack(spacing: 10) {
                    Button(language.t("common:actions.back")) { model.backToMap() }
                        .nativeGlassButton()
                    Button {
                        Task { await model.continueWithRates() }
                    } label: {
                        Label(language.t("import:rates.continue"), systemImage: "checkmark").frame(maxWidth: .infinity)
                    }
                    .nativeGlassButton(prominent: true)
                    .disabled(!model.ratesReady || model.busy)
                    .accessibilityIdentifier("import.ratesContinue")
                }
            } busy: { language.t("import:preview.importing", ["count": .int(model.ready)]) }
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
    }

    // MARK: Review

    @ViewBuilder private var review: some View {
        Section {
            Text(language.t("import:review.text")).font(.subheadline).foregroundStyle(.secondary)
            if let note = model.ideasNote {
                HStack(alignment: .top, spacing: 8) {
                    if model.ideas == .working {
                        ProgressView()
                    } else {
                        Image(systemName: model.ideas == .done && !model.suggested.isEmpty ? "sparkle" : "exclamationmark.circle")
                            .foregroundStyle(model.ideas == .done && !model.suggested.isEmpty ? NativeStyle.tint : Color.secondary)
                    }
                    Text(note).font(.subheadline)
                }
                .accessibilityIdentifier("import.ideas")
            }
        } header: {
            NativeCapsHeader(title: language.t("import:review.title"))
        }
        .listRowBackground(NativeStyle.card)

        Section {
            ForEach(model.merchants) { merchant in
                VStack(alignment: .leading, spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: merchant.pattern).font(.subheadline.weight(.semibold))
                        HStack(spacing: 6) {
                            Text(verbatim: merchant.meta).font(.footnote).foregroundStyle(.secondary)
                            if model.isSuggested(merchant.id) { SuggestedMark() }
                        }
                    }
                    Picker(selection: Binding(get: { model.assign[merchant.id] ?? "" }, set: { model.choose(merchant.id, $0) })) {
                        Text(language.t("import:review.uncategorized")).tag("")
                        ForEach(model.choices(merchant.kind), id: \.id) { choice in Text(choice.name).tag(choice.id) }
                    } label: {
                        Text(language.t("import:review.categoryFor", [
                            "merchant": .string(merchant.pattern),
                            "kind": .string(language.t("import:preview.kind.\(merchant.kind)")),
                        ]))
                    }
                    .pickerStyle(.menu)
                    .labelsHidden()
                    .accessibilityIdentifier("import.merchant.\(merchant.pattern)")
                }
                .padding(.vertical, 2)
            }
        }
        .listRowBackground(NativeStyle.card)

        Section {
            actionRow {
                HStack(spacing: 10) {
                    Button(language.t("common:actions.back")) { model.backToMap() }
                        .nativeGlassButton()
                    Button {
                        Task { await model.importReviewed() }
                    } label: {
                        Label(language.t("import:review.import", ["count": .int(model.reviewCount)]), systemImage: "checkmark")
                            .frame(maxWidth: .infinity)
                    }
                    .nativeGlassButton(prominent: true)
                    .disabled(model.busy)
                    .accessibilityIdentifier("import.reviewImport")
                }
            } busy: { language.t("import:preview.importing", ["count": .int(model.reviewCount)]) }
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
    }

    // MARK: Done

    @ViewBuilder private var done: some View {
        if let done = model.done {
            Section {
                VStack(spacing: 10) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(NativeStyle.positive)
                        .frame(width: 64, height: 64)
                        .background(NativeStyle.positive.opacity(0.14), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    Text(done.title).font(.title3.weight(.semibold)).multilineTextAlignment(.center)
                    if let dated = done.dated {
                        Text(dated).font(.subheadline).multilineTextAlignment(.center)
                    }
                    ForEach(done.notes, id: \.self) { note in
                        Text(note).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
            }
            .listRowBackground(NativeStyle.card)

            Section {
                VStack(spacing: 10) {
                    Button {
                        viewTransactions(done.from, done.to)
                    } label: {
                        Text(language.t("import:done.view")).frame(maxWidth: .infinity)
                    }
                    .nativeGlassButton(prominent: true)
                    .accessibilityIdentifier("import.view")
                    Button {
                        model.startOver()
                    } label: {
                        Text(language.t("import:done.another")).frame(maxWidth: .infinity)
                    }
                    .nativeGlassButton()
                    .accessibilityIdentifier("import.another")
                }
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
        }
    }

    /// A step's actions, with "Importing 12 rows…" above them while the import runs.
    private func actionRow<Content: View>(@ViewBuilder _ content: () -> Content, busy: () -> String) -> some View {
        VStack(spacing: 10) {
            if model.busy {
                HStack(spacing: 8) {
                    ProgressView()
                    Text(busy()).font(.footnote).foregroundStyle(.secondary)
                }
            }
            content()
        }
        .padding(.vertical, 4)
    }
}

/// The one mark every AI suggestion carries until it's changed (SuggestedMark).
struct SuggestedMark: View {
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Label(language.t("ai:suggested"), systemImage: "sparkle")
            .labelStyle(.titleAndIcon)
            .font(.caption.weight(.semibold))
            .foregroundStyle(NativeStyle.tint)
    }
}

/// Import with its model made once (so a picked file survives the page's refreshes).
@MainActor
struct ImportHost: View {
    let data: DataLayer
    let userId: String
    var viewTransactions: (_ from: String?, _ to: String?) -> Void = { _, _ in }
    @State private var model: ImportModel?

    var body: some View {
        Group {
            if let model {
                ImportView(model: model, viewTransactions: viewTransactions)
            } else {
                NativeLoading().background(NativeStyle.canvas)
            }
        }
        .onAppear { if model == nil { model = ImportModel(data: data, userId: userId) } }
    }
}
