import Foundation
import SwiftUI

struct AssistantChatMessage: Identifiable, Equatable {
    let id = UUID()
    let role: String
    let content: String

    var isUser: Bool { role == "user" }
}

private struct AssistantPayloadMessage: Encodable {
    let role: String
    let content: String
}

private struct AssistantRunInput: Encodable {
    let messages: [AssistantPayloadMessage]
}

private struct AssistantRunRequest: Encodable {
    let task: String
    let input: AssistantRunInput
}

private struct AssistantTaskAvailability: Decodable {
    let available: Bool
}

private struct AssistantStatusEnvelope: Decodable {
    let ok: Bool
    let tasks: [String: AssistantTaskAvailability]?
}

private struct AssistantServiceError: Decodable {
    let message: String
}

private struct AssistantReply: Decodable {
    let reply: String
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
        case .missingServer: return "The enV AI server is not configured for this app build."
        case .unavailable(let message): return message
        case .invalidReply: return "The assistant response was not usable. Please try again."
        }
    }
}

/// Native iOS client. Provider keys never leave the server; URLSession handles the server session cookie.
private enum NativeAssistantClient {
    private static var baseURL: URL? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "ENV_API_BASE_URL") as? String,
              let url = URL(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = url.scheme, ["https", "http"].contains(scheme.lowercased()),
              url.host != nil else { return nil }
        return url
    }

    static func isAvailable() async throws -> Bool {
        let data = try await sendRequest(path: ["api", "ai", "status"], method: "GET", body: nil)
        let envelope = try JSONDecoder().decode(AssistantStatusEnvelope.self, from: data)
        return envelope.ok && envelope.tasks?["assistant.chat"]?.available == true
    }

    static func reply(to messages: [AssistantChatMessage]) async throws -> String {
        let input = AssistantRunInput(messages: messages.map { AssistantPayloadMessage(role: $0.role, content: $0.content) })
        let body = try JSONEncoder().encode(AssistantRunRequest(task: "assistant.chat", input: input))
        let data = try await sendRequest(path: ["api", "ai", "run"], method: "POST", body: body)
        let envelope = try JSONDecoder().decode(AssistantRunEnvelope.self, from: data)
        guard envelope.ok, let reply = envelope.data?.result.reply.trimmingCharacters(in: .whitespacesAndNewlines), !reply.isEmpty else {
            throw AssistantClientError.unavailable(envelope.error?.message ?? AssistantClientError.invalidReply.localizedDescription)
        }
        return reply
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
        // URLSession.shared uses the app's standard cookie store for the enV session cookie.
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw AssistantClientError.invalidReply }
        guard (200...299).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(AssistantRunEnvelope.self, from: data).error?.message)
                ?? "The AI assistant is temporarily unavailable. Please try again."
            throw AssistantClientError.unavailable(message)
        }
        return data
    }
}

struct AssistantChatView: View {
    @Binding var messages: [AssistantChatMessage]
    @State private var draft = ""
    @State private var available: Bool?
    @State private var availabilityAttempt = 0
    @State private var consented = false
    @State private var isSending = false
    @State private var errorMessage: String?
    @State private var retryHistory: [AssistantChatMessage]?
    @State private var retryConversation: [AssistantChatMessage]?
    @State private var activeRequest: Task<Void, Never>?

    private let messageLimit = 3_000
    private let historyLimit = 12_000
    private let contextMessageLimit = 12
    private let starters = ["Help me plan my day", "Explain a difficult idea simply", "Draft a professional email"]

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("AI assistant").font(.title2.weight(.semibold)).foregroundStyle(Color.envInk)
                        Text("Questions, planning, writing, and everyday work.").font(.footnote).foregroundStyle(Color.envMuted)
                    }
                    Spacer()
                    Button(action: startNewChat) {
                        Label("New chat", systemImage: "trash").font(.footnote.weight(.medium))
                    }
                        .disabled(messages.isEmpty || isSending)
                }

                Text("Messages and recent context are sent to enV’s configured AI provider to generate replies. Avoid passwords and sensitive or confidential information. This chat is not saved to an account.")
                    .font(.footnote)
                    .foregroundStyle(Color.envMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 12))

                if available == nil {
                    HStack(spacing: 8) { ProgressView(); Text("Checking assistant availability…").font(.footnote).foregroundStyle(Color.envMuted) }
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else if available == false {
                    HStack(spacing: 10) {
                        Text("The AI assistant is not available on this server right now.").font(.footnote).foregroundStyle(Color.envMuted)
                        Spacer(minLength: 4)
                        Button("Check again") { availabilityAttempt += 1 }
                            .font(.footnote.weight(.semibold))
                    }
                    .padding(12)
                    .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
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
                                    Text("How can I help?").font(.title3.weight(.semibold)).foregroundStyle(Color.envInk)
                                    Text("Choose a starting point or write your own message.").font(.footnote).foregroundStyle(Color.envMuted)
                                    ForEach(starters, id: \.self) { prompt in
                                        Button(prompt) { draft = prompt }
                                            .buttonStyle(.bordered)
                                            .tint(Color.envAccent)
                                            .disabled(available != true || isSending)
                                    }
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 28)
                            } else {
                                ForEach(messages) { message in
                                    HStack {
                                        if message.isUser { Spacer(minLength: 28) }
                                        VStack(alignment: .leading, spacing: 5) {
                                            Text(message.isUser ? "You" : "enV assistant")
                                                .font(.caption.weight(.semibold)).foregroundStyle(Color.envMuted)
                                            Text(message.content)
                                                .font(.body).foregroundStyle(Color.envInk)
                                                .textSelection(.enabled)
                                                .fixedSize(horizontal: false, vertical: true)
                                        }
                                        .padding(12)
                                        .frame(maxWidth: 500, alignment: .leading)
                                        .background(message.isUser ? Color.envAccentSoft : Color.envCard, in: RoundedRectangle(cornerRadius: 16))
                                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.envBorder, lineWidth: 1))
                                        if !message.isUser { Spacer(minLength: 28) }
                                    }
                                    .id(message.id)
                                }
                            }
                            if isSending {
                                HStack(spacing: 8) { ProgressView(); Text("Thinking…").font(.footnote).foregroundStyle(Color.envMuted) }
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

                if let errorMessage {
                    HStack(alignment: .center, spacing: 8) {
                        Text(errorMessage).font(.footnote).foregroundStyle(Color.envInk).frame(maxWidth: .infinity, alignment: .leading)
                        if let retryHistory, let retryConversation {
                            Button("Retry") { runRequest(history: retryHistory, conversation: retryConversation) }
                                .font(.footnote.weight(.semibold))
                        }
                    }
                    .padding(12)
                    .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
                }

                Toggle(isOn: $consented) {
                    Text("I agree that my message and recent chat context are sent to the configured AI provider.")
                        .font(.caption)
                        .foregroundStyle(Color.envMuted)
                }
                .tint(Color.envAccent)
                .disabled(available != true || isSending)

                HStack(alignment: .bottom, spacing: 10) {
                    TextField("Message the enV assistant…", text: $draft, axis: .vertical)
                        .lineLimit(1...4)
                        .textFieldStyle(.roundedBorder)
                        .submitLabel(.send)
                        .onSubmit(sendDraft)
                        .disabled(available != true || isSending)
                    Button(action: sendDraft) {
                        Image(systemName: isSending ? "hourglass" : "arrow.up.circle.fill")
                            .font(.system(size: 28, weight: .semibold))
                            .foregroundStyle(Color.envAccent)
                    }
                    .accessibilityLabel("Send message")
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !consented || available != true || isSending)
                }
                Text("\(draft.count)/\(messageLimit) · AI responses can be inaccurate; verify important information.")
                    .font(.caption2).foregroundStyle(Color.envSubtle)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 8)
            .background(Color.envSurface.ignoresSafeArea())
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
        }
        .modifier(EnVBrandNavigationStyle())
        .task(id: availabilityAttempt) { await refreshAvailability() }
        .onDisappear {
            activeRequest?.cancel()
            activeRequest = nil
            isSending = false
        }
    }

    private func refreshAvailability() async {
        available = nil
        do {
            available = try await NativeAssistantClient.isAvailable()
        } catch {
            available = false
        }
    }

    private func requestContext(_ conversation: [AssistantChatMessage]) -> [AssistantChatMessage] {
        var recent: [AssistantChatMessage] = []
        var characters = 0
        for message in conversation.suffix(contextMessageLimit).reversed() {
            if characters + message.content.count > historyLimit { break }
            recent.append(message)
            characters += message.content.count
        }
        return recent.reversed()
    }

    private func sendDraft() {
        let content = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty, content.count <= messageLimit, consented, available == true, !isSending else { return }
        let conversation = messages + [AssistantChatMessage(role: "user", content: content)]
        messages = conversation
        draft = ""
        errorMessage = nil
        runRequest(history: requestContext(conversation), conversation: conversation)
    }

    private func runRequest(history: [AssistantChatMessage], conversation: [AssistantChatMessage]) {
        activeRequest?.cancel()
        isSending = true
        errorMessage = nil
        retryHistory = history
        retryConversation = conversation
        activeRequest = Task { @MainActor in
            do {
                let reply = try await NativeAssistantClient.reply(to: history)
                guard !Task.isCancelled else { return }
                messages = conversation + [AssistantChatMessage(role: "assistant", content: reply)]
                retryHistory = nil
                retryConversation = nil
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
        retryHistory = nil
        retryConversation = nil
    }
}
