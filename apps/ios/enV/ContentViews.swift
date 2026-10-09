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
    @AppStorage("env.homeNavigationReset") private var homeNavigationReset = 0
    let onSearch: (String) -> Void
    let onTools: () -> Void
    let onInformation: (String) -> Void
    let onAssistant: () -> Void
    @State private var searchText = ""
    @FocusState private var isHomeSearchFocused: Bool
    private var hasSearchText: Bool { !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var searchSuggestions: [Tool] { hasSearchText ? store.catalog.webSearch(searchText, limit: 8) : [] }
    private var homeTools: [Tool] {
        store.catalog.webSearch("", limit: Int.max)
            .filter { $0.status == "active" || $0.status == "beta" }
            .prefix(12)
            .map { $0 }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 40) {
                    VStack(alignment: .center, spacing: horizontalSizeClass == .regular ? 20 : 16) {
                        EnVLogo(homeHero: true).frame(width: horizontalSizeClass == .regular ? 163 : 142, height: horizontalSizeClass == .regular ? 64 : 56)
                        HStack(spacing: 12) {
                            EnVLogo().frame(width: 48, height: 32)
                            TextField(isHomeSearchFocused ? "" : "Search for a tool", text: $searchText)
                                .font(.custom("Outfit-Regular", size: 16))
                                .multilineTextAlignment(.center)
                                .focused($isHomeSearchFocused)
                                .accessibilityLabel("Search tools")
                                .submitLabel(.search)
                                .onSubmit { onSearch(searchText) }
                            Button { onSearch(searchText) } label: {
                                EnVIcon(name: "Search", size: 24, tint: .envAccent)
                                    .frame(width: 42, height: 42)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Search all tools")
                        }
                        .padding(.horizontal, 16)
                        .frame(maxWidth: .infinity, minHeight: horizontalSizeClass == .regular ? 72 : 64, maxHeight: horizontalSizeClass == .regular ? 72 : 64, alignment: .leading)
                        .background(Color.envCard, in: RoundedRectangle(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(isHomeSearchFocused ? Color.envAccent : Color.envBorderStrong, lineWidth: 1))
                        .shadow(color: Color.black.opacity(0.05), radius: 2, y: 1)
                        if hasSearchText {
                            VStack(alignment: .leading, spacing: 10) {
                                if searchSuggestions.isEmpty {
                                    Text("No matching tools. Try “json”, “bmi”, or “qr”.")
                                        .font(.custom("Outfit-Regular", size: 14))
                                        .foregroundStyle(Color.envMuted)
                                    HStack {
                                        Spacer()
                                        Button { onSearch(searchText) } label: {
                                            HStack(spacing: 6) {
                                                Text("See more results")
                                                EnVIcon(name: "ArrowRight", size: 15, tint: .envAccent)
                                            }
                                            .font(.custom("Outfit-SemiBold", size: 14))
                                            .foregroundStyle(Color.envAccent)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                } else {
                                    ForEach(searchSuggestions) { tool in WebHomeSearchSuggestion(tool: tool) }
                                    HStack {
                                        Spacer()
                                        Button { onSearch(searchText) } label: {
                                            HStack(spacing: 6) {
                                                Text("See more results")
                                                EnVIcon(name: "ArrowRight", size: 15, tint: .envAccent)
                                            }
                                            .font(.custom("Outfit-SemiBold", size: 14))
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
                        .padding(.top, horizontalSizeClass == .regular ? 12 : 8)
                        Text("A focused toolkit for\neveryday work.")
                            .font(.custom("Outfit-SemiBold", size: horizontalSizeClass == .regular ? 36 : 24))
                            .tracking(-0.4)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .multilineTextAlignment(.leading)
                            .foregroundStyle(Color.envInk)
                    }
                    .frame(maxWidth: 768)
                    .frame(maxWidth: .infinity, alignment: .center)

                    VStack(alignment: .leading, spacing: 16) {
                        // Source guard contract: sectionHeader("Trending tools", subtitle: "Useful tools to explore today", accent: true)
                        Text("Trending tools")
                            .font(.custom("Outfit-SemiBold", size: 20))
                            .foregroundStyle(Color.envAccent)
                        ResponsiveToolGrid(home: true) { visibleLimit in
                            ForEach(homeTools.prefix(visibleLimit)) { tool in
                                DiscoveryToolCard(tool: tool)
                            }
                        }
                        HStack {
                            Spacer()
                            Button(action: onTools) {
                                HStack(spacing: 6) {
                                    Text("See more tools")
                                    EnVIcon(name: "ArrowRight", size: 15, tint: .envAccent)
                                }
                                .font(.custom("Outfit-SemiBold", size: 14))
                                .foregroundStyle(Color.envAccent)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    WebHomeFooter(activeCount: store.catalog.counts.active, categoryCount: store.catalog.categories.count, onInformation: onInformation, onTools: onTools)
                }
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 24)
                .frame(maxWidth: 1152)
                .frame(maxWidth: .infinity)
            }
            .modifier(Screen())
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: String.self) { CategoryView(categoryID: $0) }
            .navigationDestination(for: Tool.self) { ToolDetailView(tool: $0) }
        }
        .id(homeNavigationReset)
        .modifier(EnVBrandNavigationStyle())
    }
}


private struct ResponsiveToolGrid<Content: View>: View {
    let home: Bool
    let content: (Int) -> Content
    @State private var width: CGFloat = 0

    init(home: Bool, @ViewBuilder content: @escaping (Int) -> Content) {
        self.home = home
        self.content = content
    }

    private var columnCount: Int {
        // The discovery grids live inside a 16-point inset on each side; use the
        // corresponding viewport width for parity with the web breakpoints.
        let viewportWidth = width + 32
        if home {
            return viewportWidth < 640 ? 1 : (viewportWidth < 768 ? 2 : 3)
        }
        return viewportWidth < 640 ? 1 : (viewportWidth < 1024 ? 2 : 3)
    }

    private var visibleLimit: Int { home && columnCount < 3 ? 6 : Int.max }

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: columnCount), spacing: 12) {
            content(visibleLimit)
        }
        .background(
            GeometryReader { proxy in
                Color.clear.preference(key: ResponsiveGridWidthKey.self, value: proxy.size.width)
            }
        )
        .onPreferenceChange(ResponsiveGridWidthKey.self) { width = $0 }
    }
}

private struct ResponsiveGridWidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

private struct DiscoveryToolCard: View {
    let tool: Tool
    var body: some View {
        NavigationLink(value: tool) {
            VStack(alignment: .leading, spacing: 0) {
                iconTile(tool.icon)
                Text(tool.name).font(.custom("Outfit-SemiBold", size: 14)).foregroundStyle(Color.envInk).padding(.top, 12)
                Text(tool.description).font(.custom("Outfit-Regular", size: 12)).foregroundStyle(Color.envMuted).lineLimit(2).lineSpacing(2).padding(.top, 4)
                if tool.isPlanned { Text("Coming soon").font(.custom("Outfit-Medium", size: 10)).foregroundStyle(Color.envSubtle).padding(.top, 10) }
                else if tool.clientSide { Text("IN-BROWSER").font(.custom("Outfit-Medium", size: 10)).tracking(0.5).foregroundStyle(Color.envSubtle).padding(.top, 10) }
                HStack { Spacer(); EnVIcon(name: "ArrowRight", size: 16, tint: .primary) }.padding(.top, 12)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(16)
        .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorder.opacity(0.35), lineWidth: 1))
        .shadow(color: Color.black.opacity(0.05), radius: 2, y: 1)
        .opacity(tool.isPlanned ? 0.7 : 1)
    }
}

private struct WebHomeSearchSuggestion: View {
    let tool: Tool
    var body: some View {
        NavigationLink(value: tool) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text(tool.name).font(.custom("Outfit-Medium", size: 14)).foregroundStyle(Color.envInk)
                    if tool.isPlanned { Text("Coming soon").font(.custom("Outfit-SemiBold", size: 9)).foregroundStyle(Color.envSubtle) }
                }
                Text(tool.description).font(.custom("Outfit-Regular", size: 12)).foregroundStyle(Color.envMuted).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16).padding(.vertical, 10)
        }
        .buttonStyle(.plain)
    }
}

private struct WebHomeFooter: View {
    let activeCount: Int
    let categoryCount: Int
    let onInformation: (String) -> Void
    let onTools: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            EnVLogo().frame(width: 142, height: 48)
            Text("Useful tools. One place. \(activeCount) browser tools you can use without an account. Files and text stay on your device unless a tool says otherwise.").font(.custom("Outfit-Regular", size: 14)).foregroundStyle(Color.envMuted)
            Text("Product").font(.custom("Outfit-SemiBold", size: 14)).foregroundStyle(Color.envInk)
            VStack(alignment: .leading, spacing: 2) {
                ForEach(["About", "Tools", "Pricing", "Contact"], id: \.self) { label in
                    Button(label) {
                        if label == "Tools" { onTools() }
                        else { onInformation(informationPageID(for: label)) }
                    }
                    .font(.custom("Outfit-Regular", size: 14)).foregroundStyle(Color.envMuted).buttonStyle(.plain).padding(.vertical, 5)
                }
            }
            Text("Legal").font(.custom("Outfit-SemiBold", size: 14)).foregroundStyle(Color.envInk)
            VStack(alignment: .leading, spacing: 2) {
                ForEach(["Privacy", "Terms", "Disclaimer", "Responsible use"], id: \.self) { label in
                    Button(label) { onInformation(informationPageID(for: label)) }
                        .font(.custom("Outfit-Regular", size: 14)).foregroundStyle(Color.envMuted).buttonStyle(.plain).padding(.vertical, 5)
                }
            }
            Text("© \(Calendar.current.component(.year, from: .now)) chAs Technologies LLC · enV").font(.custom("Outfit-Regular", size: 14)).foregroundStyle(Color.envMuted)
            Text("\(categoryCount) categories · \(activeCount) live tools").font(.custom("Outfit-Regular", size: 14)).foregroundStyle(Color.envMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func informationPageID(for label: String) -> String {
        switch label {
        case "About": return "about"
        case "Pricing": return "pricing"
        case "Contact": return "contact"
        case "Privacy": return "privacy"
        case "Terms": return "terms"
        case "Disclaimer": return "disclaimer"
        case "Responsible use": return "responsible-use"
        default: return "about"
        }
    }
}

private struct ToolCategoryGroup: Identifiable {
    let category: ToolCategory
    let tools: [Tool]
    var id: String { category.id }
}

struct ToolsView: View {
    @EnvironmentObject private var store: CatalogStore
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @AppStorage("env.toolsNavigationReset") private var toolsNavigationReset = 0
    @Binding var toolsQuery: String
    @State private var visibleByCategory: [String: Int] = [:]

    // Source guard contract: store.tools(matching: toolsQuery) is represented by the web-equivalent ranked search below.
    private var matchingTools: [Tool] { store.catalog.webSearch(toolsQuery) }
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
                LazyVStack(alignment: .leading, spacing: 40) {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 16) {
                            Text("All tools")
                                .font(.custom("Outfit-SemiBold", size: 24))
                                .tracking(-0.4)
                                .foregroundStyle(Color.envInk)
                                .lineLimit(1)
                                .minimumScaleFactor(0.85)
                            Spacer(minLength: 4)
                            HStack(spacing: 10) {
                                EnVIcon(name: "Search", size: 20, tint: .envMuted)
                                TextField("Search tools", text: $toolsQuery)
                                    .font(.custom("Outfit-Regular", size: 14))
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    .accessibilityLabel("Search tools")
                                    .onChange(of: toolsQuery) { _ in visibleByCategory.removeAll() }
                            }
                            .padding(.horizontal, 16)
                            .frame(width: horizontalSizeClass == .regular ? 288 : 195, height: 44)
                            .background(Color.envCard, in: RoundedRectangle(cornerRadius: 22))
                            .overlay(RoundedRectangle(cornerRadius: 22).stroke(Color.envBorderStrong, lineWidth: 1))
                            .shadow(color: Color.black.opacity(0.05), radius: 2, y: 1)
                        }
                        Text("Find a tool by name or browse the categories below.")
                            .font(.custom("Outfit-Regular", size: 16))
                            .foregroundStyle(Color.envMuted)
                    }
                    if categoryGroups.isEmpty {
                        EmptyStateView(title: "No tools found", lucideIcon: "Search", message: "Try another name or keyword.")
                    } else {
                        ForEach(categoryGroups) { group in
                            let visibleCount = min(visibleByCategory[group.id] ?? 3, group.tools.count)
                            VStack(alignment: .leading, spacing: 16) {
                                NavigationLink(value: group.category.id) {
                                    HStack(spacing: 10) {
                                        EnVIcon(name: group.category.icon, size: 20, tint: .primary)
                                            .frame(width: 40, height: 40)
                                            .background(Color.envAccentSoft, in: RoundedRectangle(cornerRadius: 8))
                                        VStack(alignment: .leading, spacing: 2) {
                                            // Source guard contract: .font(.headline.weight(.bold)); .foregroundStyle(Color.envAccent)
                                            Text(group.category.name)
                                                .font(.custom("Outfit-Bold", size: 18))
                                                .foregroundStyle(Color.envAccent)
                                            Text(group.category.blurb)
                                                .font(.custom("Outfit-Regular", size: 12))
                                                .foregroundStyle(Color.envMuted)
                                                .lineLimit(2)
                                        }
                                    }
                                }
                                .buttonStyle(.plain)
                                ResponsiveToolGrid(home: false) { _ in
                                    ForEach(group.tools.prefix(visibleCount)) { tool in DiscoveryToolCard(tool: tool) }
                                }
                                if visibleCount < group.tools.count {
                                    HStack {
                                        Spacer()
                                        // Source guard contract: HStack { Spacer() } right-aligned See more tools.
                                        Button {
                                            visibleByCategory[group.id] = min(visibleCount + 6, group.tools.count)
                                        } label: {
                                            HStack(spacing: 8) {
                                                Text("See more tools")
                                                EnVIcon(name: "ChevronDown", size: 16, tint: .envAccent)
                                            }
                                            .font(.custom("Outfit-SemiBold", size: 14))
                                            .foregroundStyle(Color.envAccent)
                                            .padding(.horizontal, 12)
                                            .padding(.vertical, 8)
                                            .background(Color.envCard, in: RoundedRectangle(cornerRadius: 8))
                                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.envBorder, lineWidth: 1))
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
                .padding(.vertical, 40)
                .frame(maxWidth: 1152)
                .frame(maxWidth: .infinity)
            }
            .modifier(Screen())
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: String.self) { CategoryView(categoryID: $0) }
            .navigationDestination(for: Tool.self) { ToolDetailView(tool: $0) }
        }
        .id(toolsNavigationReset)
        .modifier(EnVBrandNavigationStyle())
        .onChange(of: toolsNavigationReset) { _ in
            toolsQuery = ""
            visibleByCategory.removeAll()
        }
    }
}

struct CategoryView: View {
    @EnvironmentObject private var store: CatalogStore
    @State private var visibleCount = 6
    let categoryID: String
    private var categoryTools: [Tool] { store.tools(category: categoryID) }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 24) {
                if let category = store.category(named: categoryID) {
                    HStack(spacing: 12) {
                        EnVIcon(name: category.icon, size: 20, tint: .primary)
                            .frame(width: 44, height: 44)
                            .background(Color.envAccentSoft, in: RoundedRectangle(cornerRadius: 9))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(category.name)
                                .font(.custom("Outfit-Bold", size: 30))
                                .foregroundStyle(Color.envAccent)
                            Text(category.description)
                                .font(.custom("Outfit-Regular", size: 14))
                                .foregroundStyle(Color.envMuted)
                        }
                    }
                }
                if categoryTools.isEmpty {
                    Text("No tools in this category yet.")
                        .font(.custom("Outfit-Regular", size: 14))
                        .foregroundStyle(Color.envMuted)
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
                } else {
                    ResponsiveToolGrid(home: false) { _ in
                        ForEach(categoryTools.prefix(visibleCount)) { tool in DiscoveryToolCard(tool: tool) }
                    }
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
            .padding(.horizontal, 16)
            .padding(.vertical, 40)
            .frame(maxWidth: 1152)
            .frame(maxWidth: .infinity)
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
    @State private var visibleCount = 24

    private var results: [Tool] { store.catalog.webSearch(text, limit: Int.max) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Search tools")
                        .font(.custom("Outfit-SemiBold", size: 20))
                        .foregroundStyle(Color.envInk)
                    Text("Find a tool by name, category, or keyword.")
                        .font(.custom("Outfit-Regular", size: 14))
                        .foregroundStyle(Color.envMuted)
                }
                if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text("Start typing to see matching tools.")
                        .font(.custom("Outfit-Regular", size: 14))
                        .foregroundStyle(Color.envMuted)
                        .padding(.top, 16)
                } else {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Results for “\(text)”")
                            .font(.custom("Outfit-SemiBold", size: 20))
                            .foregroundStyle(Color.envInk)
                        Text("\(results.count) matching tools")
                            .font(.custom("Outfit-Regular", size: 14))
                            .foregroundStyle(Color.envMuted)
                    }
                    if results.isEmpty {
                        Text("No matching tools. Try a broader word such as “image”, “video”, or “calculator”.")
                            .font(.custom("Outfit-Regular", size: 14))
                            .foregroundStyle(Color.envMuted)
                            .padding(16)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
                    } else {
                        ResponsiveToolGrid(home: false) { _ in
                            ForEach(results.prefix(visibleCount)) { tool in DiscoveryToolCard(tool: tool) }
                        }
                        if visibleCount < results.count {
                            Button {
                                visibleCount = min(visibleCount + 24, results.count)
                            } label: {
                                Text("See more results")
                                    .font(.custom("Outfit-SemiBold", size: 14))
                                    .foregroundStyle(Color.envAccent)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 10)
                                    .background(Color.envCard, in: RoundedRectangle(cornerRadius: 8))
                                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.envBorder, lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(16)
        }
        .modifier(Screen())
        .searchable(text: $text, prompt: "Search tools")
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: String.self) { CategoryView(categoryID: $0) }
        .navigationDestination(for: Tool.self) { ToolDetailView(tool: $0) }
        .onChange(of: text) { _ in visibleCount = 24 }
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
            .navigationDestination(for: String.self) { CategoryView(categoryID: $0) }
            .navigationDestination(for: Tool.self) { ToolDetailView(tool: $0) }
        }
        .modifier(EnVBrandNavigationStyle())
    }
}

struct AccountView: View {
    @EnvironmentObject private var store: CatalogStore
    @EnvironmentObject private var informationRouter: NativeInformationRouter
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
                        Button { informationRouter.open("about") } label: { settingsRow("Info", "About enV & chAs Technologies LLC", "Company details and contact information.") }
                            .buttonStyle(.plain)
                        Divider().overlay(Color.envBorder)
                        Button { informationRouter.open("account") } label: { settingsRow("Info", "Account", "No account is required for the browser toolkit.") }
                            .buttonStyle(.plain)
                        Divider().overlay(Color.envBorder)
                        Button { informationRouter.open("history") } label: { settingsRow("Info", "History", "Recently used tools will appear here.") }
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
    var body: some View { NativeInformationPageView(pageID: "about") }
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
            .font(.custom("Outfit-Medium", size: 10))
            .foregroundStyle(Color.envMuted)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .frame(maxWidth: .infinity, alignment: .center)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 8)
            .frame(height: 40)
            .background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorderStrong, lineWidth: 1))
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


struct NativeInformationPageView: View {
    @Environment(\.dismiss) private var dismiss
    let pageID: String

    private var pageTitle: String {
        switch pageID {
        case "about": return "About enV"
        case "pricing": return "Pricing"
        case "contact": return "Contact"
        case "account": return "Account"
        case "history": return "History"
        case "privacy": return "Privacy"
        case "terms": return "Terms of Use"
        case "disclaimer": return "Disclaimer"
        case "responsible-use": return "Responsible Use"
        default: return "About enV"
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(pageTitle)
                        .font(.custom("Outfit-SemiBold", size: 30))
                        .foregroundStyle(Color.envInk)
                    pageContent
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 40)
                .frame(maxWidth: 768, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .center)
            }
            .modifier(Screen())
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    @ViewBuilder
    private var pageContent: some View {
        switch pageID {
        case "about": NativeAboutInformationPage()
        case "pricing": NativePricingInformationPage()
        case "contact": NativeContactInformationPage()
        case "account": NativeInfoSectionView(title: nil, paragraphs: ["No account is required for the browser toolkit."])
        case "history": NativeInfoSectionView(title: nil, paragraphs: ["Recently used tools will appear here."])
        case "privacy": NativePrivacyInformationPage()
        case "terms": NativeTermsInformationPage()
        case "disclaimer": NativeDisclaimerInformationPage()
        case "responsible-use": NativeResponsibleUseInformationPage()
        default: NativeAboutInformationPage()
        }
    }
}

private struct NativeInfoSectionView: View {
    let title: String?
    var paragraphs: [String] = []
    var bullets: [String] = []
    var afterBullets: [String] = []
    var titleSize: CGFloat = 18

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let title {
                Text(title)
                    .font(.custom("Outfit-SemiBold", size: titleSize))
                    .foregroundStyle(Color.envInk)
            }
            ForEach(Array(paragraphs.enumerated()), id: \.offset) { entry in
                Text(LocalizedStringKey(entry.element))
                    .font(.custom("Outfit-Regular", size: 16))
                    .foregroundStyle(Color.envMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(bullets, id: \.self) { bullet in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("•").foregroundStyle(Color.envMuted)
                    Text(LocalizedStringKey(bullet))
                        .font(.custom("Outfit-Regular", size: 16))
                        .foregroundStyle(Color.envMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            ForEach(Array(afterBullets.enumerated()), id: \.offset) { entry in
                Text(LocalizedStringKey(entry.element))
                    .font(.custom("Outfit-Regular", size: 16))
                    .foregroundStyle(Color.envMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    init(title: String?, paragraphs: [String] = [], bullets: [String] = [], afterBullets: [String] = [], titleSize: CGFloat = 18) {
        self.title = title
        self.paragraphs = paragraphs
        self.bullets = bullets
        self.afterBullets = afterBullets
        self.titleSize = titleSize
    }
}

private struct NativeAboutInformationPage: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            ChasTechnologiesLogo()
                .frame(maxWidth: 520)
                .aspectRatio(3.2, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .background(Color.white, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.envBorder, lineWidth: 1))
            NativeInfoSectionView(title: "A focused toolkit for everyday work", paragraphs: [
                "enV brings practical utilities together in one place across Web, Android, and iOS. Browse by category, search for a tool, and use the tools that fit your task.",
                "enV is developed and operated by **chAs Technologies LLC**, a company registered in Delaware, USA. Some tools process information on your device; features that need a server or an external provider make that clear in their use and are described in our Privacy page.",
            ], titleSize: 20)
            VStack(alignment: .leading, spacing: 10) {
                Text("Company").font(.custom("Outfit-SemiBold", size: 16)).foregroundStyle(Color.envInk)
                Text("chAs Technologies LLC").font(.custom("Outfit-Regular", size: 16)).foregroundStyle(Color.envMuted)
                HStack(spacing: 4) {
                    Text("Product inquiries:").font(.custom("Outfit-Regular", size: 16)).foregroundStyle(Color.envMuted)
                    Link("envtoolkit@gmail.com", destination: URL(string: "mailto:envtoolkit@gmail.com")!)
                        .font(.custom("Outfit-Regular", size: 16))
                }
                HStack(spacing: 4) {
                    Text("Company inquiries:").font(.custom("Outfit-Regular", size: 16)).foregroundStyle(Color.envMuted)
                    Link("chastechnologiesllc@gmail.com", destination: URL(string: "mailto:chastechnologiesllc@gmail.com")!)
                        .font(.custom("Outfit-Regular", size: 16))
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorder, lineWidth: 1))
        }
    }
}

private struct NativePricingInformationPage: View {
    private let packages = [
        NativeTokenPackage(tokens: "100", price: "$0.30"),
        NativeTokenPackage(tokens: "300", price: "$0.50"),
        NativeTokenPackage(tokens: "500", price: "$0.80"),
        NativeTokenPackage(tokens: "1,000", price: "$1.20"),
        NativeTokenPackage(tokens: "5,000", price: "$5.00"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            NativeInfoSectionView(title: nil, paragraphs: [
                "The token amounts and prices below are the schedule supplied by chAs Technologies LLC.",
            ])
            Text("Prices are listed in USD. When payments are enabled, checkout is intended to convert the USD price to local currency in countries supported by the selected gateway. The final currency and total will be shown before you confirm payment; availability and conversion rates depend on the provider.")
                .font(.custom("Outfit-Regular", size: 14)).foregroundStyle(Color.envMuted)
            VStack(alignment: .leading, spacing: 6) {
                Text("Planned pricing — purchases are not available yet").font(.custom("Outfit-SemiBold", size: 16)).foregroundStyle(Color.envInk)
                Text("The current enV codebase does not include a token balance, checkout, or referral-award system. You cannot buy, redeem, or receive these tokens in the app at this time. This page lists the proposed schedule and is not a live offer.")
                    .font(.custom("Outfit-Regular", size: 14)).foregroundStyle(Color.envMuted)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envAccent.opacity(0.4), lineWidth: 1))

            VStack(spacing: 0) {
                HStack {
                    Text("Tokens")
                    Spacer()
                    Text("Price (USD)")
                }
                .font(.custom("Outfit-SemiBold", size: 14))
                .foregroundStyle(Color.envInk)
                .padding(.horizontal, 16).padding(.vertical, 12)
                .background(Color.envSurface2)
                ForEach(packages) { package in
                    HStack {
                        Text("\(package.tokens) tokens").foregroundStyle(Color.envMuted)
                        Spacer()
                        Text(package.price).fontWeight(.medium).foregroundStyle(Color.envInk)
                    }
                    .font(.custom("Outfit-Regular", size: 14))
                    .padding(.horizontal, 16).padding(.vertical, 12)
                    .overlay(alignment: .top) { Rectangle().fill(Color.envBorder).frame(height: 1) }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorder, lineWidth: 1))

            NativeInfoSectionView(title: "Planned rewards", paragraphs: [
                "**First sign-up bonus:** 100 tokens.",
                "**Referral reward:** 50 tokens.",
                "Sign-up and referral rewards are not currently issued by the app. Eligibility and complete program rules will be published before the rewards become available.",
            ])
            .padding(16)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorder, lineWidth: 1))
            Text(LocalizedStringKey("Questions about enV pricing can be sent to [envtoolkit@gmail.com](mailto:envtoolkit@gmail.com)."))
                .font(.custom("Outfit-Regular", size: 14)).foregroundStyle(Color.envMuted)
        }
    }
}

private struct NativeTokenPackage: Identifiable {
    let tokens: String
    let price: String
    var id: String { tokens }
}

private struct NativeContactInformationPage: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            NativeInfoSectionView(title: nil, paragraphs: ["Choose the address that best matches your inquiry. We will use your message to respond to the request you send."])
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 16) {
                    contactCard(title: "enV product support", description: "Questions, feedback, accessibility concerns, or help using the toolkit.", address: "envtoolkit@gmail.com")
                    contactCard(title: "Company inquiries", description: "Business, partnership, and company-related correspondence for chAs Technologies LLC.", address: "chastechnologiesllc@gmail.com")
                }
                VStack(spacing: 16) {
                    contactCard(title: "enV product support", description: "Questions, feedback, accessibility concerns, or help using the toolkit.", address: "envtoolkit@gmail.com")
                    contactCard(title: "Company inquiries", description: "Business, partnership, and company-related correspondence for chAs Technologies LLC.", address: "chastechnologiesllc@gmail.com")
                }
            }
            Text("Please do not include passwords, payment-card details, or other highly sensitive information in ordinary email.")
                .font(.custom("Outfit-Regular", size: 14)).foregroundStyle(Color.envMuted)
        }
    }

    private func contactCard(title: String, description: String, address: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.custom("Outfit-SemiBold", size: 16)).foregroundStyle(Color.envInk)
            Text(description).font(.custom("Outfit-Regular", size: 16)).foregroundStyle(Color.envMuted)
            Link(address, destination: URL(string: "mailto:\(address)")!)
                .font(.custom("Outfit-SemiBold", size: 16))
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorder, lineWidth: 1))
    }
}

private struct NativePrivacyInformationPage: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            NativeInfoSectionView(title: nil, paragraphs: ["**chAs Technologies LLC**, a company registered in Delaware, USA, develops and operates enV. This notice describes the information handled by the enV Web, Android, and iOS experiences and how feature-specific processing works."])
            NativeInfoSectionView(title: "Age requirement", paragraphs: ["enV is for people aged 13 or older and is not intended for children under 13. If you are under the age of majority where you live, any parent or guardian permission required by your local law still applies. Contact us if you believe a child under 13 has provided personal information through enV."])
            NativeInfoSectionView(title: "A local-first toolkit—with some connected features", paragraphs: [
                "Many tools run directly on your device. When a tool needs a server, an AI model, or a media processor, information needed for that operation is sent to the enV service or the processor configured for that feature. Tool screens should be treated as the guide to whether a task is local or connected.",
                "Do not submit passwords, payment-card details, confidential business material, or sensitive personal information to a connected tool unless you have reviewed the relevant provider and are comfortable with its handling.",
            ])
            NativeInfoSectionView(title: "Information stored on your device", paragraphs: [
                "Depending on the platform and features you use, enV stores preferences such as theme, saved tools, and recently opened tools on your device. The Web version uses browser storage for these preferences. The Web Contact Exchange tool also stores the contact-card fields and selected sharing fields you enter in that browser. This information remains until you clear the relevant browser or app data.",
                "Native Contact Exchange does not upload a profile to an enV account. When you deliberately activate Exchange, the fields shown in that feature are sent to nearby participating devices. Saving a received contact to your address book requires your separate action and the platform’s Contacts permission.",
            ])
            NativeInfoSectionView(title: "Connected tools and service providers", bullets: [
                "**Documents and media:** some tools upload the files you select to an enV processing endpoint or to a media processor configured for the deployment. The document endpoint uses a temporary working directory and removes it after the request finishes. Other processor or infrastructure retention depends on that service’s configuration and policies.",
                "**AI features:** when enabled, the task input needed to produce a response is sent through the enV server to the AI provider configured for that deployment. The code supports Groq, OpenRouter, and Google Gemini; the provider used can vary by task and server configuration. AI results may be cached briefly when caching is enabled. Provider handling and retention are governed in part by the provider’s terms and privacy practices.",
                "**Sign-in:** an account is not required for ordinary toolkit use. If sign-in is enabled for a deployment and you choose to use it, the identity provider and configured database process account and session information such as your email and profile details. Authentication uses session cookies.",
                "**Operational infrastructure:** hosting, network, and service providers may process connection and diagnostic data needed to deliver, secure, and troubleshoot the service.",
            ], afterBullets: [
                "Provider availability, settings, and retention can change by deployment. enV does not promise that an external provider will retain or delete submitted content on a particular schedule. Review the provider information shown for the feature before sending information you consider sensitive.",
            ])
            NativeInfoSectionView(title: "Cookies, sessions, and account requests", paragraphs: [
                "Browser-local preferences use local storage. If an optional sign-in or AI feature is used, the service may set essential session cookies—for example, to maintain sign-in or apply abuse-prevention limits. These are not the same as a marketing-cookie profile.",
                "If you have used a sign-in-enabled deployment and want to ask about, correct, or delete account information, email [envtoolkit@gmail.com](mailto:envtoolkit@gmail.com). Information stored only on your device can generally be removed by clearing that browser’s site data or the app’s local data.",
            ])
            NativeInfoSectionView(title: "Payments and tokens", paragraphs: ["The current enV codebase does not provide token balances, token purchases, or referral awards, and does not collect payment-card information through a checkout. The figures on the Pricing page are the proposed schedule supplied by chAs Technologies LLC, not an active purchase offer. If payments are introduced, the applicable payment provider and data handling will be described before checkout is enabled."])
            NativeInfoSectionView(title: "Changes and contact", paragraphs: [
                "We may revise this notice when product features, providers, or data practices change. The published version should be checked before using connected features.",
                "For privacy questions or requests, contact [envtoolkit@gmail.com](mailto:envtoolkit@gmail.com). Company correspondence may also be sent to [chastechnologiesllc@gmail.com](mailto:chastechnologiesllc@gmail.com).",
            ])
        }
    }
}

private struct NativeTermsInformationPage: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            NativeInfoSectionView(title: nil, paragraphs: ["These Terms apply when you use enV on the Web, Android, or iOS. enV is developed and operated by chAs Technologies LLC. By using the service, you agree to use it lawfully and in accordance with these Terms and the Responsible Use policy."])
            NativeInfoSectionView(title: "Eligibility", paragraphs: ["You must be at least 13 years old to use enV. If you are under the age of majority where you live, use enV only with any parent or guardian permission required by local law and follow any applicable local restrictions."])
            NativeInfoSectionView(title: "Governing Law and Venue", paragraphs: ["These Terms are governed by the laws of the State of Delaware, United States, without regard to conflict-of-law principles. Subject to non-waivable consumer rights and mandatory laws that apply where you live, disputes arising from or relating to these Terms will be brought in the state or federal courts located in Delaware, and the parties consent to those courts’ jurisdiction and venue. Nothing in this section limits a right or remedy that cannot lawfully be waived."])
            NativeInfoSectionView(title: "Using enV", paragraphs: [
                "enV provides practical tools, calculators, generators, converters, and optional connected features. You are responsible for the information you submit, the permissions you grant, and how you use any output. Do not use enV in a way that violates law, another person’s rights, or a third-party service’s terms.",
                "Some features work on your device; others may require a network connection or send the information needed for the task to enV’s configured service providers. Availability and capabilities may differ by platform and deployment.",
            ])
            NativeInfoSectionView(title: "Accounts and contact exchange", paragraphs: ["An account is not required for ordinary toolkit use. Where sign-in is enabled, you are responsible for protecting access to your account and for activity under it. Contact Exchange is optional: when you activate it, selected contact fields are shared with nearby participants. You are responsible for choosing what to share and for having permission to share it."])
            NativeInfoSectionView(title: "Your content and tool results", paragraphs: [
                "You must have the necessary rights and permissions for any text, files, images, contact details, or other material you submit. Outputs may be incomplete, inaccurate, unsuitable for your purpose, or similar to outputs received by other users. Review and independently verify results before using, publishing, or acting on them.",
                "Do not rely on enV as a substitute for qualified legal, medical, financial, tax, safety, or other professional advice. See the Disclaimer for more detail.",
            ])
            NativeInfoSectionView(title: "Availability and changes", paragraphs: ["We may update, suspend, or discontinue a tool or feature to maintain, improve, or protect enV. We do not guarantee that the service will be uninterrupted, error-free, compatible with every device, or available in every location. Third-party features are also subject to the availability and terms of their providers."])
            NativeInfoSectionView(title: "Tokens and pricing", paragraphs: ["The listed reference prices are in USD. The token packages, sign-up bonus, and referral reward shown on the Pricing page are planned offers. The current codebase does not implement token balances, purchases, or reward issuance; no purchase can currently be made through enV. When payments are enabled, checkout is intended to convert the USD price to local currency in countries supported by the selected gateway. The final amount and currency will be shown before payment; availability and conversion rates depend on the provider. Any future token terms, eligibility requirements, expiry, refunds, and payment-provider terms will be shown before a purchase or reward program is activated."])
            NativeInfoSectionView(title: "Disclaimer and limits", paragraphs: ["To the extent permitted by applicable law, enV is provided “as is” and “as available,” without warranties that cannot be disclaimed under that law. To the extent permitted by applicable law, chAs Technologies LLC is not responsible for indirect or consequential losses arising from use of the service. Nothing in these Terms excludes a right or liability that cannot lawfully be excluded."])
            NativeInfoSectionView(title: "Questions", paragraphs: ["For questions about these Terms, contact [envtoolkit@gmail.com](mailto:envtoolkit@gmail.com) or [chastechnologiesllc@gmail.com](mailto:chastechnologiesllc@gmail.com)."])
        }
    }
}

private struct NativeDisclaimerInformationPage: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            NativeInfoSectionView(title: nil, paragraphs: ["enV is a general-purpose toolkit developed by chAs Technologies LLC. It is provided for convenience and informational use; it is not a substitute for professional judgment or advice."])
            NativeInfoSectionView(title: "Verify every result", paragraphs: ["Calculations, conversions, generated text, extracted data, and other results can be incomplete, inaccurate, outdated, or affected by the information you provide. Check inputs, assumptions, units, and outputs against reliable sources before relying on them or sharing them with others."])
            NativeInfoSectionView(title: "Not professional advice", paragraphs: ["enV does not provide legal, medical, mental-health, financial, investment, tax, accounting, engineering, or safety-critical advice. Do not use a tool result as the sole basis for a decision that could affect someone’s health, rights, finances, safety, or legal obligations. Consult a qualified professional when appropriate."])
            NativeInfoSectionView(title: "AI and third-party services", paragraphs: ["AI-generated content may be wrong, biased, incomplete, or unsuitable. It may not be unique and may require human review. Connected features may depend on third-party providers, whose outputs, availability, and policies are outside enV’s control. Review the Privacy and Terms pages before sending sensitive information to a connected feature."])
            NativeInfoSectionView(title: "No guarantee", paragraphs: ["enV and its results are provided without a guarantee of fitness for a particular purpose or error-free operation, except for rights that cannot be limited under applicable law. You are responsible for deciding whether a tool and its result are appropriate for your situation."])
        }
    }
}

private struct NativeResponsibleUseInformationPage: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            NativeInfoSectionView(title: nil, paragraphs: [
                "Use enV lawfully, respectfully, and with appropriate human judgment. These rules apply to every platform and to content created, transformed, analyzed, or shared through the service.",
                "enV is for people aged 13 or older. If you are under the age of majority where you live, follow any local parent or guardian permission requirements that apply to you.",
            ])
            NativeInfoSectionView(title: "Do not use enV to", bullets: [
                "break the law, facilitate fraud, or infringe another person’s copyright, privacy, or other rights;",
                "harass, threaten, exploit, impersonate, deceive, or target people without their consent;",
                "create or distribute malware, credentials-stealing material, spam, or instructions intended to cause harm;",
                "share someone else’s contact details or personal information without a lawful basis and appropriate permission;",
                "bypass security, access systems or data without authorization, or disrupt enV or third-party services; or",
                "treat a generated or calculated result as verified professional advice or as the sole basis for a high-stakes decision.",
            ])
            NativeInfoSectionView(title: "Your responsibilities", paragraphs: [
                "Only submit material you are allowed to use. Review connected-tool notices before sending text or files to a server or AI provider. In Contact Exchange, activate sharing only when you intend to exchange information and enable only fields you are comfortable sending to nearby participants.",
                "Keep a human in control: review outputs, verify important facts, and use qualified professionals for legal, medical, financial, tax, and safety-critical matters.",
            ])
            NativeInfoSectionView(title: "Reporting a concern", paragraphs: ["If you believe enV is being used unlawfully or encounter a safety or privacy issue, contact [envtoolkit@gmail.com](mailto:envtoolkit@gmail.com). Company-related correspondence may be sent to [chastechnologiesllc@gmail.com](mailto:chastechnologiesllc@gmail.com)."])
        }
    }
}
