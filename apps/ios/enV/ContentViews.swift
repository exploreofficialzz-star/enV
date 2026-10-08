import SwiftUI

struct Screen: ViewModifier {
    func body(content: Content) -> some View {
        content
            .scrollContentBackground(.hidden)
            .background(Color.envSurface.ignoresSafeArea())
    }
}

struct HomeView: View {
    @EnvironmentObject private var store: CatalogStore
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    let onSearch: (String) -> Void
    let onTools: () -> Void
    let onAccount: () -> Void
    let onAssistant: () -> Void
    @State private var searchText = ""
    @FocusState private var isHomeSearchFocused: Bool
    private var hasSearchText: Bool { !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var searchSuggestions: [Tool] { hasSearchText ? Array(store.tools(matching: searchText).prefix(5)) : [] }
    private var homeTools: [Tool] {
        let limit = horizontalSizeClass == .regular ? webHomeToolIDs.count : 6
        return webHomeToolIDs.prefix(limit).compactMap { id in store.tools().first(where: { $0.id == id }) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    VStack(alignment: .center, spacing: 16) {
                        EnVLogo(homeHero: true).frame(width: 142, height: 56)
                        HStack(spacing: 12) {
                            EnVLogo().frame(width: 48, height: 32)
                            TextField(isHomeSearchFocused ? "" : "Search for a tool", text: $searchText)
                                .font(.body)
                                .multilineTextAlignment(.center)
                                .focused($isHomeSearchFocused)
                                .submitLabel(.search)
                                .onSubmit { onSearch(searchText) }
                            Button { onSearch(searchText) } label: {
                                EnVIcon(name: "Search", size: 24, tint: .envAccent)
                                    .frame(width: 42, height: 42)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Search")
                        }
                        .padding(.horizontal, 16)
                        .frame(maxWidth: .infinity, minHeight: 64, maxHeight: 64, alignment: .leading)
                        .background(Color.envCard, in: RoundedRectangle(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(isHomeSearchFocused ? Color.envAccent : Color.envBorder, lineWidth: 1))
                        .shadow(color: Color.black.opacity(0.05), radius: 2, y: 1)
                        if hasSearchText {
                            VStack(alignment: .leading, spacing: 10) {
                                if searchSuggestions.isEmpty {
                                    Text("No matching tools. Try “json”, “bmi”, or “qr”.")
                                        .font(.footnote)
                                        .foregroundStyle(Color.envMuted)
                                } else {
                                    ForEach(searchSuggestions) { tool in WebHomeSearchSuggestion(tool: tool) }
                                    HStack {
                                        Spacer()
                                        Button { onSearch(searchText) } label: {
                                            HStack(spacing: 6) {
                                                Text("See more results")
                                                EnVIcon(name: "ArrowRight", size: 15, tint: .envAccent)
                                            }
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(Color.envAccent)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                            .padding(12)
                            .background(Color.envCard, in: RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.envBorder, lineWidth: 1))
                        }
                        HStack(spacing: 8) {
                            HomePreviewBar(title: "AI assistant", action: onAssistant).frame(maxWidth: .infinity)
                            HomePreviewBar(title: "Total token = 100").frame(maxWidth: .infinity)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.horizontal, 20)
                        .padding(.top, 4)
                        Text("A focused toolkit for\neveryday work.")
                            .font(.system(size: 28, weight: .semibold))
                            .tracking(-0.4)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .multilineTextAlignment(.leading)
                            .foregroundStyle(Color.envInk)
                    }

                    VStack(alignment: .leading, spacing: 14) {
                        // Source guard contract: sectionHeader("Trending tools", subtitle: "Useful tools to explore today", accent: true)
                        Text("Trending tools")
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(Color.envAccent)
                        ForEach(homeTools) { tool in
                            WebHomeToolCard(tool: tool)
                        }
                        HStack {
                            Spacer()
                            Button(action: onTools) {
                                HStack(spacing: 6) {
                                    Text("See more tools")
                                    EnVIcon(name: "ArrowRight", size: 15, tint: .envAccent)
                                }
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Color.envAccent)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    WebHomeFooter(onAccount: onAccount)
                }
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 24)
            }
            .modifier(Screen())
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: Tool.self) { ToolDetailView(tool: $0) }
        }
        .modifier(EnVBrandNavigationStyle())
    }
}


private let webHomeToolIDs = [
    "audio-to-text", "percentage-calculator", "json-formatter", "image-compressor",
    "qr-generator", "password-generator", "video-to-mp4", "video-to-text",
    "youtube-video-downloader", "youtube-audio-extractor", "word-counter", "video-to-mp3",
]

private struct WebHomeToolCard: View {
    let tool: Tool
    var body: some View {
        NavigationLink(value: tool) {
            VStack(alignment: .leading, spacing: 0) {
                iconTile(tool.icon)
                Text(tool.name).font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.envInk).padding(.top, 12)
                Text(tool.description).font(.system(size: 12)).foregroundStyle(Color.envMuted).lineLimit(2).lineSpacing(2).padding(.top, 4)
                if tool.isPlanned { Text("Coming soon").font(.system(size: 10, weight: .medium)).foregroundStyle(Color.envSubtle).padding(.top, 10) }
                else if tool.clientSide { Text("IN-BROWSER").font(.system(size: 10, weight: .medium)).tracking(0.5).foregroundStyle(Color.envSubtle).padding(.top, 10) }
                HStack { Spacer(); EnVIcon(name: "ArrowRight", size: 16, tint: .primary) }.padding(.top, 12)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}

private struct WebHomeSearchSuggestion: View {
    let tool: Tool
    var body: some View {
        NavigationLink(value: tool) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text(tool.name).font(.subheadline.weight(.medium)).foregroundStyle(Color.envInk)
                    if tool.isPlanned { Text("Coming soon").font(.system(size: 9, weight: .semibold)).foregroundStyle(Color.envSubtle) }
                }
                Text(tool.description).font(.caption).foregroundStyle(Color.envMuted).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16).padding(.vertical, 10)
        }
        .buttonStyle(.plain)
    }
}

private struct WebHomeFooter: View {
    let onAccount: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            EnVLogo().frame(width: 142, height: 48)
            Text("Useful tools. One place. 10000 browser tools you can use without an account. Files and text stay on your device unless a tool says otherwise.").font(.footnote).foregroundStyle(Color.envMuted)
            Text("Product").font(.subheadline.weight(.semibold)).foregroundStyle(Color.envInk)
            VStack(alignment: .leading, spacing: 2) {
                ForEach(["About", "Tools", "Pricing", "Contact"], id: \.self) { label in
                    Button(label, action: onAccount).font(.footnote).foregroundStyle(Color.envMuted).buttonStyle(.plain).padding(.vertical, 5)
                }
            }
            Text("Legal").font(.subheadline.weight(.semibold)).foregroundStyle(Color.envInk)
            VStack(alignment: .leading, spacing: 2) {
                ForEach(["Privacy", "Terms", "Disclaimer", "Responsible use"], id: \.self) { label in
                    Button(label, action: onAccount).font(.footnote).foregroundStyle(Color.envMuted).buttonStyle(.plain).padding(.vertical, 5)
                }
            }
            Text("© 2026 chAs Technologies LLC · enV").font(.footnote).foregroundStyle(Color.envMuted)
            Text("43 categories · 10000 live tools").font(.footnote).foregroundStyle(Color.envMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct ToolCategoryGroup: Identifiable {
    let category: ToolCategory
    let tools: [Tool]
    var id: String { category.id }
}

struct ToolsView: View {
    @EnvironmentObject private var store: CatalogStore
    @Binding var toolsQuery: String
    @State private var visibleByCategory: [String: Int] = [:]

    private let columns = [GridItem(.adaptive(minimum: 150), spacing: 12)]
    private var matchingTools: [Tool] { store.tools(matching: toolsQuery) }
    private var categoryGroups: [ToolCategoryGroup] {
        let toolsByCategory = Dictionary(grouping: matchingTools, by: \.category)
        return store.categories.compactMap { category in
            guard let tools = toolsByCategory[category.id], !tools.isEmpty else { return nil }
            return ToolCategoryGroup(category: category, tools: tools)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 16) {
                            Text("All tools")
                                .font(.system(size: 28, weight: .semibold))
                                .tracking(-0.4)
                                .foregroundStyle(Color.envInk)
                                .lineLimit(1)
                                .minimumScaleFactor(0.85)
                            Spacer(minLength: 4)
                            HStack(spacing: 6) {
                                EnVIcon(name: "Search", size: 17, tint: .envMuted)
                                TextField("Search", text: $toolsQuery)
                                    .font(.system(size: 14))
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    .accessibilityLabel("Search all tools")
                                    .onChange(of: toolsQuery) { _ in visibleByCategory.removeAll() }
                            }
                            .padding(.horizontal, 10)
                            .frame(width: 148, height: 44)
                            .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorder, lineWidth: 1))
                        }
                        Text("Browse tools by category or search by name.")
                            .font(.subheadline)
                            .foregroundStyle(Color.envMuted)
                    }
                    if categoryGroups.isEmpty {
                        EmptyStateView(title: "No tools found", lucideIcon: "Search", message: "Try another name or keyword.")
                    } else {
                        ForEach(categoryGroups) { group in
                            let visibleCount = min(visibleByCategory[group.id] ?? 3, group.tools.count)
                            VStack(alignment: .leading, spacing: 12) {
                                HStack(spacing: 10) {
                                    iconTile(group.category.icon)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(group.category.name)
                                            .font(.headline.weight(.bold))
                                            .foregroundStyle(Color.envAccent)
                                        Text(group.category.blurb)
                                            .font(.caption)
                                            .foregroundStyle(Color.envMuted)
                                            .lineLimit(2)
                                    }
                                }
                                LazyVGrid(columns: columns, spacing: 12) {
                                    ForEach(group.tools.prefix(visibleCount)) { tool in ToolCard(tool: tool) }
                                }
                                if visibleCount < group.tools.count {
                                    HStack {
                                        Spacer()
                                        Button {
                                            visibleByCategory[group.id] = min(visibleCount + 6, group.tools.count)
                                        } label: {
                                            HStack(spacing: 8) {
                                                Text("See more tools")
                                                EnVIcon(name: "ChevronDown", size: 16, tint: .envAccent)
                                            }
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(Color.envAccent)
                                            .padding(.horizontal, 12)
                                            .padding(.vertical, 10)
                                            .background(Color.envCard, in: RoundedRectangle(cornerRadius: 10))
                                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envBorder, lineWidth: 1))
                                        }
                                        .buttonStyle(.plain)
                                        .accessibilityLabel("See more \(group.category.name) tools")
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 22)
            }
            .modifier(Screen())
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: String.self) { CategoryView(categoryID: $0) }
            .navigationDestination(for: Tool.self) { ToolDetailView(tool: $0) }
        }
        .modifier(EnVBrandNavigationStyle())
    }
}

struct CategoryView: View {
    @EnvironmentObject private var store: CatalogStore
    @State private var visibleCount = 6
    let categoryID: String
    private var categoryTools: [Tool] { store.tools(category: categoryID) }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                if let category = store.category(named: categoryID) {
                    Text(category.description)
                        .font(.subheadline)
                        .foregroundStyle(Color.envMuted)
                }
                if categoryTools.isEmpty {
                    EmptyStateView(title: "No tools in this category", lucideIcon: "Folder", message: "Check back as the enV toolkit grows.")
                } else {
                    ToolList(tools: Array(categoryTools.prefix(visibleCount)))
                }
                if visibleCount < categoryTools.count {
                    HStack {
                        Spacer()
                        Button {
                            visibleCount = min(visibleCount + 6, categoryTools.count)
                        } label: {
                            HStack(spacing: 8) {
                                Text("See more tools")
                                EnVIcon(name: "ChevronDown", size: 16, tint: .envAccent)
                            }
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.envAccent)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(Color.envCard, in: RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envBorder, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .modifier(Screen())
        .navigationTitle(store.category(named: categoryID)?.name ?? "Category")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: Tool.self) { ToolDetailView(tool: $0) }
    }
}

struct SearchView: View {
    @Binding var query: String

    var body: some View {
        NavigationStack {
            SearchResultsView(text: $query)
        }
        .modifier(EnVBrandNavigationStyle())
    }
}

struct SearchResultsView: View {
    @EnvironmentObject private var store: CatalogStore
    @Binding var text: String
    @State private var category: String?

    private var results: [Tool] { store.tools(matching: text, category: category) }

    var body: some View {
        VStack(spacing: 0) {
            Picker("Category", selection: $category) {
                Text("All categories").tag(String?.none)
                ForEach(store.categories) { Text($0.name).tag(Optional($0.id)) }
            }
            .pickerStyle(.menu)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, alignment: .leading)

            if results.isEmpty {
                EmptyStateView(title: "No tools found", lucideIcon: "Search", message: "Try another name, keyword, tag, or category.")
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("\(results.count) results")
                            .font(.caption)
                            .foregroundStyle(Color.envMuted)
                            .padding(.horizontal, 16)
                        ToolList(tools: results).padding(.horizontal, 16)
                    }
                    .padding(.vertical, 8)
                }
            }
        }
        .modifier(Screen())
        .searchable(text: $text, prompt: "Search names, descriptions, keywords, tags")
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: Tool.self) { ToolDetailView(tool: $0) }
    }
}

struct SavedView: View {
    @EnvironmentObject private var store: CatalogStore

    var body: some View {
        NavigationStack {
            Group {
                if store.favoriteTools.isEmpty {
                    EmptyStateView(title: "Nothing saved yet", lucideIcon: "Heart", message: "Tap the heart on any tool to keep it here.")
                } else {
                    ScrollView {
                        ToolList(tools: store.favoriteTools).padding(16)
                    }
                }
            }
            .modifier(Screen())
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: Tool.self) { ToolDetailView(tool: $0) }
        }
        .modifier(EnVBrandNavigationStyle())
    }
}

struct AccountView: View {
    @EnvironmentObject private var store: CatalogStore
    @AppStorage("env.themeMode") private var themeMode = "system"

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Your enV")
                        .font(.system(size: 28, weight: .semibold))
                        .foregroundStyle(Color.envInk)
                    VStack(alignment: .leading, spacing: 12) {
                        settingsRow("CircleCheck", "Offline catalog", "The complete tool catalog is bundled on this device.")
                        Text("\(NativeCoverage.localActiveToolCount(in: store.catalog)) of \(NativeCoverage.canonicalActiveToolCount(in: store.catalog)) active tools currently execute locally using the native engine families. URL media inspection still requires its remote service.")
                            .font(.footnote)
                            .foregroundStyle(Color.envMuted)
                    }
                    .padding(16)
                    .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorder, lineWidth: 1))

                    sectionHeader("Settings", subtitle: "App information and preferences")
                    VStack(spacing: 0) {
                        Button { themeMode = "system" } label: {
                            settingsRow("Settings", "Appearance", themeMode == "system" ? "Following device light/dark setting" : "Tap to follow the device appearance")
                        }
                        .buttonStyle(.plain)
                        .disabled(themeMode == "system")
                        Divider().overlay(Color.envBorder)
                        settingsRow("Bell", "Notifications", "Notifications are not configured in this foundation release.")
                        Divider().overlay(Color.envBorder)
                        NavigationLink { ContactExchangeView() } label: { settingsRow("Contact", "Instant Contact Exchange", "Native nearby sharing with explicit activation and Contacts saving.") }
                            .buttonStyle(.plain)
                        Divider().overlay(Color.envBorder)
                        NavigationLink { CompanyInformationView() } label: { settingsRow("Info", "About enV & chAs Technologies LLC", "Company details, policies, and pricing.") }
                            .buttonStyle(.plain)
                        Divider().overlay(Color.envBorder)
                        settingsRow("Hammer", "Native migration status", "More tool families are being moved to local Kotlin and Swift engines.")
                        Divider().overlay(Color.envBorder)
                        settingsRow("Info", "Version 1.1.0 (6)", "Separate native Android and iOS applications.")
                    }
                    .padding(16)
                    .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorder, lineWidth: 1))

                    sectionHeader("Privacy", subtitle: "Local-first catalog browsing")
                    settingsRow("ShieldCheck", "No account required", "Browse and save tools locally on this device.")
                }
                .padding(16)
            }
            .modifier(Screen())
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
        }
        .modifier(EnVBrandNavigationStyle())
    }
}

struct CompanyInformationView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("About & policies")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundStyle(Color.envInk)
                ChasTechnologiesLogo()
                    .frame(maxWidth: 520)
                    .frame(maxWidth: .infinity)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.envBorder, lineWidth: 1))

                CompanyInformationCard(title: "About enV", paragraphs: [
                    "A focused toolkit for everyday work across Web, Android, and iOS. enV is developed and operated by chAs Technologies LLC, registered in Delaware, USA.",
                    "Some tools process information on your device; connected features use the service or provider described for that feature."
                ])

                VStack(alignment: .leading, spacing: 10) {
                    Text("Contact").font(.title3.weight(.semibold)).foregroundStyle(Color.envInk)
                    Text("enV product support").font(.footnote).foregroundStyle(Color.envMuted)
                    Link("envtoolkit@gmail.com", destination: URL(string: "mailto:envtoolkit@gmail.com")!)
                    Text("Company inquiries · chAs Technologies LLC").font(.footnote).foregroundStyle(Color.envMuted)
                    Link("chastechnologiesllc@gmail.com", destination: URL(string: "mailto:chastechnologiesllc@gmail.com")!)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorder, lineWidth: 1))

                CompanyInformationCard(title: "Privacy", paragraphs: [
                    "chAs Technologies LLC, the company behind enV, is registered in Delaware, USA.",
                    "enV is for people aged 13 or older and is not intended for children under 13. If you are under the age of majority where you live, local parent or guardian permission requirements still apply.",
                    "Favorites, recent tools, theme preferences, and the Web contact card are stored locally until you clear app or browser data. Ordinary toolkit use does not require an account.",
                    "Some document and media tools upload selected files to the enV service or a processor configured for that deployment. The document endpoint removes its temporary working directory when processing finishes.",
                    "When AI is enabled, task input is sent through the enV server to the configured provider. Supported providers include Groq, OpenRouter, and Google Gemini; routing and brief result caching depend on deployment settings. Provider retention policies apply.",
                    "Optional sign-in may process account and session information. Nearby Contact Exchange sends enabled fields to participating nearby devices while active. Saving a received contact requires your separate action and permission.",
                    "For privacy requests, email envtoolkit@gmail.com. Provider and infrastructure retention may vary; avoid sending sensitive information to connected features unless comfortable with that handling."
                ])
                CompanyInformationCard(title: "Terms of Use", paragraphs: [
                    "You must be at least 13 years old to use enV. If you are under the age of majority where you live, use enV only with any parent or guardian permission required by local law.",
                    "These Terms are governed by the laws of the State of Delaware, United States, without regard to conflict-of-law principles. Subject to non-waivable consumer rights and mandatory laws that apply where you live, disputes relating to these Terms will be brought in state or federal courts located in Delaware. Nothing here limits a right or remedy that cannot lawfully be waived.",
                    "Use enV lawfully and responsibly. You are responsible for your inputs, permissions, and decisions based on results. Do not submit material you are not permitted to use or violate another person’s rights.",
                    "Outputs may be incomplete, inaccurate, or non-unique. Verify important results. Some features depend on third-party services and may change or become unavailable.",
                    "Prices are listed in USD. The token schedule is planned only: this app has no token balance, purchase checkout, or reward issuance. When payments are enabled, checkout is intended to convert USD prices to local currency in countries supported by the selected gateway; the final amount and currency will be shown before payment. Availability and conversion rates depend on the provider. Future token, payment, expiry, refund, and eligibility terms will be shown before activation.",
                    "To the extent allowed by applicable law, enV is provided as available without warranties that cannot be disclaimed. Nothing here limits a right or liability that cannot legally be limited."
                ])
                CompanyInformationCard(title: "Disclaimer", paragraphs: [
                    "enV provides general-purpose tools, not legal, medical, mental-health, financial, investment, tax, engineering, or safety-critical advice.",
                    "Calculations, generated content, and extracted data may be wrong or incomplete. Check inputs, assumptions, units, and outputs. Do not rely on a result as the sole basis for a high-stakes decision; consult a qualified professional when appropriate.",
                    "AI output may be biased, incorrect, incomplete, or similar to other output. Third-party service availability and handling are outside enV’s control."
                ])
                CompanyInformationCard(title: "Responsible Use", paragraphs: [
                    "Do not use enV for unlawful activity, fraud, harassment, impersonation, unauthorized access, malware, spam, infringement, or to violate another person’s privacy or rights.",
                    "Only submit content you are permitted to use. Review connected-feature notices before sending files or text to a server or AI provider. In Contact Exchange, enable only the fields you intend to share with nearby participants.",
                    "Keep a person responsible for reviewing results, especially for legal, medical, financial, tax, and safety-critical matters. Report safety or privacy concerns to envtoolkit@gmail.com."
                ])
                VStack(alignment: .leading, spacing: 10) {
                    Text("Pricing").font(.title3.weight(.semibold)).foregroundStyle(Color.envInk)
                    Text("Planned pricing — purchases are not available yet. The current app has no token balance, checkout, or referral-award system. Prices are listed in USD; when payments are enabled, checkout is intended to convert them to local currency in countries supported by the gateway and show the final amount and currency before payment.").font(.subheadline).foregroundStyle(Color.envMuted)
                    pricingRow("100 tokens", "$0.30")
                    pricingRow("300 tokens", "$0.50")
                    pricingRow("500 tokens", "$0.80")
                    pricingRow("1,000 tokens", "$1.20")
                    pricingRow("5,000 tokens", "$5.00")
                    Divider().overlay(Color.envBorder)
                    Text("Planned first sign-up bonus: 100 tokens · planned referral reward: 50 tokens. Eligibility and program rules will be published before rewards are enabled.")
                        .font(.footnote)
                        .foregroundStyle(Color.envMuted)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorder, lineWidth: 1))
            }
            .padding(16)
        }
        .modifier(Screen())
        .navigationTitle("Company information")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct CompanyInformationCard: View {
    let title: String
    let paragraphs: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.title3.weight(.semibold)).foregroundStyle(Color.envInk)
            ForEach(paragraphs, id: \.self) { paragraph in
                Text(paragraph).font(.subheadline).foregroundStyle(Color.envMuted)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorder, lineWidth: 1))
    }
}

private func pricingRow(_ tokens: String, _ price: String) -> some View {
    HStack {
        Text(tokens).foregroundStyle(Color.envMuted)
        Spacer()
        Text(price).fontWeight(.semibold).foregroundStyle(Color.envInk)
    }
}

private func sectionHeader(_ title: String, subtitle: String, accent: Bool = false) -> some View {
    VStack(alignment: .leading, spacing: 3) {
        Text(title).font(.title2.weight(.semibold)).foregroundStyle(accent ? Color.envAccent : Color.envInk)
        Text(subtitle).font(.subheadline).foregroundStyle(Color.envMuted)
    }
}

private struct HomePreviewBar: View {
    let title: String
    var action: (() -> Void)? = nil

    var body: some View {
        Group {
            if let action {
                Button(action: action) { content }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Open AI assistant")
            } else {
                content
            }
        }
    }

    private var content: some View {
        Text(title)
            .font(.caption.weight(.medium))
            .foregroundStyle(Color.envMuted)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .frame(maxWidth: .infinity, alignment: .center)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 8)
            .frame(height: 40)
            .background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorder, lineWidth: 1))
            .padding(.horizontal, 8)
    }
}

func iconTile(_ iconName: String) -> some View {
    EnVIcon(name: iconName, size: 16, tint: .primary)
        .frame(width: 36, height: 36)
        .background(Color.envAccentSoft, in: RoundedRectangle(cornerRadius: 6))
}

private func settingsRow(_ icon: String, _ title: String, _ detail: String) -> some View {
    HStack(alignment: .top, spacing: 12) {
        EnVIcon(name: icon, size: 18, tint: .envAccent).padding(.top, 2)
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Color.envInk)
            Text(detail).font(.footnote).foregroundStyle(Color.envMuted)
        }
        Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
}

private struct EmptyStateView: View {
    let title: String
    let lucideIcon: String
    let message: String

    var body: some View {
        VStack(spacing: 12) {
            EnVIcon(name: lucideIcon, size: 34, tint: .envAccent)
            Text(title).font(.title3.weight(.semibold)).foregroundStyle(Color.envInk)
            Text(message).multilineTextAlignment(.center).foregroundStyle(Color.envMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(32)
        .accessibilityElement(children: .combine)
    }
}
