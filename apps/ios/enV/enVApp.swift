import SwiftUI

@main
struct enVApp: App {
    @StateObject private var store = CatalogStore()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environmentObject(store)
                .tint(Color.envTeal)
        }
    }
}

extension Color {
    static let envTeal = Color(red: 0.051, green: 0.624, blue: 0.541)
    static let envInk = Color(red: 0.08, green: 0.13, blue: 0.15)
    static let envSurface = Color(red: 0.97, green: 0.985, blue: 0.98)
}

struct RootTabView: View {
    @EnvironmentObject private var store: CatalogStore

    var body: some View {
        ZStack {
            TabView {
                HomeView().tabItem { Label("Home", systemImage: "house") }.tag(0)
                ToolsView().tabItem { Label("Tools", systemImage: "square.grid.2x2") }.tag(1)
                SearchView().tabItem { Label("Search", systemImage: "magnifyingglass") }.tag(2)
                SavedView().tabItem { Label("Saved", systemImage: "heart") }.tag(3)
                AccountView().tabItem { Label("Account", systemImage: "person.crop.circle") }.tag(4)
            }
            if store.loadState == .loading {
                NativeLaunchView()
            } else if store.loadState == .failed {
                CatalogFailureView(retry: store.reloadCatalog)
            }
        }
        .background(Color.envSurface.ignoresSafeArea())
    }
}

private struct NativeLaunchView: View {
    var body: some View {
        VStack(spacing: 8) {
            Text("enV").font(.largeTitle.bold()).foregroundStyle(Color.envTeal)
            Text("Useful tools, ready when you are.").foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.envSurface.ignoresSafeArea())
    }
}

private struct CatalogFailureView: View {
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Text("enV").font(.largeTitle.bold()).foregroundStyle(Color.envTeal)
            Text("The offline catalog couldn't be opened.").foregroundStyle(.secondary)
            Button("Retry", action: retry).buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.envSurface.ignoresSafeArea())
    }
}
