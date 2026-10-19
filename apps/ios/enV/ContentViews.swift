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
    @State private var homePath = NavigationPath()
    @FocusState private var isHomeSearchFocused: Bool
    private var hasSearchText: Bool { !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var searchSuggestions: [Tool] { hasSearchText ? store.catalog.webSearch(searchText, limit: 8, includeRelatedReferences: true) : [] }
    private func openHomeSearch() {
        if let first = searchSuggestions.first { homePath.append(first) }
        else { onSearch(searchText.trimmingCharacters(in: .whitespacesAndNewlines)) }
    }
    private var homeTools: [Tool] {
        store.catalog.webSearch("", limit: Int.max, includeRelatedReferences: true)
            .filter { $0.status == "active" || $0.status == "beta" }
            .prefix(12)
            .map { $0 }
    }
    private var mostUsedTools: [Tool] {
        var seen = Set<String>()
        return Array(store.mostUsedIDs.compactMap { store.catalog.displayTool(for: $0) }.filter { seen.insert($0.id).inserted }.prefix(10))
    }

    var body: some View {
        NavigationStack(path: $homePath) {
            ScrollView {
                VStack(alignment: .leading, spacing: 40) {
                    VStack(alignment: .center, spacing: horizontalSizeClass == .regular ? 20 : 16) {
                        EnVLogo(homeHero: true).frame(width: horizontalSizeClass == .regular ? 163 : 142, height: horizontalSizeClass == .regular ? 64 : 56)
                        HStack(spacing: 16) {
                            EnVLogo().frame(width: 56, height: 36)
                            TextField(isHomeSearchFocused ? "" : "Search for a tool", text: $searchText)
                                .font(.envScaled(size: horizontalSizeClass == .regular ? 18 : 16, weight: .regular))
                                .multilineTextAlignment(.leading)
                                .focused($isHomeSearchFocused)
                                .accessibilityLabel("Search tools")
                                .submitLabel(.search)
                                .onSubmit { openHomeSearch() }
                            Button { openHomeSearch() } label: {
                                EnVIcon(name: "Search", size: 24, tint: .envAccent)
                                    .frame(width: 44, height: 44)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Search all tools")
                        }
                        .padding(.horizontal, horizontalSizeClass == .regular ? 20 : 16)
                        .frame(maxWidth: .infinity, minHeight: horizontalSizeClass == .regular ? 72 : 64, maxHeight: horizontalSizeClass == .regular ? 72 : 64, alignment: .leading)
                        .background(Color.envCard, in: Capsule())
                        .overlay(Capsule().stroke(isHomeSearchFocused ? Color.envAccent : Color.envBorderStrong, lineWidth: 1))
                        .shadow(color: Color.black.opacity(0.05), radius: 2, y: 1)
                        .overlay(alignment: .top) {
                            if isHomeSearchFocused && hasSearchText {
                            VStack(alignment: .leading, spacing: 10) {
                                if searchSuggestions.isEmpty {
                                    enVCharacterSpacedText("No matching tools. Try “json”, “bmi”, or “qr”.")
                                        .font(.envScaled(size: 14, weight: .regular))
                                        .foregroundStyle(Color.envMuted)
                                    HStack {
                                        Spacer()
                                        Button { onSearch(searchText) } label: {
                                            HStack(spacing: 6) {
                                                enVCharacterSpacedText("See more results")
                                                EnVIcon(name: "ArrowRight", size: 15, tint: .envAccent)
                                            }
                                            .font(.envScaled(size: 14, weight: .semibold))
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
                                                enVCharacterSpacedText("See more results")
                                                EnVIcon(name: "ArrowRight", size: 15, tint: .envAccent)
                                            }
                                            .font(.envScaled(size: 14, weight: .semibold))
                                            .foregroundStyle(Color.envAccent)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.envCard, in: RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.envBorder, lineWidth: 1))
                            .shadow(color: Color.black.opacity(0.12), radius: 8, y: 4)
                            .offset(y: horizontalSizeClass == .regular ? 80 : 72)
                            }
                        }
                        .zIndex(isHomeSearchFocused && hasSearchText ? 1 : 0)
                        GeometryReader { proxy in
                            HStack(spacing: horizontalSizeClass == .regular ? 12 : 8) {
                                HomePreviewBar(title: "AI assistant", action: onAssistant).frame(maxWidth: .infinity)
                                HomePreviewBar(title: "Total token = 100").frame(maxWidth: .infinity)
                            }
                            .frame(width: min(proxy.size.width * 0.84, 640), height: 40)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                        }
                        .frame(height: 40)
                        HomeMostUsedToolsTray(tools: mostUsedTools) { homePath.append($0) }
                        enVCharacterSpacedText("A focused toolkit for\neveryday work.")
                            .font(.envScaled(size: horizontalSizeClass == .regular ? 36 : 24, weight: .semibold))
                            .tracking(-0.4)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .multilineTextAlignment(.leading)
                            .foregroundStyle(Color.envInk)
                            .padding(.top, horizontalSizeClass == .regular ? 12 : 8)
                    }
                    .frame(maxWidth: 768)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.horizontal, 16)

                    VStack(alignment: .leading, spacing: 16) {
                        // Source guard contract: sectionHeader("Trending tools", subtitle: "Useful tools to explore today", accent: true)
                        enVCharacterSpacedText("Trending tools")
                            .font(.envScaled(size: 20, weight: .semibold))
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
                                    enVCharacterSpacedText("See more tools")
                                    EnVIcon(name: "ArrowRight", size: 15, tint: .envAccent)
                                }
                                .font(.envScaled(size: 14, weight: .semibold))
                                .foregroundStyle(Color.envAccent)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)
                    .frame(maxWidth: 1152)
                    .frame(maxWidth: .infinity)
                    WebHomeFooter(activeCount: store.catalog.browserActiveToolCount, categoryCount: store.catalog.categories.count, onInformation: onInformation, onTools: onTools)
                }
                .padding(.top, 4)
                .frame(maxWidth: .infinity)
            }
            .modifier(Screen())
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: String.self) { CategoryView(categoryID: $0) }
            .navigationDestination(for: Tool.self) { ToolDestinationView(tool: $0) }
            .modifier(EnVBrandNavigationStyle())
        }
        .id(homeNavigationReset)
        .onDisappear {
            searchText = ""
            isHomeSearchFocused = false
        }
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
    @State private var showProductionNotice = false
    let tool: Tool

    var body: some View {
        Group {
            if tool.isUnderProduction {
                Button { showProductionNotice = true } label: { cardLabel }
                    .accessibilityLabel("\(tool.name), under production")
            } else {
                NavigationLink(value: tool) { cardLabel }
                    .accessibilityLabel("Open \(tool.name)")
            }
        }
        .buttonStyle(.plain)
        .padding(16)
        .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorder.opacity(0.35), lineWidth: 1))
        .shadow(color: Color.black.opacity(0.05), radius: 2, y: 1)
        .opacity(tool.isPlanned || tool.isUnderProduction ? 0.82 : 1)
        .alert("Under production", isPresented: $showProductionNotice) {
            Button("Close", role: .cancel) { }
        } message: {
            Text("\(tool.name) is under production and is not available yet. You can keep browsing enV while it is being developed.")
        }
    }

    private var cardLabel: some View {
        VStack(alignment: .leading, spacing: 0) {
            iconTile(tool)
            enVCharacterSpacedText(tool.name).font(.envScaled(size: 14, weight: .semibold)).foregroundStyle(Color.envInk).padding(.top, 12)
            enVCharacterSpacedText(tool.description).font(.envScaled(size: 12, weight: .regular)).foregroundStyle(Color.envMuted).lineLimit(2).lineSpacing(2).padding(.top, 4)
            if tool.isUnderProduction {
                enVCharacterSpacedText("Under production").font(.envScaled(size: 10, weight: .medium)).foregroundStyle(Color.envSubtle).padding(.top, 10)
            } else if tool.isPlanned {
                enVCharacterSpacedText("Coming soon").font(.envScaled(size: 10, weight: .medium)).foregroundStyle(Color.envSubtle).padding(.top, 10)
            } else if NativeCopy.isWebRuntimeOnly(tool.id) {
                enVCharacterSpacedText("WEB ONLY").font(.envScaled(size: 10, weight: .medium)).tracking(0.5).foregroundStyle(Color.envSubtle).padding(.top, 10)
            } else if tool.clientSide {
                enVCharacterSpacedText("IN-BROWSER").font(.envScaled(size: 10, weight: .medium)).tracking(0.5).foregroundStyle(Color.envSubtle).padding(.top, 10)
            }
            HStack { Spacer(); EnVIcon(name: "ArrowRight", size: 16, tint: .primary) }.padding(.top, 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

private struct WebHomeSearchSuggestion: View {
    @State private var showProductionNotice = false
    let tool: Tool

    var body: some View {
        Group {
            if tool.isUnderProduction {
                Button { showProductionNotice = true } label: { suggestionLabel }
                    .accessibilityLabel("\(tool.name), under production")
            } else {
                NavigationLink(value: tool) { suggestionLabel }
                    .accessibilityLabel("Open \(tool.name)")
            }
        }
        .buttonStyle(.plain)
        .alert("Under production", isPresented: $showProductionNotice) {
            Button("Close", role: .cancel) { }
        } message: {
            Text("\(tool.name) is under production and is not available yet. You can keep browsing enV while it is being developed.")
        }
    }

    private var suggestionLabel: some View {
        HStack(spacing: 10) {
            EnVToolAppIcon(tool: tool, size: 32)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    enVCharacterSpacedText(tool.name).font(.envScaled(size: 14, weight: .medium)).foregroundStyle(Color.envInk).lineLimit(1)
                    if tool.isUnderProduction { enVCharacterSpacedText("Under production").font(.envScaled(size: 9, weight: .semibold)).foregroundStyle(Color.envSubtle) }
                    else if tool.isPlanned { enVCharacterSpacedText("Coming soon").font(.envScaled(size: 9, weight: .semibold)).foregroundStyle(Color.envSubtle) }
                    else if NativeCopy.isWebRuntimeOnly(tool.id) { enVCharacterSpacedText("Web only").font(.envScaled(size: 9, weight: .semibold)).foregroundStyle(Color.envSubtle) }
                }
                enVCharacterSpacedText(tool.description).font(.envScaled(size: 12, weight: .regular)).foregroundStyle(Color.envMuted).lineLimit(1)
            }
            Spacer(minLength: 4)
            EnVIcon(name: "ArrowRight", size: 16, tint: .envInk).accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16).padding(.vertical, 10)
    }
}

private struct WebHomeFooter: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    let activeCount: Int
    let categoryCount: Int
    let onInformation: (String) -> Void
    let onTools: () -> Void

    private var wideLayout: Bool { horizontalSizeClass == .regular }
    private var wideColumnUnit: CGFloat {
        max(0, (min(UIScreen.main.bounds.width, 1152) - 48 - 80) / 4)
    }

    var body: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Color.envBorder).frame(height: 1)
            Group {
                if wideLayout {
                    HStack(alignment: .top, spacing: 40) {
                        brandBlock.frame(width: wideColumnUnit * 2, alignment: .leading)
                        linkGroup("Product", links: [("About", "about"), ("Tools", "tools"), ("Pricing", "pricing"), ("Contact", "contact")]).frame(width: wideColumnUnit, alignment: .leading)
                        linkGroup("Legal", links: [("Privacy", "privacy"), ("Terms", "terms"), ("Disclaimer", "disclaimer"), ("Responsible use", "responsible-use")]).frame(width: wideColumnUnit, alignment: .leading)
                    }
                } else {
                    VStack(alignment: .leading, spacing: 40) {
                        brandBlock
                        linkGroup("Product", links: [("About", "about"), ("Tools", "tools"), ("Pricing", "pricing"), ("Contact", "contact")])
                        linkGroup("Legal", links: [("Privacy", "privacy"), ("Terms", "terms"), ("Disclaimer", "disclaimer"), ("Responsible use", "responsible-use")])
                    }
                }
            }
            .padding(.horizontal, wideLayout ? 24 : 16)
            .padding(.vertical, 48)
            .frame(maxWidth: 1152)
            .frame(maxWidth: .infinity)

            Rectangle().fill(Color.envBorder).frame(height: 1)
            HStack(spacing: 12) {
                enVCharacterSpacedText("© \(Calendar.current.component(.year, from: .now)) chAs Technologies LLC · enV")
                    .font(.envScaled(size: 12, weight: .regular))
                    .foregroundStyle(Color.envSubtle)
                Spacer(minLength: 12)
                if wideLayout {
                    enVCharacterSpacedText("\(categoryCount) categories · \(activeCount) live tools")
                        .font(.envScaled(size: 12, weight: .regular))
                        .foregroundStyle(Color.envSubtle)
                        .lineSpacing(4)
                }
            }
            .padding(.horizontal, wideLayout ? 24 : 16)
            .padding(.vertical, 16)
            .frame(maxWidth: 1152)
            .frame(maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.envSurface)
    }

    private var brandBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            EnVLogo().frame(width: 84, height: 56)
            enVCharacterSpacedText("Useful tools. One place. \(activeCount) browser tools you can use without an account. Files and text stay on your device unless a tool says otherwise.")
                .font(.envScaled(size: 14, weight: .regular))
                .foregroundStyle(Color.envMuted)
                .lineSpacing(4)
                .frame(maxWidth: 384, alignment: .leading)
        }
    }

    private func linkGroup(_ title: String, links: [(String, String)]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            enVCharacterSpacedText(title.uppercased())
                .font(.envScaled(size: 12, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(Color.envSubtle)
                .frame(height: 18, alignment: .leading)
            VStack(alignment: .leading, spacing: 8) {
                ForEach(links, id: \.0) { label, route in
                    Button(label) {
                        if route == "tools" { onTools() }
                        else { onInformation(route) }
                    }
                    .font(.envScaled(size: 14, weight: .regular))
                    .foregroundStyle(Color.envMuted)
                    .buttonStyle(.plain)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .frame(height: 21, alignment: .leading)
                }
            }
        }
    }
}

private struct HomeMostUsedToolsTray: View {
    let tools: [Tool]
    let onSelect: (Tool) -> Void

    var body: some View {
        GeometryReader { proxy in
            let visibleCount = proxy.size.width >= 768 ? 10 : 5
            let cellWidth = (proxy.size.width - 24 - 12 * CGFloat(visibleCount - 1)) / CGFloat(visibleCount)
            let iconSide = proxy.size.width >= 768 ? 44.0 : 40.0
            Group {
                if tools.isEmpty {
                    enVCharacterSpacedText("Open tools to build your personal shortcuts.")
                        .font(.envScaled(size: 10, weight: .regular))
                        .foregroundStyle(Color.envMuted)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 16)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(tools) { tool in
                                Button { onSelect(tool) } label: {
                                    VStack(spacing: 6) {
                                        EnVToolAppIcon(tool: tool, size: iconSide)
                                        enVCharacterSpacedText(tool.name)
                                            .font(.envScaled(size: 10, weight: .medium))
                                            .foregroundStyle(Color.envMuted)
                                            .lineLimit(1)
                                            .truncationMode(.tail)
                                            .frame(width: cellWidth)
                                    }
                                    .frame(width: cellWidth)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Open \(tool.name)")
                            }
                        }
                        .padding(.horizontal, 12)
                        .frame(height: 112)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(maxWidth: 768)
        .frame(maxWidth: .infinity)
        .frame(height: 112)
        .background(Color.envCard, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(Color.envBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .shadow(color: Color.black.opacity(0.04), radius: 3, y: 1)
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
    let onSearchNoMatch: () -> Void
    @State private var visibleByCategory: [String: Int] = [:]
    @State private var searchNavigationTool: Tool?
    @State private var showSearchNavigation = false
    @FocusState private var isToolsSearchFocused: Bool

    // Source guard contract: store.tools(matching: toolsQuery) is represented by the web-equivalent ranked search below.
    private var matchingTools: [Tool] { store.catalog.webSearch(toolsQuery, includeRelatedReferences: true) }
    private var searchSuggestions: [Tool] { toolsQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? [] : store.catalog.webSearch(toolsQuery, limit: 8, includeRelatedReferences: true) }
    private var searchFieldWidth: CGFloat { horizontalSizeClass == .regular ? 288 : min(288, max(160, UIScreen.main.bounds.width * 0.52)) }
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
                            enVCharacterSpacedText("All tools")
                                .font(.envScaled(size: 24, weight: .semibold))
                                .tracking(-0.4)
                                .foregroundStyle(Color.envInk)
                                .lineLimit(1)
                                .minimumScaleFactor(0.85)
                            Spacer(minLength: 4)
                            HStack(spacing: 10) {
                                EnVIcon(name: "Search", size: 20, tint: .envMuted)
                                TextField("Search tools", text: $toolsQuery)
                                    .font(.envScaled(size: 14, weight: .regular))
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    .accessibilityLabel("Search tools")
                                    .focused($isToolsSearchFocused)
                                    .submitLabel(.search)
                                    .onSubmit {
                                        guard !toolsQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, let first = matchingTools.first else {
                                            isToolsSearchFocused = false
                                            onSearchNoMatch()
                                            return
                                        }
                                        searchNavigationTool = first
                                        isToolsSearchFocused = false
                                        showSearchNavigation = true
                                    }
                                    .onChange(of: toolsQuery) { _ in visibleByCategory.removeAll() }
                            }
                            .padding(.horizontal, 16)
                            .frame(width: searchFieldWidth, height: 44)
                            .background(Color.envCard, in: RoundedRectangle(cornerRadius: 22))
                            .overlay(RoundedRectangle(cornerRadius: 22).stroke(Color.envBorderStrong, lineWidth: 1))
                            .shadow(color: Color.black.opacity(0.05), radius: 2, y: 1)
                        }
                        if isToolsSearchFocused && !toolsQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            HStack {
                                Spacer(minLength: 0)
                                VStack(alignment: .leading, spacing: 4) {
                                    if searchSuggestions.isEmpty {
                                        enVCharacterSpacedText("No matching tools. Try “json”, “bmi”, or “qr”.")
                                            .font(.envScaled(size: 14, weight: .regular))
                                            .foregroundStyle(Color.envMuted)
                                            .padding(12)
                                    } else {
                                        ForEach(searchSuggestions) { tool in
                                            Button {
                                                searchNavigationTool = tool
                                                isToolsSearchFocused = false
                                                showSearchNavigation = true
                                            } label: {
                                                VStack(alignment: .leading, spacing: 2) {
                                                    HStack(spacing: 8) {
                                                        enVCharacterSpacedText(tool.name).font(.envScaled(size: 14, weight: .medium)).foregroundStyle(Color.envInk)
                                                        if tool.isPlanned { enVCharacterSpacedText("Coming soon").font(.envScaled(size: 9, weight: .semibold)).foregroundStyle(Color.envSubtle) }
                                                        else if NativeCopy.isWebRuntimeOnly(tool.id) { enVCharacterSpacedText("Web only").font(.envScaled(size: 9, weight: .semibold)).foregroundStyle(Color.envSubtle) }
                                                    }
                                                    enVCharacterSpacedText(tool.description).font(.envScaled(size: 12, weight: .regular)).foregroundStyle(Color.envMuted).lineLimit(1)
                                                }
                                                .frame(maxWidth: .infinity, alignment: .leading)
                                                .padding(.horizontal, 12)
                                                .padding(.vertical, 8)
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                    HStack {
                                        Spacer()
                                        Button("See more results") { isToolsSearchFocused = false; onSearchNoMatch() }
                                            .font(.envScaled(size: 14, weight: .semibold))
                                            .foregroundStyle(Color.envAccent)
                                    }
                                    .padding(.horizontal, 12)
                                    .padding(.bottom, 8)
                                }
                                .frame(width: searchFieldWidth)
                                .background(Color.envCard, in: RoundedRectangle(cornerRadius: 14))
                                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.envBorder, lineWidth: 1))
                                .shadow(color: Color.black.opacity(0.06), radius: 4, y: 2)
                                .accessibilityElement(children: .contain)
                                .accessibilityLabel("Search suggestions")
                            }
                        }
                        enVCharacterSpacedText("Find a tool by name or browse the categories below.")
                            .font(.envScaled(size: 16, weight: .regular))
                            .foregroundStyle(Color.envMuted)
                    }
                    if categoryGroups.isEmpty {
                        EmptyStateView(title: "No tools match your search", lucideIcon: "Search", message: "Try another name or keyword.")
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
                                            enVCharacterSpacedText(group.category.name)
                                                .font(.envScaled(size: 18, weight: .bold))
                                                .foregroundStyle(Color.envAccent)
                                            enVCharacterSpacedText(group.category.blurb)
                                                .font(.envScaled(size: 12, weight: .regular))
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
                                                enVCharacterSpacedText("See more tools")
                                                EnVIcon(name: "ChevronDown", size: 16, tint: .envAccent)
                                            }
                                            .font(.envScaled(size: 14, weight: .semibold))
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
            .navigationDestination(for: Tool.self) { ToolDestinationView(tool: $0) }
            .modifier(EnVBrandNavigationStyle())
        }
        .id(toolsNavigationReset)
        .navigationDestination(isPresented: $showSearchNavigation) {
            if let searchNavigationTool { ToolDestinationView(tool: searchNavigationTool) }
        }
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
                            enVCharacterSpacedText(category.name)
                                .font(.envScaled(size: 30, weight: .bold))
                                .foregroundStyle(Color.envAccent)
                            enVCharacterSpacedText(category.description)
                                .font(.envScaled(size: 14, weight: .regular))
                                .foregroundStyle(Color.envMuted)
                        }
                    }
                }
                if categoryTools.isEmpty {
                    enVCharacterSpacedText("No tools in this category yet.")
                        .font(.envScaled(size: 14, weight: .regular))
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
                                enVCharacterSpacedText("See more tools")
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
        .navigationDestination(for: Tool.self) { ToolDestinationView(tool: $0) }
    }
}

struct SearchView: View {
    @Binding var query: String

    var body: some View {
        NavigationStack {
            SearchResultsView(text: $query)
                .modifier(EnVBrandNavigationStyle())
        }
    }
}

struct SearchResultsView: View {
    @EnvironmentObject private var store: CatalogStore
    @Binding var text: String
    @State private var visibleCount = 24
    @State private var searchNavigationTool: Tool?
    @State private var showSearchNavigation = false
    @FocusState private var isSearchFocused: Bool

    private var results: [Tool] { store.catalog.webSearch(text, limit: Int.max, includeRelatedReferences: true) }
    private var suggestions: [Tool] { text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? [] : store.catalog.webSearch(text, limit: 8, includeRelatedReferences: true) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    enVCharacterSpacedText("Search tools")
                        .font(.envScaled(size: 20, weight: .semibold))
                        .foregroundStyle(Color.envInk)
                    enVCharacterSpacedText("Find a tool by name, category, or keyword.")
                        .font(.envScaled(size: 14, weight: .regular))
                        .foregroundStyle(Color.envMuted)
                }
                HStack(spacing: 10) {
                    EnVIcon(name: "Search", size: 20, tint: .envMuted)
                    TextField("Search tools", text: $text, prompt: Text("Search tools").foregroundColor(Color.envInk))
                        .font(.envScaled(size: 16, weight: .regular))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityLabel("Search tools")
                        .focused($isSearchFocused)
                        .submitLabel(.search)
                        .onSubmit {
                            if let first = suggestions.first {
                                searchNavigationTool = first
                                showSearchNavigation = true
                            }
                        }
                    Button {
                        if let first = suggestions.first {
                            searchNavigationTool = first
                            showSearchNavigation = true
                        }
                    } label: { EnVIcon(name: "ArrowRight", size: 20, tint: .envAccent) }
                        .accessibilityLabel("Open first matching tool")
                        .disabled(suggestions.isEmpty)
                }
                .padding(.horizontal, 16)
                .frame(height: 56)
                .background(Color.envCard, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.envBorderStrong, lineWidth: 1))
                .overlay(alignment: .top) {
                    if isSearchFocused && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        if suggestions.isEmpty {
                            enVCharacterSpacedText("No matching tools. Try “json”, “bmi”, or “qr”.")
                                .font(.envScaled(size: 14, weight: .regular))
                                .foregroundStyle(Color.envMuted)
                                .padding(12)
                        } else {
                            ForEach(suggestions) { tool in WebHomeSearchSuggestion(tool: tool) }
                        }
                        HStack {
                            Spacer()
                            Button("See more results") { isSearchFocused = false }
                                .font(.envScaled(size: 14, weight: .semibold))
                                .foregroundStyle(Color.envAccent)
                        }
                        .padding(.horizontal, 12)
                        .padding(.bottom, 8)
                    }
                    .background(Color.envCard, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.envBorder, lineWidth: 1))
                    .shadow(color: Color.black.opacity(0.12), radius: 8, y: 4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .offset(y: 64)
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel("Search suggestions")
                    }
                }
                .zIndex(isSearchFocused && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 1 : 0)
                if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    enVCharacterSpacedText("Start typing to see matching tools.")
                        .font(.envScaled(size: 14, weight: .regular))
                        .foregroundStyle(Color.envMuted)
                        .padding(.top, 16)
                } else {
                    VStack(alignment: .leading, spacing: 3) {
                        enVCharacterSpacedText("Results for “\(text)”")
                            .font(.envScaled(size: 20, weight: .semibold))
                            .foregroundStyle(Color.envInk)
                        enVCharacterSpacedText("\(results.count) matching tools")
                            .font(.envScaled(size: 14, weight: .regular))
                            .foregroundStyle(Color.envMuted)
                    }
                    if results.isEmpty {
                        enVCharacterSpacedText("No matching tools. Try a broader word such as “image”, “video”, or “calculator”.")
                            .font(.envScaled(size: 14, weight: .regular))
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
                                enVCharacterSpacedText("See more results")
                                    .font(.envScaled(size: 14, weight: .semibold))
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
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $showSearchNavigation) {
            if let searchNavigationTool { ToolDestinationView(tool: searchNavigationTool) }
        }
        .navigationDestination(for: String.self) { CategoryView(categoryID: $0) }
        .navigationDestination(for: Tool.self) { ToolDestinationView(tool: $0) }
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
            .navigationDestination(for: Tool.self) { ToolDestinationView(tool: $0) }
            .modifier(EnVBrandNavigationStyle())
        }
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
                    enVCharacterSpacedText("Your enV")
                        .font(.envScaled(size: 28, weight: .semibold))
                        .foregroundStyle(Color.envInk)
                    VStack(alignment: .leading, spacing: 12) {
                        settingsRow("CircleCheck", "Offline catalog", "The complete tool catalog is bundled on this device.")
                        enVCharacterSpacedText("\(NativeCoverage.localActiveToolCount(in: store.catalog)) of \(NativeCoverage.canonicalActiveToolCount(in: store.catalog)) active tools currently execute locally using the native engine families. URL media inspection still requires its remote service.")
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
            .modifier(EnVBrandNavigationStyle())
        }
    }
}

struct CompanyInformationView: View {
    var body: some View { NativeInformationPageView(pageID: "about") }
}

private func sectionHeader(_ title: String, subtitle: String, accent: Bool = false) -> some View {
    VStack(alignment: .leading, spacing: 3) {
        enVCharacterSpacedText(title).font(.title2.weight(.semibold)).foregroundStyle(accent ? Color.envAccent : Color.envInk)
        enVCharacterSpacedText(subtitle).font(.subheadline).foregroundStyle(Color.envMuted)
    }
}

private struct HomePreviewBar: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    let title: String
    var action: (() -> Void)? = nil

    private var isWide: Bool { horizontalSizeClass == .regular }

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
        enVCharacterSpacedText(title)
            .font(.envScaled(size: isWide ? 14 : 10, weight: .medium))
            .foregroundStyle(Color.envMuted)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .frame(maxWidth: .infinity, alignment: .center)
            .multilineTextAlignment(.center)
            .padding(.horizontal, isWide ? 16 : 8)
            .frame(height: 40)
            .background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.envBorderStrong, lineWidth: 1))
    }
}

func iconTile(_ tool: Tool) -> some View {
    EnVToolAppIcon(tool: tool, size: 42)
}

private func settingsRow(_ icon: String, _ title: String, _ detail: String) -> some View {
    HStack(alignment: .top, spacing: 12) {
        EnVIcon(name: icon, size: 18, tint: .envAccent).padding(.top, 2)
        VStack(alignment: .leading, spacing: 3) {
            enVCharacterSpacedText(title).font(.subheadline.weight(.semibold)).foregroundStyle(Color.envInk)
            enVCharacterSpacedText(detail).font(.footnote).foregroundStyle(Color.envMuted)
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
            enVCharacterSpacedText(title).font(.title3.weight(.semibold)).foregroundStyle(Color.envInk)
            enVCharacterSpacedText(message).multilineTextAlignment(.center).foregroundStyle(Color.envMuted)
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
                    enVCharacterSpacedText(pageTitle)
                        .font(.envScaled(size: 30, weight: .semibold))
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
        case "account": VStack(alignment: .leading, spacing: 14) {
            NativeInfoSectionView(title: "Connect your enV wallet", paragraphs: ["Pair this native app through the signed-in enV web wallet. The single-use code expires quickly and is entered only on the device you control.", "Ordinary local tools remain usable without an account or wallet. Offline token spending is paused unless the server explicitly enables isolated test mode; production use requires verified native integrity checks."])
            NativeOfflineWalletPairingPanel()
        }
        case "history": NativeInfoSectionView(title: nil, paragraphs: ["Recently used tools will appear here."])
        case "privacy": NativePrivacyInformationPage()
        case "terms": NativeTermsInformationPage()
        case "disclaimer": NativeDisclaimerInformationPage()
        case "responsible-use": NativeResponsibleUseInformationPage()
        default: NativeAboutInformationPage()
        }
    }
}

private struct NativeOfflineWalletPairingPanel: View {
    @State private var code = ""
    @State private var enabled = false
    @State private var availabilityCode = ""
    @State private var availabilityMessage = "Checking offline-wallet availability…"
    @State private var paired = OfflineWalletNativeAPI.isPaired
    @State private var busy = false
    @State private var showFinalizeConfirmation = false
    @State private var feedback = ""
    @State private var journal: OfflineWalletJournal? = try? OfflineWalletJournal()
    @State private var allowanceID: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            enVCharacterSpacedText("Offline token wallet").font(.headline.weight(.semibold)).foregroundStyle(Color.envInk)
            enVCharacterSpacedText(availabilityMessage).font(.footnote).foregroundStyle(Color.envMuted).fixedSize(horizontal: false, vertical: true)
            if !enabled {
                enVCharacterSpacedText("Offline token spending is paused in this preview. Local tools remain available; no allowance is issued or deducted.")
                    .font(.footnote).foregroundStyle(Color.envMuted).fixedSize(horizontal: false, vertical: true)
            } else {
                enVCharacterSpacedText(paired ? "This device has a securely stored paired session." : "Open enV Web → Wallet → Offline token allowance → Generate one-time code.")
                    .font(.footnote).foregroundStyle(Color.envMuted).fixedSize(horizontal: false, vertical: true)
                TextField("One-time pairing code", text: $code)
                    .textInputAutocapitalization(.never).autocorrectionDisabled().textFieldStyle(.roundedBorder)
                    .disabled(busy || paired)
                Button {
                    Task { @MainActor in
                        busy = true; defer { busy = false }
                        do {
                            try await OfflineWalletNativeAPI.pair(code: code)
                            code = ""; paired = true
                            feedback = "This iOS device is paired. Reserve an offline allowance below to opt in to eligible calculator metering."
                        } catch { feedback = error.localizedDescription }
                    }
                } label: {
                    Label(busy ? "Connecting…" : "Pair this iOS device", systemImage: "iphone")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.borderedProminent).disabled(!enabled || busy || paired || code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                if paired {
                    enVCharacterSpacedText("The device signing key remains in this device's Keychain. Clearing app data or losing the device can make unsynchronized records unavailable.")
                        .font(.footnote).foregroundStyle(Color.envMuted).fixedSize(horizontal: false, vertical: true)
                    Button {
                        Task { @MainActor in
                            busy = true; defer { busy = false }
                            do {
                                guard let journal else { throw OfflineWalletNativeAPIErrorForUI.message("The local offline journal is unavailable.") }
                                allowanceID = try await OfflineWalletNativeAPI.reserveAllowance(journal: journal)
                                feedback = "Five tokens are reserved for eligible local calculator operations on this device."
                            } catch { feedback = error.localizedDescription }
                        }
                    } label: { Label("Reserve 5 tokens for this device", systemImage: "wallet.pass") .frame(maxWidth: .infinity, alignment: .leading) }
                        .buttonStyle(.bordered).disabled(!paired || busy || allowanceID != nil)

                    if let allowanceID {
                        enVCharacterSpacedText("An offline allowance is active on this device.").font(.footnote).foregroundStyle(Color.envMuted)
                        Button {
                            Task { @MainActor in
                                busy = true; defer { busy = false }
                                do {
                                    guard let journal else { throw OfflineWalletNativeAPIErrorForUI.message("The local offline journal is unavailable.") }
                                    feedback = try await OfflineWalletNativeAPI.synchronize(journal: journal, allowanceID: allowanceID)
                                } catch { feedback = error.localizedDescription }
                            }
                        } label: { Label("Synchronize pending calculator records", systemImage: "arrow.triangle.2.circlepath") .frame(maxWidth: .infinity, alignment: .leading) }
                            .buttonStyle(.bordered).disabled(busy || ((try? journal?.pendingTransactionCount(allowanceID: allowanceID)) ?? 0) < 1)
                        if availabilityCode == "LOCAL_TEST_ONLY" {
                            Button { showFinalizeConfirmation = true } label: {
                                Label("Finalize local-test allowance", systemImage: "checkmark.shield")
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .buttonStyle(.bordered)
                            .disabled(busy)
                        }
                    }
                }
            }
            if !feedback.isEmpty {
                enVCharacterSpacedText(feedback).font(.footnote).foregroundStyle(Color.envMuted).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .background(Color.envCard, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.envBorder, lineWidth: 1))
        .confirmationDialog("Finalize local-test allowance?", isPresented: $showFinalizeConfirmation, titleVisibility: .visible) {
            Button("Finalize test allowance", role: .destructive) {
                guard let allowanceID else { return }
                Task { @MainActor in
                    busy = true; defer { busy = false }
                    do {
                        guard let journal else { throw OfflineWalletNativeAPIErrorForUI.message("The local offline journal is unavailable.") }
                        feedback = try await OfflineWalletNativeAPI.synchronize(journal: journal, allowanceID: allowanceID, finalize: true)
                        self.allowanceID = try journal.activeAllowanceID()
                    } catch { feedback = error.localizedDescription }
                }
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("This settles only an isolated in-memory local-test allowance. Production finalization stays disabled until independent device-integrity proof is verified server-side.")
        }
        .task {
            let state = await OfflineWalletNativeAPI.checkAvailability()
            enabled = state.enabled
            availabilityCode = state.code
            availabilityMessage = state.message
            paired = OfflineWalletNativeAPI.isPaired
            if let journal { allowanceID = try? journal.activeAllowanceID() }
        }
    }
}

private enum OfflineWalletNativeAPIErrorForUI: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { return text }; return "Offline wallet unavailable." }
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
                enVCharacterSpacedText(title)
                    .font(.envScaled(size: titleSize, weight: .semibold))
                    .foregroundStyle(Color.envInk)
            }
            ForEach(Array(paragraphs.enumerated()), id: \.offset) { entry in
                enVLocalizedCharacterSpacedText(LocalizedStringKey(entry.element))
                    .font(.envScaled(size: 16, weight: .regular))
                    .foregroundStyle(Color.envMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(bullets, id: \.self) { bullet in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    enVCharacterSpacedText("•").foregroundStyle(Color.envMuted)
                    enVLocalizedCharacterSpacedText(LocalizedStringKey(bullet))
                        .font(.envScaled(size: 16, weight: .regular))
                        .foregroundStyle(Color.envMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            ForEach(Array(afterBullets.enumerated()), id: \.offset) { entry in
                enVLocalizedCharacterSpacedText(LocalizedStringKey(entry.element))
                    .font(.envScaled(size: 16, weight: .regular))
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
                enVCharacterSpacedText("Company").font(.envScaled(size: 16, weight: .semibold)).foregroundStyle(Color.envInk)
                enVCharacterSpacedText("chAs Technologies LLC").font(.envScaled(size: 16, weight: .regular)).foregroundStyle(Color.envMuted)
                HStack(spacing: 4) {
                    enVCharacterSpacedText("Product inquiries:").font(.envScaled(size: 16, weight: .regular)).foregroundStyle(Color.envMuted)
                    Link("envtoolkit@gmail.com", destination: URL(string: "mailto:envtoolkit@gmail.com")!)
                        .font(.envScaled(size: 16, weight: .regular))
                }
                HStack(spacing: 4) {
                    enVCharacterSpacedText("Company inquiries:").font(.envScaled(size: 16, weight: .regular)).foregroundStyle(Color.envMuted)
                    Link("chastechnologiesllc@gmail.com", destination: URL(string: "mailto:chastechnologiesllc@gmail.com")!)
                        .font(.envScaled(size: 16, weight: .regular))
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
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 10) {
                Label("No advertising", systemImage: "checkmark.shield")
                    .font(.envScaled(size: 17, weight: .semibold)).foregroundStyle(Color.envInk)
                enVCharacterSpacedText("enV is moving toward one transparent token wallet for tools and AI-agent work. Lightweight operations are intended to use fractions of a token; intensive cloud and AI operations will be priced from measured usage and shown before execution.")
                    .font(.envScaled(size: 14, weight: .regular)).foregroundStyle(Color.envMuted)
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.envBorder, lineWidth: 1))

            VStack(alignment: .leading, spacing: 8) {
                enVCharacterSpacedText("Proposed reference value").font(.envScaled(size: 15, weight: .medium)).foregroundStyle(Color.envMuted)
                enVCharacterSpacedText("100 tokens ≈ $1.00 USD").font(.envScaled(size: 25, weight: .semibold)).foregroundStyle(Color.envInk)
                enVCharacterSpacedText("One token represents one US cent at the reference rate. The ledger stores integer milli-tokens so a lightweight operation can use 0.1 token without floating-point rounding errors.")
                    .font(.envScaled(size: 14, weight: .regular)).foregroundStyle(Color.envMuted)
                enVCharacterSpacedText("Prices are listed in USD for reference. Before any future purchase, the final currency and total will be shown.")
                    .font(.envScaled(size: 14, weight: .regular)).foregroundStyle(Color.envMuted)
                enVCharacterSpacedText("Illustrative value only — not an active offer or store price.")
                    .font(.envScaled(size: 12, weight: .regular)).foregroundStyle(Color.envMuted)
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.envSurface, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.envBorder, lineWidth: 1))

            NativeInfoSectionView(title: "How usage is intended to work", paragraphs: [
                "Local utilities: very small token charges for lightweight calculations, text tools and conversions. Ten basic calculator operations are a draft target for one token, subject to the tool-by-tool cost and pricing audit.",
                "Cloud and media tools: the quote will account for factors such as file size, pages, duration, resolution, provider cost and processing requirements.",
                "AI and the agent: the agent should estimate a task, reserve an approved budget, meter every underlying tool and model call, then release unused reserved tokens. It must pause for approval before exceeding the user's limit.",
                "Premium: frontier models and large workflows may require premium access, while their actual execution still consumes tokens."
            ])
            NativeInfoSectionView(title: "Offline usage and recovery", paragraphs: [
                "Offline token spending is paused in this preview while independent app-integrity verification and production review are completed. Local tools can still work offline without token deductions where the tool supports it.",
                "When offline allowances are enabled in a future release, enV will reserve a bounded amount before disconnection, record eligible operations locally, and reconcile them with the shared server wallet after reconnecting.",
                "Clearing app data or reinstalling before synchronization can destroy unsubmitted usage records. enV cannot reconstruct exact usage it never received, so unresolved reservations will not be automatically refunded. Report missing records through the wallet recovery flow or contact support."
            ])
            NativeInfoSectionView(title: "One wallet, no monthly reset", paragraphs: [
                "The intended token ledger is shared across Web, Android and iOS, with platform-specific purchase verification and an auditable transaction history.",
                "Purchased tokens are intended not to expire. Final terms and available purchase amounts must comply with local law, provider rules and the applicable store's requirements.",
                "Minimum top-ups and supported payment methods vary by platform, country, currency and provider. Carrier billing, prepaid vouchers and enV gift cards are future integrations, not currently available payment options."
            ])
            VStack(alignment: .leading, spacing: 7) {
                enVCharacterSpacedText("Monetization foundation in progress").font(.envScaled(size: 16, weight: .semibold)).foregroundStyle(Color.envInk)
                enVCharacterSpacedText("The shared token rules, pricing-preview API and persistent ledger schema are included in this preview build. Authentication, provider adapters, store products and verified payment callbacks must be configured before real purchases or automatic charging can begin. This screen is informational; no payment will be taken here.")
                    .font(.envScaled(size: 14, weight: .regular)).foregroundStyle(Color.envMuted)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorder, lineWidth: 1))
            enVLocalizedCharacterSpacedText(LocalizedStringKey("Questions about enV pricing can be sent to [envtoolkit@gmail.com](mailto:envtoolkit@gmail.com)."))
                .font(.envScaled(size: 14, weight: .regular)).foregroundStyle(Color.envMuted)
        }
    }
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
            enVCharacterSpacedText("Please do not include passwords, payment-card details, or other highly sensitive information in ordinary email.")
                .font(.envScaled(size: 14, weight: .regular)).foregroundStyle(Color.envMuted)
        }
    }

    private func contactCard(title: String, description: String, address: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            enVCharacterSpacedText(title).font(.envScaled(size: 16, weight: .semibold)).foregroundStyle(Color.envInk)
            enVCharacterSpacedText(description).font(.envScaled(size: 16, weight: .regular)).foregroundStyle(Color.envMuted)
            Link(address, destination: URL(string: "mailto:\(address)")!)
                .font(.envScaled(size: 16, weight: .semibold))
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
                "Depending on the platform and features you use, enV stores preferences such as theme, saved tools, recently opened tools, and per-tool usage counts for personal shortcuts on your device. The Web version uses browser storage for these preferences. The Web Contact Exchange tool also stores the contact-card fields and selected sharing fields you enter in that browser. This information remains until you clear the relevant browser or app data.",
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
            NativeInfoSectionView(title: "Payments and tokens", paragraphs: ["The enV monetization foundation includes a planned token ledger and pricing preview, but no real payment provider, store purchase adapter or checkout is active in this release. The pricing screen presents reference values only. enV does not collect payment-card details directly through the toolkit. Before launch, the chosen providers, payment data handling, token terms, refunds and purchase verification processes will be documented. No payment is taken and no purchased tokens are issued in this build."])
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
            NativeInfoSectionView(title: "Tokens and pricing", paragraphs: ["The Pricing page shows a proposed USD reference value of 100 tokens per $1.00; it is not an active offer or a guaranteed local price. The intended ledger supports fractional-token usage for lightweight operations and measured usage for cloud, AI and agent workflows. Purchased tokens are intended not to expire, subject to applicable law and platform rules. Actual store price points, minimum top-ups, supported payment methods, taxes and local currencies will be shown before a purchase. No real purchases, balances or promotional rewards are active in this release."])
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
