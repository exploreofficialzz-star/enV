import SwiftUI
import UIKit

extension Font {
    static func envScaled(size: CGFloat, weight: Weight = .regular, design: Design = .default) -> Font {
        let nominalSize = size * 1.11
        let textStyle: TextStyle
        switch nominalSize {
        case ..<12: textStyle = .caption2
        case ..<13: textStyle = .caption
        case ..<14.5: textStyle = .footnote
        case ..<16: textStyle = .subheadline
        case ..<18.5: textStyle = .body
        case ..<21: textStyle = .title3
        case ..<25: textStyle = .title2
        case ..<32: textStyle = .title
        default: textStyle = .largeTitle
        }
        return .system(textStyle, design: design, weight: weight)
    }
}

func enVCharacterSpacedText(_ source: String) -> Text {
    Text(verbatim: source).tracking(0.25)
}

func enVLocalizedCharacterSpacedText(_ key: LocalizedStringKey) -> Text {
    Text(key).tracking(0.25)
}

private extension DynamicTypeSize {
    var enVIncreased: DynamicTypeSize {
        switch self {
        case .xSmall: return .small
        case .small: return .medium
        case .medium: return .large
        case .large: return .xLarge
        case .xLarge: return .xxLarge
        case .xxLarge: return .xxxLarge
        case .xxxLarge: return .accessibility1
        case .accessibility1: return .accessibility2
        case .accessibility2: return .accessibility3
        case .accessibility3: return .accessibility4
        case .accessibility4, .accessibility5: return .accessibility5
        @unknown default: return self
        }
    }
}

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

    static let envAccent = adaptive(light: 0x006B60, dark: 0x2EC4B6)
    static let envTeal = envAccent
    static let envInk = adaptive(light: 0x16181D, dark: 0xEEF0F2)
    static let envChrome = adaptive(light: 0xFFFFFF, dark: 0x000000)
    static let envSurface = adaptive(light: 0xF7F6F3, dark: 0x101214)
    static let envBg = envSurface
    static let envCard = adaptive(light: 0xFFFFFF, dark: 0x171B1E)
    static let envSurface2 = adaptive(light: 0xEFECE6, dark: 0x1E2327)
    static let envMuted = adaptive(light: 0x16181D, dark: 0xEEF0F2)
    static let envSubtle = adaptive(light: 0x424850, dark: 0xC3C9D0)
    static let envBorder = adaptive(light: 0xE4E0D8, dark: 0x2A3036)
    static let envBorderStrong = adaptive(light: 0xCFC9BD, dark: 0x3C444C)
    static let envAccentSoft = adaptive(light: 0xD8F3EE, dark: 0x14332F)
}

enum NativeTab: Int {
    case home, tools, search, saved, account, assistant
}

struct NativeInformationRoute: Identifiable {
    let pageID: String
    var id: String { pageID }
}

final class NativeInformationRouter: ObservableObject {
    @Published var route: NativeInformationRoute?

    func open(_ pageID: String) {
        route = NativeInformationRoute(pageID: pageID)
    }
}

struct RootTabView: View {
    @EnvironmentObject private var store: CatalogStore
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @StateObject private var informationRouter = NativeInformationRouter()
    @AppStorage("env.selectedTab") private var selectedTab = NativeTab.home.rawValue
    @AppStorage("env.themeMode") private var themeMode = "system"
    @State private var searchQuery = ""
    @State private var assistantMessages: [AssistantChatMessage] = []
    @State private var assistantDraft = ""

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView(
                onSearch: { query in searchQuery = query; selectedTab = NativeTab.search.rawValue },
                onTools: { selectedTab = NativeTab.tools.rawValue },
                onInformation: { informationRouter.open($0) },
                onAssistant: { selectedTab = NativeTab.assistant.rawValue },
            )
                .tabItem { Label("Home", systemImage: "house") }
                .tag(NativeTab.home.rawValue)
            AssistantChatView(messages: $assistantMessages, draft: $assistantDraft)
                .tabItem { Label("AI assistant", systemImage: "sparkles") }
                .tag(NativeTab.assistant.rawValue)
            ToolsView(toolsQuery: $searchQuery, onSearchNoMatch: { selectedTab = NativeTab.search.rawValue })
                .tabItem { Label("Tools", systemImage: "square.grid.2x2") }
                .tag(NativeTab.tools.rawValue)
            SearchView(query: $searchQuery)
                .tabItem { Label("Search tab", systemImage: "magnifyingglass") }
                .tag(NativeTab.search.rawValue)
            SavedView()
                .tabItem { Label("Saved tools", systemImage: "heart") }
                .tag(NativeTab.saved.rawValue)
            AccountView()
                .tabItem { Label("Account", systemImage: "person") }
                .tag(NativeTab.account.rawValue)
        }
        .environmentObject(informationRouter)
        .toolbar(.hidden, for: .tabBar)
        .background(Color.envChrome.ignoresSafeArea())
        .preferredColorScheme(themeMode == "dark" ? .dark : themeMode == "light" ? .light : nil)
        .fullScreenCover(item: $informationRouter.route) { route in
            NativeInformationPageView(pageID: route.pageID)
        }
        .dynamicTypeSize(dynamicTypeSize.enVIncreased)
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
    @EnvironmentObject private var informationRouter: NativeInformationRouter
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
                    .accessibilityIdentifier("home-navigation-action")
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { selectedTab = NativeTab.saved.rawValue } label: {
                        EnVIcon(name: "Heart", size: 24, tint: .envMuted).frame(width: 36, height: 40)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Saved tools")
                    .accessibilityIdentifier("saved-tools-navigation-action")
                    Button { selectedTab = NativeTab.tools.rawValue } label: {
                        EnVIcon(name: "LayoutGrid", size: 24, tint: .envMuted).frame(width: 36, height: 40)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Tools")
                    .accessibilityIdentifier("tools-navigation-action")
                    Menu {
                        Button("AI assistant") { selectedTab = NativeTab.assistant.rawValue }
                        Button("Account") { selectedTab = NativeTab.account.rawValue }
                        Button("Search tools") { selectedTab = NativeTab.search.rawValue }
                        Button("Pricing") { informationRouter.open("pricing") }
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
                    .accessibilityIdentifier("more-options-navigation-action")
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
                enVCharacterSpacedText("enV").font(.envScaled(size: 24, weight: .bold)).foregroundStyle(Color.envAccent)
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
            enVCharacterSpacedText("chAs Technologies LLC")
                .font(.headline.weight(.semibold))
                .foregroundStyle(Color.envInk)
        }
    }
}

private struct NativeLaunchView: View {
    var body: some View {
        VStack(spacing: 8) {
            EnVLogo().frame(width: 112, height: 75)
            enVCharacterSpacedText("Useful tools, ready when you are.").foregroundStyle(Color.envMuted)
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
            enVCharacterSpacedText("The offline catalog couldn't be opened.").foregroundStyle(Color.envMuted)
            Button("Retry", action: retry).buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.envSurface.ignoresSafeArea())
    }
}
