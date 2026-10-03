import ExpoModulesCore
import MultipeerConnectivity

public class ContactExchangeModule: Module, MCSessionDelegate, MCNearbyServiceAdvertiserDelegate, MCNearbyServiceBrowserDelegate {
  private let serviceType = "env-contact"
  private let protocolVersion = 1
  private let maxCardBytes = 30_000
  private var participantId = ""
  private var active = false
  private var card: [String: String] = [:]
  private var receivedParticipants = Set<String>()
  private var session: MCSession?
  private var advertiser: MCNearbyServiceAdvertiser?
  private var browser: MCNearbyServiceBrowser?

  public func definition() -> ModuleDefinition {
    Name("ContactExchange")
    Events("onContactExchangeEvent")

    AsyncFunction("getPermissionState") { () -> Bool in true }
    AsyncFunction("requestPermissions") { () -> Bool in true }

    AsyncFunction("startExchange") { (profileJSON: String, fields: [String]) -> Bool in
      guard let profileData = profileJSON.data(using: .utf8),
            let profile = try? JSONSerialization.jsonObject(with: profileData) as? [String: String] else {
        self.emit(type: "error", data: ["message": "The contact profile is invalid."])
        return false
      }
      let allowed = Set(["fullName", "phone", "whatsapp", "email", "company", "jobTitle", "website", "socialLinks", "notes"])
      self.card = fields.filter { allowed.contains($0) }.reduce(into: [String: String]()) { result, key in
        let value = profile[key]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !value.isEmpty { result[key] = String(value.prefix(2_000)) }
      }
      guard !self.card.isEmpty else {
        self.emit(type: "error", data: ["message": "Select at least one non-empty contact field."])
        return false
      }
      guard let cardData = try? JSONSerialization.data(withJSONObject: self.card), cardData.count <= self.maxCardBytes else {
        self.emit(type: "error", data: ["message": "The selected contact card is too large."])
        return false
      }
      self.stopTransport()
      self.participantId = UUID().uuidString
      self.receivedParticipants.removeAll()
      self.active = true
      self.startTransport()
      self.emit(type: "active", data: ["participantId": self.participantId])
      return true
    }

    AsyncFunction("stopExchange") { () -> Bool in
      self.stopTransport()
      return true
    }
  }

  private func startTransport() {
    let peer = MCPeerID(displayName: "enV Exchange \(participantId.prefix(8))")
    let nextSession = MCSession(peer: peer, securityIdentity: nil, encryptionPreference: .required)
    nextSession.delegate = self
    session = nextSession
    let nextAdvertiser = MCNearbyServiceAdvertiser(peer: peer, discoveryInfo: ["v": String(protocolVersion)], serviceType: serviceType)
    nextAdvertiser.delegate = self
    advertiser = nextAdvertiser
    browser = MCNearbyServiceBrowser(peer: peer, serviceType: serviceType)
    browser?.delegate = self
    nextAdvertiser.startAdvertisingPeer()
    browser?.startBrowsingForPeers()
  }

  private func stopTransport() {
    active = false
    advertiser?.stopAdvertisingPeer()
    browser?.stopBrowsingForPeers()
    session?.disconnect()
    advertiser = nil
    browser = nil
    session = nil
    receivedParticipants.removeAll()
    emit(type: "stopped", data: [:])
  }

  private func sendCard(to peers: [MCPeerID]) {
    guard active, let session, !peers.isEmpty else { return }
    let message: [String: Any] = ["version": protocolVersion, "kind": "contact-card", "participantId": participantId, "card": card]
    guard let data = try? JSONSerialization.data(withJSONObject: message), data.count <= maxCardBytes else { return }
    try? session.send(data, toPeers: peers, with: .reliable)
  }

  private func emit(type: String, data: [String: Any]) {
    sendEvent("onContactExchangeEvent", ["type": type, "data": data])
  }

  public func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
    invitationHandler(active, session)
  }
  public func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
    emit(type: "error", data: ["message": error.localizedDescription])
  }
  public func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
    guard active, let session else { return }
    browser.invitePeer(peerID, to: session, withContext: nil, timeout: 30)
  }
  public func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
    emit(type: "participant-left", data: ["peer": peerID.displayName])
  }
  public func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
    emit(type: "error", data: ["message": error.localizedDescription])
  }
  public func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
    if state == .connected {
      sendCard(to: [peerID])
      emit(type: "connected", data: ["peer": peerID.displayName])
    } else if state == .notConnected {
      emit(type: "participant-left", data: ["peer": peerID.displayName])
    }
  }
  public func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
    guard data.count <= maxCardBytes,
          let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          object["version"] as? Int == protocolVersion,
          object["kind"] as? String == "contact-card",
          let remoteId = object["participantId"] as? String,
          let remoteCard = object["card"] as? [String: String],
          remoteId != participantId,
          receivedParticipants.insert(remoteId).inserted else { return }
    emit(type: "contact-received", data: ["participantId": remoteId, "card": remoteCard])
  }
  public func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
  public func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
  public func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}
