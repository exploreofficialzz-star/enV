import SwiftUI
import WebKit

/// Exact web-engine bridge for tools whose implementation depends on browser APIs,
/// rich media codecs, or the existing server-backed web engine. The native shell,
/// navigation policy, and lifecycle remain Swift; the canonical web engine performs the tool work.
struct NativeWebFallbackToolView: View {
    let tool: Tool
    private let origin = URL(string: "https://en-v-6h2l.vercel.app")!

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Exact web engine in native shell · online")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.envAccent)
            Text("This tool uses the canonical enV web engine because its implementation depends on browser APIs, media processing, or the existing backend.")
                .font(.caption)
                .foregroundStyle(.secondary)
            NativeWebView(url: toolURL)
                .frame(minHeight: 620)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorder, lineWidth: 1))
        }
    }

    private var toolURL: URL {
        let category = tool.category.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? tool.category
        let slug = tool.slug.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? tool.slug
        return origin.appendingPathComponent("tools").appendingPathComponent(category).appendingPathComponent(slug)
    }
}

private struct NativeWebView: UIViewRepresentable {
    let url: URL
    private let originHost = "en-v-6h2l.vercel.app"

    func makeCoordinator() -> Coordinator { Coordinator(originHost: originHost) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = true
        view.load(URLRequest(url: url))
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        guard view.url?.absoluteString != url.absoluteString else { return }
        view.load(URLRequest(url: url))
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        let originHost: String
        init(originHost: String) { self.originHost = originHost }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let target = navigationAction.request.url else { decisionHandler(.cancel); return }
            if target.scheme?.lowercased() == "https", target.host == originHost {
                decisionHandler(.allow)
            } else {
                UIApplication.shared.open(target)
                decisionHandler(.cancel)
            }
        }
    }
}
