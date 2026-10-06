import Foundation
import Network
import Contacts

struct ExchangeContact: Identifiable, Equatable {
    let id: String
    let fullName: String
    let phone: String
    let email: String
    let company: String
    let jobTitle: String
    let website: String
}

@MainActor
final class ContactExchangeController: ObservableObject {
    @Published private(set) var active = false
    @Published private(set) var connectedCount = 0
    @Published private(set) var received: [ExchangeContact] = []
    @Published var error: String?

    private let serviceType = "_env-contact._tcp"
    private let protocolVersion = 1
    private let maxCardBytes = 30_000
    private var participantID = ""
    private var card: [String: String] = [:]
    private var listener: NWListener?
    private var browser: NWBrowser?
    private var connections: [ObjectIdentifier: NWConnection] = [:]
    private var receivedIDs = Set<String>()
    private var connectionBuffers: [ObjectIdentifier: Data] = [:]

    func start(fullName: String, phone: String, email: String, company: String, jobTitle: String, website: String) {
        let values = ["fullName": fullName, "phone": phone, "email": email, "company": company, "jobTitle": jobTitle, "website": website]
            .compactMapValues { value in let v = value.trimmingCharacters(in: .whitespacesAndNewlines); return v.isEmpty ? nil : String(v.prefix(2_000)) }
        guard !values.isEmpty else { error = "Add at least one contact field before activating Exchange."; return }
        guard let encoded = try? JSONSerialization.data(withJSONObject: values), encoded.count <= maxCardBytes else { error = "The selected contact card is too large."; return }
        stop()
        card = values
        participantID = UUID().uuidString
        receivedIDs.removeAll(); received.removeAll(); error = nil
        do {
            let listener = try NWListener(using: .tcp, on: .any)
            listener.service = NWListener.Service(name: "enV Exchange \(participantID.prefix(8))", type: serviceType, domain: nil, txtRecord: nil)
            listener.stateUpdateHandler = { [weak self] state in Task { @MainActor in self?.handleListenerState(state) } }
            listener.newConnectionHandler = { [weak self] connection in Task { @MainActor in self?.accept(connection) } }
            self.listener = listener
            listener.start(queue: .main)

            let browser = NWBrowser(for: .bonjour(type: serviceType, domain: nil), using: .tcp)
            browser.stateUpdateHandler = { [weak self] state in Task { @MainActor in if case .failed(let error) = state { self?.error = error.localizedDescription } } }
            browser.browseResultsChangedHandler = { [weak self] results, _ in Task { @MainActor in self?.browse(results) } }
            self.browser = browser
            browser.start(queue: .main)
            active = true
        } catch { self.error = "Unable to start local Exchange: \(error.localizedDescription)" }
    }

    func stop() {
        active = false
        listener?.cancel(); browser?.cancel(); listener = nil; browser = nil
        connections.values.forEach { $0.cancel() }; connections.removeAll(); connectionBuffers.removeAll(); connectedCount = 0
    }

    func save(_ contact: ExchangeContact, completion: @escaping (Result<Void, Error>) -> Void) {
        CNContactStore().requestAccess(for: .contacts) { granted, error in
            DispatchQueue.main.async {
                guard granted else { completion(.failure(error ?? NSError(domain: "enV.ContactExchange", code: 1, userInfo: [NSLocalizedDescriptionKey: "Contacts permission is required to save this contact."]))); return }
                let mutable = CNMutableContact()
                mutable.givenName = contact.fullName
                if !contact.phone.isEmpty { mutable.phoneNumbers = [CNLabeledValue(label: CNLabelPhoneNumberMobile, value: CNPhoneNumber(stringValue: contact.phone))] }
                if !contact.email.isEmpty { mutable.emailAddresses = [CNLabeledValue(label: CNLabelHome, value: contact.email as NSString)] }
                if !contact.company.isEmpty { mutable.organizationName = contact.company }
                if !contact.jobTitle.isEmpty { mutable.jobTitle = contact.jobTitle }
                if !contact.website.isEmpty { mutable.urlAddresses = [CNLabeledValue(label: CNLabelURLAddressHomePage, value: contact.website as NSString)] }
                do { let request = CNSaveRequest(); request.add(mutable, toContainerWithIdentifier: nil); try CNContactStore().execute(request); completion(.success(())) }
                catch { completion(.failure(error)) }
            }
        }
    }

    private func handleListenerState(_ state: NWListener.State) {
        if case .failed(let error) = state { self.error = error.localizedDescription; stop() }
    }

    private func browse(_ results: Set<NWBrowser.Result>) {
        guard active else { return }
        for result in results {
            guard case .service(let name, _, _, _) = result.endpoint, !name.contains(participantID.prefix(8)) else { continue }
            let connection = NWConnection(to: result.endpoint, using: .tcp)
            attach(connection)
            connection.start(queue: .main)
        }
    }

    private func accept(_ connection: NWConnection) { guard active else { connection.cancel(); return }; attach(connection); connection.start(queue: .main) }

    private func attach(_ connection: NWConnection) {
        let id = ObjectIdentifier(connection); connections[id] = connection; connectionBuffers[id] = Data()
        connection.stateUpdateHandler = { [weak self] state in Task { @MainActor in
            guard let self else { return }
            if case .ready = state { self.connectedCount = self.connections.values.filter { $0.state == .ready }.count; self.sendCard(connection) }
            if case .failed = state { self.connections.removeValue(forKey: id); self.connectionBuffers.removeValue(forKey: id); self.connectedCount = self.connections.values.filter { $0.state == .ready }.count }
            if case .cancelled = state { self.connections.removeValue(forKey: id); self.connectionBuffers.removeValue(forKey: id); self.connectedCount = self.connections.values.filter { $0.state == .ready }.count }
        } }
        receiveHeader(on: connection)
    }

    private func sendCard(_ connection: NWConnection) {
        let message: [String: Any] = ["version": protocolVersion, "kind": "contact-card", "participantId": participantID, "card": card]
        guard let payload = try? JSONSerialization.data(withJSONObject: message), payload.count <= maxCardBytes else { return }
        var frame = Data([UInt8(payload.count >> 24), UInt8(payload.count >> 16), UInt8(payload.count >> 8), UInt8(payload.count)])
        frame.append(payload)
        connection.send(content: frame, completion: .contentProcessed { [weak self] error in if let error { Task { @MainActor in self?.error = error.localizedDescription } } })
    }

    private func receiveHeader(on connection: NWConnection) {
        connection.receive(minimumIncompleteLength: 4, maximumLength: 4) { [weak self] data, _, isComplete, error in
            Task { @MainActor in
                guard let self, self.active, !isComplete || data != nil else { return }
                if let error { self.error = error.localizedDescription; return }
                guard let data, data.count == 4 else { return }
                let length = Int(data[0]) << 24 | Int(data[1]) << 16 | Int(data[2]) << 8 | Int(data[3])
                guard length > 0 && length <= self.maxCardBytes else { self.error = "A nearby participant sent an invalid contact frame."; connection.cancel(); return }
                self.receiveBody(on: connection, length: length)
            }
        }
    }

    private func receiveBody(on connection: NWConnection, length: Int) {
        connection.receive(minimumIncompleteLength: length, maximumLength: length) { [weak self] data, _, isComplete, error in
            Task { @MainActor in
                guard let self, self.active else { return }
                if let error { self.error = error.localizedDescription; return }
                guard !isComplete || data != nil, let data, data.count == length else { return }
                self.handlePayload(data)
                self.receiveHeader(on: connection)
            }
        }
    }

    private func handlePayload(_ data: Data) {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              object["version"] as? Int == protocolVersion,
              object["kind"] as? String == "contact-card",
              let remoteID = object["participantId"] as? String,
              remoteID != participantID, receivedIDs.insert(remoteID).inserted,
              let card = object["card"] as? [String: String] else { error = "A nearby participant sent an invalid contact card."; return }
        let allowed = Set(["fullName", "phone", "email", "company", "jobTitle", "website"])
        let safe = card.filter { allowed.contains($0.key) }.mapValues { String($0.prefix(2_000)) }
        received.append(ExchangeContact(id: remoteID, fullName: safe["fullName"] ?? "", phone: safe["phone"] ?? "", email: safe["email"] ?? "", company: safe["company"] ?? "", jobTitle: safe["jobTitle"] ?? "", website: safe["website"] ?? ""))
    }
}
