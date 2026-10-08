import SwiftUI
import UIKit

@main
struct enVApp: App {
    @StateObject private var store = CatalogStore()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environmentObject(store)
                .tint(Color.envAccent)
        }
    }
}

extension Color {
    private static func adaptive(light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            let value = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(
                red: CGFloat((value >> 16) & 0xff) / 255,
                green: CGFloat((value >> 8) & 0xff) / 255,
                blue: CGFloat(value & 0xff) / 255,
                alpha: 1
            )
        })
    }

    static let envAccent = adaptive(light: 0x0D9F8A, dark: 0x2EC4B6)
    static let envTeal = envAccent
    static let envInk = adaptive(light: 0x16181D, dark: 0xEEF0F2)
    static let envChrome = adaptive(light: 0xFFFFFF, dark: 0x000000)
    static let envSurface = adaptive(light: 0xF7F6F3, dark: 0x101214)
    static let envBg = envSurface
    static let envCard = adaptive(light: 0xFFFFFF, dark: 0x171B1E)
    static let envSurface2 = adaptive(light: 0xEFECE6, dark: 0x1E2327)
    static let envMuted = adaptive(light: 0x5C636C, dark: 0xA7ADB4)
    static let envSubtle = adaptive(light: 0x8A9098, dark: 0x7C848C)
    static let envBorder = adaptive(light: 0xE4E0D8, dark: 0x2A3036)
    static let envAccentSoft = adaptive(light: 0xD8F3EE, dark: 0x14332F)
}

private enum NativeTab: Int {
    case home, tools, search, saved, account, assistant
}

struct RootTabView: View {
    @EnvironmentObject private var store: CatalogStore
    @AppStorage("env.selectedTab") private var selectedTab = NativeTab.home.rawValue
    @AppStorage("env.themeMode") private var themeMode = "system"
    @State private var searchQuery = ""
    @State private var assistantMessages: [AssistantChatMessage] = []

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView(
                onSearch: { query in searchQuery = query; selectedTab = NativeTab.search.rawValue },
                onTools: { selectedTab = NativeTab.tools.rawValue },
                onAccount: { selectedTab = NativeTab.account.rawValue },
                onAssistant: { selectedTab = NativeTab.assistant.rawValue },
            )
                .tag(NativeTab.home.rawValue)
            AssistantChatView(messages: $assistantMessages)
                .tag(NativeTab.assistant.rawValue)
            ToolsView(toolsQuery: $searchQuery)
                .tag(NativeTab.tools.rawValue)
            SearchView(query: $searchQuery)
                .tag(NativeTab.search.rawValue)
            SavedView()
                .tag(NativeTab.saved.rawValue)
            AccountView()
                .tag(NativeTab.account.rawValue)
        }
        .toolbar(.hidden, for: .tabBar)
        .background(Color.envChrome.ignoresSafeArea())
        .preferredColorScheme(themeMode == "dark" ? .dark : themeMode == "light" ? .light : nil)
        .overlay {
            if store.loadState == .loading {
                NativeLaunchView()
            } else if store.loadState == .failed {
                CatalogFailureView(retry: store.reloadCatalog)
            }
        }
    }
}

struct EnVBrandNavigationStyle: ViewModifier {
    @AppStorage("env.selectedTab") private var selectedTab = NativeTab.home.rawValue

    func body(content: Content) -> some View {
        content
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { selectedTab = NativeTab.home.rawValue } label: {
                        EnVIcon(name: "Home", size: 24, tint: .envMuted).frame(width: 40, height: 40)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Home")
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { selectedTab = NativeTab.saved.rawValue } label: {
                        EnVIcon(name: "Heart", size: 24, tint: .envMuted).frame(width: 36, height: 40)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Saved tools")
                    Button { selectedTab = NativeTab.tools.rawValue } label: {
                        EnVIcon(name: "LayoutGrid", size: 24, tint: .envMuted).frame(width: 36, height: 40)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Tools")
                    Menu {
                        Button("AI assistant") { selectedTab = NativeTab.assistant.rawValue }
                        Button("Account") { selectedTab = NativeTab.account.rawValue }
                        Button("Search tools") { selectedTab = NativeTab.search.rawValue }
                        Button("Pricing") { selectedTab = NativeTab.account.rawValue }
                    } label: {
                        VStack(spacing: 3) {
                            ForEach(0..<3, id: \.self) { _ in
                                Circle().fill(Color.envMuted).frame(width: 4, height: 4)
                            }
                        }
                            .frame(width: 32, height: 36)
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel("More options")
                }
            }
            .toolbarBackground(Color.envChrome, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
    }
}

struct EnVIcon: View {
    let name: String
    var size: CGFloat = 20
    var tint: Color = .envMuted

    private var image: UIImage? { EnVNativeImages.image(named: name) }

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(tint)
            } else {
                Color.clear
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct EnVLogo: View {
    @Environment(\.colorScheme) private var colorScheme
    var homeHero: Bool = false

    var body: some View {
        Group {
            if let image = EnVNativeImages.logo(dark: colorScheme == .dark, homeHero: homeHero) {
                Image(uiImage: image).resizable().scaledToFit()
            } else {
                Text("enV").font(.system(size: 24, weight: .bold)).foregroundStyle(Color.envAccent)
            }
        }
        .accessibilityHidden(true)
    }
}

private enum EnVNativeImages {
    private static let cache = NSCache<NSString, UIImage>()

    static func image(named name: String) -> UIImage? {
        let slug = name.replacingOccurrences(
            of: "([a-z0-9])([A-Z])",
            with: "$1_$2",
            options: .regularExpression
        ).lowercased()
        return load(path: "native-icons/icons/\(slug).png")
    }

    static func logo(dark: Bool, homeHero: Bool = false) -> UIImage? {
        if homeHero {
            return load(path: dark ? "native-icons/logo-home-dark.png" : "native-icons/logo-home-transparent.png")
        }
        return load(path: dark ? "native-icons/logo-header-dark.png" : "native-icons/logo-header-transparent.png")
    }

    static func companyLogo() -> UIImage? {
        load(path: "native-icons/chas-technologies-logo.jpg")
    }

    private static func load(path: String) -> UIImage? {
        if let cached = cache.object(forKey: path as NSString) { return cached }
        let url = Bundle.main.bundleURL.appendingPathComponent(path)
        guard let image = UIImage(contentsOfFile: url.path) else { return nil }
        cache.setObject(image, forKey: path as NSString)
        return image
    }
}

struct ChasTechnologiesLogo: View {
    var body: some View {
        if let image = EnVNativeImages.companyLogo() {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .accessibilityLabel("chAs Technologies LLC")
        } else {
            Text("chAs Technologies LLC")
                .font(.headline.weight(.semibold))
                .foregroundStyle(Color.envInk)
        }
    }
}

private struct NativeLaunchView: View {
    var body: some View {
        VStack(spacing: 8) {
            EnVLogo().frame(width: 112, height: 75)
            Text("Useful tools, ready when you are.").foregroundStyle(Color.envMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.envSurface.ignoresSafeArea())
    }
}

private struct CatalogFailureView: View {
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            EnVLogo().frame(width: 112, height: 75)
            Text("The offline catalog couldn't be opened.").foregroundStyle(Color.envMuted)
            Button("Retry", action: retry).buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.envSurface.ignoresSafeArea())
    }
}
