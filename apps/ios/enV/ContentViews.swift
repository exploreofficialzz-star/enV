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
    let onBrowseTools: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Private, practical, on-device tools")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(Color.envAccent)
                        Text("A focused toolkit for everyday work.")
                            .font(.system(size: 34, weight: .semibold))
                            .tracking(-0.5)
                            .foregroundStyle(Color.envInk)
                        Text("Convert, calculate, generate, and transform without sending your files or text away.")
                            .font(.body)
                            .foregroundStyle(Color.envMuted)
                        Button(action: onBrowseTools) {
                            HStack(spacing: 8) {
                                Text("Browse all tools")
                                EnVIcon(name: "ArrowRight", size: 16, tint: .white)
                            }
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16)
                            .frame(height: 44)
                            .background(Color.envAccent, in: RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 4)
                    }

                    VStack(alignment: .leading, spacing: 14) {
                        sectionHeader("Featured tools", subtitle: "Hand-picked starting points")
                        ToolList(tools: Array(store.featuredTools.prefix(6)))
                    }

                    VStack(alignment: .leading, spacing: 14) {
                        sectionHeader("Popular tools", subtitle: "Useful tools people return to")
                        ToolList(tools: Array(store.popularTools.prefix(6)))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 24)
            }
            .modifier(Screen())
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: Tool.self) { ToolDetailView(tool: $0) }
        }
        .modifier(EnVBrandNavigationStyle())
    }
}

struct ToolsView: View {
    @EnvironmentObject private var store: CatalogStore

    private let columns = [GridItem(.adaptive(minimum: 150), spacing: 12)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("All tools")
                            .font(.system(size: 30, weight: .semibold))
                            .tracking(-0.4)
                            .foregroundStyle(Color.envInk)
                        Text("Browse the complete enV toolkit, including the growing Coming Soon catalog.")
                            .font(.subheadline)
                            .foregroundStyle(Color.envMuted)
                    }
                    VStack(alignment: .leading, spacing: 14) {
                        sectionHeader("Suggested tools", subtitle: "Start with a popular tool")
                        ToolList(tools: Array(store.popularTools.prefix(6)))
                    }
                    VStack(alignment: .leading, spacing: 14) {
                        sectionHeader("Browse categories", subtitle: "Choose a category to explore")
                        LazyVGrid(columns: columns, spacing: 12) {
                            ForEach(store.categories) { category in
                                NavigationLink(value: category.id) {
                                    VStack(alignment: .leading, spacing: 9) {
                                        iconTile(category.icon)
                                        Text(category.name)
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(Color.envInk)
                                        Text(category.blurb)
                                            .font(.caption)
                                            .foregroundStyle(Color.envMuted)
                                            .lineLimit(2)
                                            .multilineTextAlignment(.leading)
                                    }
                                    .frame(maxWidth: .infinity, minHeight: 108, alignment: .leading)
                                    .padding(14)
                                    .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
                                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorder, lineWidth: 1))
                                    .contentShape(RoundedRectangle(cornerRadius: 12))
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Browse \(category.name)")
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
    let categoryID: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let category = store.category(named: categoryID) {
                    Text(category.description)
                        .font(.subheadline)
                        .foregroundStyle(Color.envMuted)
                }
                ToolList(tools: store.tools(category: categoryID))
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
    var body: some View {
        NavigationStack {
            SearchResultsView()
        }
        .modifier(EnVBrandNavigationStyle())
    }
}

struct SearchResultsView: View {
    @EnvironmentObject private var store: CatalogStore
    @State private var text = ""
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
                        Text("\(NativeCoverage.localActiveToolCount) of \(NativeCoverage.canonicalActiveToolCount) active tools currently execute locally across native text, codec, color, date/time, and MIME families. URL media inspection still requires its remote service.")
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

private func sectionHeader(_ title: String, subtitle: String) -> some View {
    VStack(alignment: .leading, spacing: 3) {
        Text(title).font(.title2.weight(.semibold)).foregroundStyle(Color.envInk)
        Text(subtitle).font(.subheadline).foregroundStyle(Color.envMuted)
    }
}

func iconTile(_ iconName: String) -> some View {
    EnVIcon(name: iconName, size: 16, tint: .envAccent)
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
