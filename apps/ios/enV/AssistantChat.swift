import Foundation
import SwiftUI

struct AssistantChatMessage: Identifiable, Equatable {
    let id = UUID()
    let role: String
    let content: String
    var recommendedToolIds: [String] = []

    var isUser: Bool { role == "user" }
}

private struct AssistantPayloadMessage: Encodable {
    let role: String
    let content: String
}

private struct AssistantPayloadCandidate: Encodable {
    let id: String
    let name: String
    let description: String
    let category: String
}

private struct AssistantRunInput: Encodable {
    let messages: [AssistantPayloadMessage]
    let candidates: [AssistantPayloadCandidate]
}

private struct AssistantRunRequest: Encodable {
    let task: String
    let input: AssistantRunInput
}

private struct AssistantServiceError: Decodable {
    let message: String
    let retryable: Bool?
}

private struct AssistantReply: Decodable {
    let reply: String
    let recommendedToolIds: [String]
}

private struct AssistantRunData: Decodable {
    let result: AssistantReply
}

private struct AssistantRunEnvelope: Decodable {
    let ok: Bool
    let data: AssistantRunData?
    let error: AssistantServiceError?
}

private enum AssistantClientError: LocalizedError {
    case missingServer
    case unavailable(String)
    case invalidReply
    var errorDescription: String? {
        switch self {
        case .missingServer: return "Assistant is unavailable in this build."
        case .unavailable(let message): return message
        case .invalidReply: return "The assistant response was not usable. Please try again."
        }
    }
}

private struct PendingAssistantRequest {
    let history: [AssistantChatMessage]
    let conversation: [AssistantChatMessage]
    let candidates: [AssistantPayloadCandidate]
}

private struct ScoredAssistantTool {
    let tool: Tool
    let score: Int
}

/// Native iOS client. Provider keys never leave the server; URLSession handles the enV session cookie.
private enum NativeAssistantClient {
    private static var baseURL: URL? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "ENV_API_BASE_URL") as? String,
              let url = URL(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = url.scheme, ["https", "http"].contains(scheme.lowercased()),
              url.host != nil else { return nil }
        return url
    }

    static func reply(to messages: [AssistantChatMessage], candidates: [AssistantPayloadCandidate]) async throws -> AssistantReply {
        let input = AssistantRunInput(
            messages: messages.map { AssistantPayloadMessage(role: $0.role, content: $0.content) },
            candidates: candidates
        )
        let body = try JSONEncoder().encode(AssistantRunRequest(task: "assistant.chat", input: input))
        let data = try await sendRequest(path: ["api", "ai", "run"], method: "POST", body: body)
        let envelope = try JSONDecoder().decode(AssistantRunEnvelope.self, from: data)
        guard envelope.ok,
              let result = envelope.data?.result,
              !result.reply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw AssistantClientError.unavailable(envelope.error?.message ?? AssistantClientError.invalidReply.localizedDescription)
        }
        return result
    }

    private static func sendRequest(path: [String], method: String, body: Data?) async throws -> Data {
        guard var url = baseURL else { throw AssistantClientError.missingServer }
        for component in path { url.appendPathComponent(component) }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 75
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw AssistantClientError.invalidReply }
        guard (200...299).contains(http.statusCode) else {
            let serviceError = try? JSONDecoder().decode(AssistantRunEnvelope.self, from: data).error
            let message = serviceError?.message ?? "The assistant is temporarily unavailable. Please try again."
            throw AssistantClientError.unavailable(message)
        }
        return data
    }
}

struct AssistantChatView: View {
    @EnvironmentObject private var store: CatalogStore
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Binding var messages: [AssistantChatMessage]
    @Binding var draft: String
    @State private var isSending = false
    @State private var errorMessage: String?
    @State private var retryRequest: PendingAssistantRequest?
    @State private var activeRequest: Task<Void, Never>?

    private let messageLimit = 3_000
    private let historyLimit = 12_000
    private let contextMessageLimit = 12
    private let candidateLimit = 8
    private let synonyms: [String: [String]] = [
        "photo": ["image", "picture", "pic"], "picture": ["image", "photo"], "pic": ["image", "photo"],
        "img": ["image"], "compress": ["minify", "shrink", "optimize", "size"],
        "resize": ["scale", "dimensions", "size"], "json": ["javascript object"],
        "pwd": ["password"], "pass": ["password"], "bmi": ["body mass", "weight"],
        "percent": ["percentage", "%"], "qr": ["qrcode", "barcode"], "uuid": ["guid"],
        "hash": ["checksum", "digest", "sha", "md5"], "color": ["colour", "hex", "rgb"],
        "mockup": ["fake", "demo", "chat", "screenshot"], "invoice": ["bill", "receipt"],
        "pdf": ["document"], "encode": ["encoding", "base64"], "decode": ["decoding"],
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 10) {
                HStack(alignment: .center) {
                    HStack(spacing: 8) {
                        Image(systemName: "sparkles").foregroundStyle(Color.envAccent)
                            Text("AI assistant").font(.custom("Outfit-SemiBold", size: horizontalSizeClass == .regular ? 30 : 24)).foregroundStyle(Color.envInk)
                    }
                    Spacer()
                    Button(action: startNewChat) {
                        Label("New chat", systemImage: "square.and.pencil").font(.footnote.weight(.medium))
                    }
                }

                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            if messages.isEmpty {
                                VStack(spacing: 10) {
                                    Image(systemName: "sparkles")
                                        .font(.system(size: 24, weight: .semibold))
                                        .foregroundStyle(Color.envAccent)
                                        .frame(width: 52, height: 52)
                                        .background(Color.envAccentSoft, in: RoundedRectangle(cornerRadius: 16))
                                    Text("What can I help with?").font(.title3.weight(.semibold)).foregroundStyle(Color.envMuted)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 32)
                            } else {
                                ForEach(messages) { message in
                                    HStack {
                                        if message.isUser { Spacer(minLength: 28) }
                                        VStack(alignment: .leading, spacing: 8) {
                                            VStack(alignment: .leading, spacing: 5) {
                                                Text(message.isUser ? "You" : "enV")
                                                    .font(.custom("Outfit-SemiBold", size: 12)).foregroundStyle(Color.envMuted)
                                                Text(message.content)
                                                    .font(.custom("Outfit-Regular", size: 14)).foregroundStyle(Color.envInk)
                                                    .textSelection(.enabled)
                                                    .fixedSize(horizontal: false, vertical: true)
                                            }
                                            if !message.isUser && !message.recommendedToolIds.isEmpty {
                                                VStack(alignment: .leading, spacing: 8) {
                                                    ForEach(message.recommendedToolIds, id: \.self) { toolId in
                                                        if let tool = store.catalog.tools.first(where: { $0.id == toolId && ($0.status == "active" || $0.status == "beta") }) {
                                                            NavigationLink(value: tool) {
                                                                HStack(spacing: 10) {
                                                                    EnVIcon(name: tool.icon, size: 20, tint: .envMuted)
                                                                    VStack(alignment: .leading, spacing: 3) {
                                                                        Text(tool.name).font(.subheadline.weight(.semibold)).foregroundStyle(Color.envInk)
                                                                        Text(tool.description).font(.caption).foregroundStyle(Color.envMuted).lineLimit(2)
                                                                    }
                                                                    Spacer(minLength: 4)
                                                                    Image(systemName: "arrow.right").font(.caption.weight(.semibold)).foregroundStyle(Color.envMuted)
                                                                }
                                                                .padding(12)
                                                                .frame(maxWidth: .infinity, alignment: .leading)
                                                                .background(Color.envSurface, in: RoundedRectangle(cornerRadius: 14))
                                                                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.envBorder, lineWidth: 1))
                                                            }
                                                            .buttonStyle(.plain)
                                                        }
                                                    }
                                                }
                                                .padding(.top, 6)
                                            }
                                        }
                                        .padding(12)
                                        .frame(maxWidth: UIScreen.main.bounds.width * (horizontalSizeClass == .regular ? 0.9 : 0.96), alignment: .leading)
                                        .background(message.isUser ? Color.envAccentSoft : Color.envCard, in: RoundedRectangle(cornerRadius: 16))
                                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.envBorder, lineWidth: 1))
                                        if !message.isUser { Spacer(minLength: 28) }
                                    }
                                    .frame(maxWidth: .infinity, alignment: message.isUser ? .trailing : .leading)
                                    .id(message.id)
                                }
                            }
                            if isSending {
                                HStack(spacing: 8) {
                                    ProgressView()
                                    Text("Thinking…").font(.custom("Outfit-Regular", size: 14)).foregroundStyle(Color.envMuted)
                                    Button("Stop", action: stopRequest)
                                        .font(.custom("Outfit-SemiBold", size: 14))
                                        .accessibilityLabel("Stop assistant response")
                                }
                                    .padding(12)
                                    .id("assistant-thinking")
                            }
                            Color.clear.frame(height: 1).id("assistant-bottom")
                        }
                        .padding(.vertical, 6)
                    }
                    .onChange(of: messages.count) { _ in
                        withAnimation { proxy.scrollTo("assistant-bottom", anchor: .bottom) }
                    }
                    .onChange(of: isSending) { _ in
                        withAnimation { proxy.scrollTo("assistant-bottom", anchor: .bottom) }
                    }
                }
                .frame(maxHeight: .infinity)
                .frame(minHeight: 320, maxHeight: UIScreen.main.bounds.height * 0.68)
                .padding(16)
                .background(Color.envSurface, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.envBorder, lineWidth: 1))
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Assistant conversation")
                .accessibilityAddTraits(.updatesFrequently)

                if let errorMessage {
                    HStack(alignment: .center, spacing: 8) {
                        Text(errorMessage).font(.custom("Outfit-Regular", size: 14)).foregroundStyle(Color.envInk).frame(maxWidth: .infinity, alignment: .leading)
                        if let retryRequest {
                            Button("Retry") { runRequest(retryRequest) }.font(.custom("Outfit-SemiBold", size: 14))
                        }
                    }
                    .padding(12)
                    .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.updatesFrequently)
                }

                HStack(alignment: .bottom, spacing: 10) {
                    TextField("Ask about enV tools or the enV brand…", text: Binding(
                        get: { draft },
                        set: { draft = String($0.prefix(messageLimit)) }
                    ), axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.roundedBorder)
                    .font(.custom("Outfit-Regular", size: 16))
                    .submitLabel(.send)
                    .onSubmit(sendDraft)
                    .disabled(isSending)
                    Button(action: sendDraft) {
                        Image(systemName: isSending ? "hourglass" : "arrow.up.circle.fill")
                            .font(.system(size: 28, weight: .semibold))
                            .foregroundStyle(Color.envAccent)
                    }
                    .accessibilityLabel("Send message")
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 8)
            .frame(maxWidth: 768)
            .frame(maxWidth: .infinity)
            .background(Color.envSurface.ignoresSafeArea())
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: String.self) { CategoryView(categoryID: $0) }
            .navigationDestination(for: Tool.self) { ToolDetailView(tool: $0) }
        }
        .modifier(EnVBrandNavigationStyle())
        .onDisappear {
            activeRequest?.cancel()
            activeRequest = nil
            isSending = false
        }
    }

    private func requestContext(_ conversation: [AssistantChatMessage]) -> [AssistantChatMessage] {
        var recent: [AssistantChatMessage] = []
        var characters = 0
        for message in conversation.suffix(contextMessageLimit).reversed() {
            if characters + message.content.count > historyLimit { break }
            recent.append(AssistantChatMessage(role: message.role, content: message.content))
            characters += message.content.count
        }
        return recent.reversed()
    }

    private func candidates(for conversation: [AssistantChatMessage]) -> [AssistantPayloadCandidate] {
        let query = conversation.filter { $0.role == "user" }.suffix(3).map(\.content).joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return [] }
        let tokenSet = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "%+"))
        let baseTokens = query.components(separatedBy: tokenSet.inverted).filter { $0.count > 1 || $0 == "%" }
        let tokens = Array(Set(baseTokens + baseTokens.flatMap { synonyms[$0] ?? [] }))
        let ranked = store.catalog.tools.filter { $0.status == "active" || $0.status == "beta" }.compactMap { tool -> ScoredAssistantTool? in
            let name = tool.name.lowercased()
            let id = tool.id.lowercased()
            let score: Int
            if name == query || id == query { score = 2_000 + tool.popularity }
            else if name.hasPrefix(query) { score = 1_400 + tool.popularity }
            else if name.contains(query) || id.contains(query) { score = 1_000 + tool.popularity }
            else {
                let haystack = tool.searchText
                var hits = 0
                for token in tokens {
                    if name.contains(token) { hits += 8 }
                    else if tool.keywords.contains(where: { $0.lowercased().contains(token) }) { hits += 5 }
                    else if haystack.contains(token) { hits += 2 }
                }
                guard hits > 0 else { return nil }
                score = hits * 40 + tool.popularity
            }
            return ScoredAssistantTool(tool: tool, score: score)
        }
        return ranked.sorted {
            if $0.score != $1.score { return $0.score > $1.score }
            if $0.tool.popularity != $1.tool.popularity { return $0.tool.popularity > $1.tool.popularity }
            return $0.tool.name < $1.tool.name
        }.prefix(candidateLimit).map { tool in
            AssistantPayloadCandidate(id: tool.tool.id, name: tool.tool.name, description: tool.tool.description, category: tool.tool.category)
        }
    }

    private func sendDraft() {
        let content = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty, content.count <= messageLimit, !isSending else { return }
        let conversation = messages + [AssistantChatMessage(role: "user", content: content)]
        let history = requestContext(conversation)
        messages = conversation
        draft = ""
        errorMessage = nil
        runRequest(PendingAssistantRequest(history: history, conversation: conversation, candidates: candidates(for: history)))
    }

    private func runRequest(_ pending: PendingAssistantRequest) {
        activeRequest?.cancel()
        isSending = true
        errorMessage = nil
        retryRequest = pending
        activeRequest = Task { @MainActor in
            do {
                let result = try await NativeAssistantClient.reply(to: pending.history, candidates: pending.candidates)
                guard !Task.isCancelled else { return }
                let allowed = Set(pending.candidates.map(\.id))
                let safeIds = result.recommendedToolIds.filter { allowed.contains($0) }
                messages = pending.conversation + [AssistantChatMessage(role: "assistant", content: result.reply, recommendedToolIds: safeIds)]
                retryRequest = nil
                errorMessage = nil
            } catch is CancellationError {
                // The user left the screen or started a new chat.
            } catch {
                guard !Task.isCancelled else { return }
                errorMessage = error.localizedDescription
            }
            if !Task.isCancelled {
                isSending = false
                activeRequest = nil
            }
        }
    }

    private func startNewChat() {
        activeRequest?.cancel()
        activeRequest = nil
        messages = []
        draft = ""
        isSending = false
        errorMessage = nil
        retryRequest = nil
    }

    private func stopRequest() {
        activeRequest?.cancel()
        activeRequest = nil
        isSending = false
    }
}
