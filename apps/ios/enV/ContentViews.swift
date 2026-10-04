import SwiftUI

struct Screen: ViewModifier {
    func body(content: Content) -> some View { content.scrollContentBackground(.hidden).background(Color.envSurface.ignoresSafeArea()) }
}

struct HomeView: View {
    @EnvironmentObject private var store: CatalogStore
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 7) { Text("enV").font(.largeTitle.bold()); Text("Browse all tools offline. 89 local tools run across text, code, color, date & time, and MIME.").font(.title3).foregroundStyle(.secondary) }
                    NavigationLink(value: "search") { HStack { Image(systemName: "magnifyingglass"); Text("Search 10,001 tools"); Spacer(); Image(systemName: "arrow.right") }.foregroundStyle(.secondary).padding(16).background(.background, in: RoundedRectangle(cornerRadius: 16)) }.buttonStyle(.plain)
                    sectionHeader("Featured", subtitle: "Hand-picked starting points")
                    ToolList(tools: Array(store.featuredTools.prefix(5)))
                    sectionHeader("Popular", subtitle: "Most discovered across the catalog")
                    ToolList(tools: Array(store.popularTools.prefix(6)))
                    sectionHeader("Categories", subtitle: "Browse by what you need")
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), spacing: 12)], spacing: 12) { ForEach(store.categories) { category in NavigationLink(value: category.id) { VStack(alignment: .leading, spacing: 8) { Image(systemName: iconName(for: category.icon)).foregroundStyle(Color.envTeal); Text(category.name).font(.headline); Text(category.blurb).font(.caption).foregroundStyle(.secondary).lineLimit(2) }.frame(maxWidth: .infinity, alignment: .leading).padding(14).background(.background, in: RoundedRectangle(cornerRadius: 16)) }.buttonStyle(.plain) } }
                }.padding()
            }
            .modifier(Screen()).navigationTitle("Home").navigationDestination(for: Tool.self) { ToolDetailView(tool: $0) }.navigationDestination(for: String.self) { value in if value == "search" { SearchResultsView() } else { CategoryView(categoryID: value) } }
        }
    }
}

struct ToolsView: View {
    @EnvironmentObject private var store: CatalogStore
    var body: some View {
        NavigationStack { List { Section("Categories") { ForEach(store.categories) { category in NavigationLink(value: category.id) { Label(category.name, systemImage: iconName(for: category.icon)).accessibilityLabel("Browse \(category.name)") } } } }.navigationTitle("Tools").navigationDestination(for: String.self) { CategoryView(categoryID: $0) }.navigationDestination(for: Tool.self) { ToolDetailView(tool: $0) }.modifier(Screen()) }
    }
}

struct CategoryView: View {
    @EnvironmentObject private var store: CatalogStore
    let categoryID: String
    var body: some View { ScrollView { VStack(alignment: .leading, spacing: 14) { if let category = store.category(named: categoryID) { Text(category.description).foregroundStyle(.secondary).padding(.horizontal) }; ToolList(tools: store.tools(category: categoryID)).padding(.horizontal) }.padding(.vertical) }.navigationTitle(store.category(named: categoryID)?.name ?? "Category").navigationDestination(for: Tool.self) { ToolDetailView(tool: $0) } }
}

struct SearchView: View {
    var body: some View { NavigationStack { SearchResultsView() } }
}

struct SearchResultsView: View {
    @EnvironmentObject private var store: CatalogStore
    @State private var text = ""
    @State private var category: String?
    var results: [Tool] { store.tools(matching: text, category: category) }
    var body: some View { VStack(spacing: 0) { Picker("Category", selection: $category) { Text("All categories").tag(String?.none); ForEach(store.categories) { Text($0.name).tag(Optional($0.id)) } }.pickerStyle(.menu).padding(.horizontal); if results.isEmpty { EmptyStateView(title: "No tools found", systemImage: "magnifyingglass", message: "Try another name, keyword, tag, or category.") } else { ScrollView { ToolList(tools: results).padding() } } }.searchable(text: $text, prompt: "Search names, descriptions, keywords, tags").navigationTitle("Search").navigationDestination(for: Tool.self) { ToolDetailView(tool: $0) }
}

struct SavedView: View {
    @EnvironmentObject private var store: CatalogStore
    var body: some View { NavigationStack { Group { if store.favoriteTools.isEmpty { EmptyStateView(title: "Nothing saved yet", systemImage: "heart", message: "Tap the heart on any tool to keep it here.") } else { ScrollView { ToolList(tools: store.favoriteTools).padding() } } }.navigationTitle("Saved").navigationDestination(for: Tool.self) { ToolDetailView(tool: $0) } } }
}

struct AccountView: View {
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Label("Offline catalog", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(Color.envTeal)
                    Text("The full catalog is bundled with the app. \(NativeCoverage.localActiveToolCount) of \(NativeCoverage.canonicalActiveToolCount) active tools execute locally across the native text, codec, color, datetime, and MIME families. URL media inspection still requires its remote metadata service. Favorites are stored on this device.")
                        .foregroundStyle(.secondary)
                } header: {
                    Text("Your enV")
                }
                Section("Settings") {
                    NavigationLink {
                        Text("Notifications are not configured in this foundation release.").padding()
                    } label: {
                        Label("Notifications", systemImage: "bell")
                    }
                    NavigationLink {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Native migration status").font(.title3.bold())
                            Text("\(NativeCoverage.localActiveToolCount) active tools are available offline. Other active engine types remain in migration, and URL media inspection is explicitly remote-only.")
                                .foregroundStyle(.secondary)
                        }
                        .padding()
                    } label: {
                        Label("Native migration status", systemImage: "hammer")
                    }
                    Label("Version 1.1.0 (6)", systemImage: "info.circle")
                }
                Section("Privacy") {
                    Label("Local-first catalog browsing", systemImage: "lock.shield")
                    Text("No account is required to browse or save tools.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Account")
        }
    }
}

private func sectionHeader(_ title: String, subtitle: String) -> some View { VStack(alignment: .leading, spacing: 3) { Text(title).font(.title2.bold()); Text(subtitle).font(.subheadline).foregroundStyle(.secondary) } }

private struct EmptyStateView: View {
    let title: String
    let systemImage: String
    let message: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage).font(.system(size: 38)).foregroundStyle(Color.envTeal)
            Text(title).font(.title3.bold())
            Text(message).multilineTextAlignment(.center).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(32)
        .accessibilityElement(children: .combine)
    }
}
