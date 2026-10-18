import Foundation
import Security

/// Device-bound P-256 signer for offline usage proofs. Private keys remain in Keychain;
/// signatures are ASN.1 DER ECDSA and are accepted by the server's shared verifier.
enum OfflineWalletDeviceKey {
    struct PublicJWK: Codable, Equatable {
        let kty = "EC"
        let crv = "P-256"
        let x: String
        let y: String
        let ext = true
        let key_ops = ["verify"]
    }

    private static func applicationTag(_ deviceKeyID: String) throws -> Data {
        guard deviceKeyID.range(of: "^[A-Za-z0-9_-]{8,100}$", options: .regularExpression) != nil else {
            throw OfflineWalletKeyError.invalidDeviceKeyID
        }
        return Data(("com.chastech.env.offline.p256." + deviceKeyID).utf8)
    }

    private static func loadOrCreatePrivateKey(deviceKeyID: String) throws -> SecKey {
        let tag = try applicationTag(deviceKeyID)
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: tag,
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecReturnRef as String: true
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecSuccess, let key = item as? SecKey { return key }
        guard status == errSecItemNotFound else { throw OfflineWalletKeyError.keychain(status) }

        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits as String: 256,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: tag,
                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            ]
        ]
        var error: Unmanaged<CFError>?
        guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
            throw OfflineWalletKeyError.generation(error?.takeRetainedValue())
        }
        return key
    }

    static func publicJWK(deviceKeyID: String) throws -> PublicJWK {
        let privateKey = try loadOrCreatePrivateKey(deviceKeyID: deviceKeyID)
        guard let publicKey = SecKeyCopyPublicKey(privateKey) else { throw OfflineWalletKeyError.publicKeyUnavailable }
        var error: Unmanaged<CFError>?
        guard let representation = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? else {
            throw OfflineWalletKeyError.generation(error?.takeRetainedValue())
        }
        // ANSI X9.63 uncompressed P-256 point: 0x04 || X(32) || Y(32).
        guard representation.count == 65, representation.first == 0x04 else { throw OfflineWalletKeyError.invalidPublicKey }
        return PublicJWK(x: base64URL(Data(representation[1..<33])), y: base64URL(Data(representation[33..<65])))
    }

    static func sign(deviceKeyID: String, message: String) throws -> String {
        let key = try loadOrCreatePrivateKey(deviceKeyID: deviceKeyID)
        var error: Unmanaged<CFError>?
        let input = Data(message.utf8) as CFData
        guard let signature = SecKeyCreateSignature(key, .ecdsaSignatureMessageX962SHA256, input, &error) as Data? else {
            throw OfflineWalletKeyError.signing(error?.takeRetainedValue())
        }
        return base64URL(signature)
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}

enum OfflineWalletKeyError: Error {
    case invalidDeviceKeyID
    case keychain(OSStatus)
    case generation(CFError?)
    case signing(CFError?)
    case publicKeyUnavailable
    case invalidPublicKey
}
