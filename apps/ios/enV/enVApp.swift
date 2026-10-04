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
    static let envSurface = adaptive(light: 0xF7F6F3, dark: 0x101214)
    static let envBg = envSurface
    static let envCard = adaptive(light: 0xFFFFFF, dark: 0x171B1E)
    static let envSurface2 = adaptive(light: 0xEFECE6, dark: 0x1E2327)
    static let envMuted = adaptive(light: 0x5C636C, dark: 0xA7ADB4)
    static let envSubtle = adaptive(light: 0x8A9098, dark: 0x7C848C)
    static let envBorder = adaptive(light: 0xE4E0D8, dark: 0x2A3036)
    static let envAccentSoft = adaptive(light: 0xD8F3EE, dark: 0x14332F)
}

private enum NativeTab: Int, CaseIterable {
    case home, tools, search, saved, account

    var title: String {
        switch self {
        case .home: "Home"
        case .tools: "Tools"
        case .search: "Search"
        case .saved: "Saved"
        case .account: "Account"
        }
    }

    var lucideIcon: String {
        switch self {
        case .home: "Home"
        case .tools: "LayoutGrid"
        case .search: "Search"
        case .saved: "Heart"
        case .account: "User"
        }
    }
}

struct RootTabView: View {
    @EnvironmentObject private var store: CatalogStore
    @AppStorage("env.selectedTab") private var selectedTab = NativeTab.home.rawValue
    @AppStorage("env.themeMode") private var themeMode = "system"

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView(onBrowseTools: { selectedTab = NativeTab.tools.rawValue })
                .tag(NativeTab.home.rawValue)
            ToolsView()
                .tag(NativeTab.tools.rawValue)
            SearchView()
                .tag(NativeTab.search.rawValue)
            SavedView()
                .tag(NativeTab.saved.rawValue)
            AccountView()
                .tag(NativeTab.account.rawValue)
        }
        .toolbar(.hidden, for: .tabBar)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            EnVBottomBar(selection: $selectedTab)
        }
        .background(Color.envSurface.ignoresSafeArea())
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

private struct EnVBottomBar: View {
    @Binding var selection: Int

    var body: some View {
        HStack(spacing: 0) {
            ForEach(NativeTab.allCases, id: \.rawValue) { tab in
                let selected = selection == tab.rawValue
                Button { selection = tab.rawValue } label: {
                    VStack(spacing: 3) {
                        EnVIcon(
                            name: tab.lucideIcon,
                            size: 20,
                            tint: selected ? .envAccent : .envMuted
                        )
                        Text(tab.title)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(selected ? Color.envAccent : Color.envMuted)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 56)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tab.title)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .padding(.top, 1)
        .background(Color.envSurface.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) {
            Rectangle().fill(Color.envBorder).frame(height: 1)
        }
    }
}

struct EnVBrandNavigationStyle: ViewModifier {
    @AppStorage("env.themeMode") private var themeMode = "system"
    @AppStorage("env.selectedTab") private var selectedTab = NativeTab.home.rawValue
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        content
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { selectedTab = NativeTab.home.rawValue } label: {
                        EnVLogo().frame(width: 84, height: 56)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("enV home")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { themeMode = colorScheme == .dark ? "light" : "dark" } label: {
                        EnVIcon(name: colorScheme == .dark ? "Sun" : "Moon", size: 18, tint: .envMuted)
                            .frame(width: 36, height: 36)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(colorScheme == .dark ? "Switch to light mode" : "Switch to dark mode")
                }
            }
            .toolbarBackground(Color.envSurface, for: .navigationBar)
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

    var body: some View {
        Group {
            if let image = EnVNativeImages.logo(dark: colorScheme == .dark) {
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

    static func logo(dark: Bool) -> UIImage? {
        load(path: dark ? "native-icons/logo-header-dark.png" : "native-icons/logo-header-transparent.png")
    }

    private static func load(path: String) -> UIImage? {
        if let cached = cache.object(forKey: path as NSString) { return cached }
        let url = Bundle.main.bundleURL.appendingPathComponent(path)
        guard let image = UIImage(contentsOfFile: url.path) else { return nil }
        cache.setObject(image, forKey: path as NSString)
        return image
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
