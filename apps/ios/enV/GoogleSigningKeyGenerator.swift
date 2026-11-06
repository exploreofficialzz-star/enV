import Foundation
import CryptoKit
import Security
import SwiftUI
import UIKit
import UniformTypeIdentifiers
import ZIPFoundation


private struct NativeGoogleSigningKeyInputField: View {
    let title: String
    @Binding var text: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.footnote.weight(.medium))
            TextField(title, text: $text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(10)
                .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 9))
                .overlay(RoundedRectangle(cornerRadius: 9).stroke(Color.secondary.opacity(0.25)))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct NativeGoogleSigningKeyInput: Sendable {
    let alias: String
    let storePassword: String
    let keyPassword: String
    let commonName: String
    let organization: String
    let organizationalUnit: String
    let city: String
    let state: String
    let country: String
    let keySize: Int
    let validityYears: Int
}

struct NativeGoogleSigningKeyArtifacts: Sendable {
    let keystore: Data
    let keystoreBase64: String
    let githubSecrets: String
    let githubActionsWorkflow: String
    let handoutReadme: String
    let signingInfo: String
    let certificatePEM: String
    let sha1: String
    let sha256: String
    let alias: String
    let validUntil: Date
    let gradleKotlin: String
    let gradleGroovy: String
}

enum NativeGoogleSigningKeyGenerator {
    private static let keyProtectorOID = "1.3.6.1.4.1.42.2.17.1.1"
    private static let rsaEncryptionOID = "1.2.840.113549.1.1.1"
    private static let sha256WithRSAOID = "1.2.840.113549.1.1.11"

    static func generate(_ input: NativeGoogleSigningKeyInput) throws -> NativeGoogleSigningKeyArtifacts {
        guard input.alias.range(of: "^[A-Za-z0-9._-]{1,64}$", options: .regularExpression) != nil else {
            throw failure("Alias must use 1–64 letters, numbers, dots, underscores, or hyphens.")
        }
        func validPassword(_ value: String) -> Bool {
            value.count >= 12 && value.count <= 128 && value.unicodeScalars.allSatisfy { (0x20...0x7e).contains(Int($0.value)) }
        }
        guard validPassword(input.storePassword) else { throw failure("Use a keystore password of 12–128 printable ASCII characters.") }
        guard validPassword(input.keyPassword) else { throw failure("Use a private key password of 12–128 printable ASCII characters.") }
        guard !input.commonName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, input.commonName.count <= 128 else { throw failure("Enter a certificate owner name up to 128 characters.") }
        guard input.country.range(of: "^[A-Z]{2}$", options: .regularExpression) != nil else { throw failure("Country must be a two-letter uppercase ISO country code.") }
        guard [2048, 3072, 4096].contains(input.keySize) else { throw failure("Choose an RSA key size of 2048, 3072, or 4096 bits.") }
        guard (1...30).contains(input.validityYears) else { throw failure("Certificate validity must be from 1 to 30 years.") }

        let privateAttributes: [String: Any] = [kSecAttrIsPermanent as String: false]
        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
            kSecAttrKeySizeInBits as String: input.keySize,
            kSecPrivateKeyAttrs as String: privateAttributes,
        ]
        var keyError: Unmanaged<CFError>?
        guard let privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &keyError),
              let publicKey = SecKeyCopyPublicKey(privateKey) else {
            throw keyError?.takeRetainedValue() ?? failure("RSA key generation failed on this device.")
        }
        guard let privateRepresentation = SecKeyCopyExternalRepresentation(privateKey, &keyError) as Data?,
              let publicRepresentation = SecKeyCopyExternalRepresentation(publicKey, &keyError) as Data? else {
            throw keyError?.takeRetainedValue() ?? failure("The generated RSA key could not be exported for local keystore creation.")
        }

        let now = Date().addingTimeInterval(-300)
        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let validUntil = utcCalendar.date(byAdding: .year, value: input.validityYears, to: now) ?? now.addingTimeInterval(Double(input.validityYears) * 365.25 * 86400)
        let subjectFields: [(String, String)] = [
            ("CN", input.commonName.trimmingCharacters(in: .whitespacesAndNewlines)),
            ("OU", input.organizationalUnit.trimmingCharacters(in: .whitespacesAndNewlines)),
            ("O", input.organization.trimmingCharacters(in: .whitespacesAndNewlines)),
            ("L", input.city.trimmingCharacters(in: .whitespacesAndNewlines)),
            ("ST", input.state.trimmingCharacters(in: .whitespacesAndNewlines)),
            ("C", input.country),
        ].filter { !$0.1.isEmpty }

        let certificate = try makeCertificate(privateKey: privateKey, publicKey: publicRepresentation, subject: subjectFields, notBefore: now, notAfter: validUntil)
        var privateKeyInfo = sequence(integer(0), algorithmIdentifier(rsaEncryptionOID), octet(privateRepresentation))
        defer { privateKeyInfo.resetBytes(in: 0..<privateKeyInfo.count) }
        let protectedKey = try protectPrivateKey(privateKeyInfo, password: input.keyPassword)

        var body = data32(0xfeedfeed) + data32(2) + data32(1)
        body += data32(1) // PrivateKeyEntry
        body += try modifiedUTF8(input.alias)
        body += data64(UInt64(max(0, now.timeIntervalSince1970 * 1000)))
        body += data32(UInt32(protectedKey.count)) + protectedKey
        body += data32(1) + (try modifiedUTF8("X.509")) + data32(UInt32(certificate.count)) + certificate
        let integrity = Insecure.SHA1.hash(data: utf16BE(input.storePassword) + Data("Mighty Aphrodite".utf8) + body)
        let keystore = body + Data(integrity)
        let sha1 = fingerprint(Insecure.SHA1.hash(data: certificate))
        let sha256 = fingerprint(SHA256.hash(data: certificate))
        let gradleKotlin = """
android {
    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("ANDROID_KEYSTORE_FILE") ?? "upload-keystore.jks")
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("ANDROID_KEY_ALIAS") ?? "\(input.alias)"
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes {
        getByName("release") { signingConfig = signingConfigs.getByName("release") }
    }
}
"""
        let gradleGroovy = """
android {
    signingConfigs {
        release {
            storeFile file(System.getenv("ANDROID_KEYSTORE_FILE") ?? "upload-keystore.jks")
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS") ?? "\(input.alias)"
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes {
        release { signingConfig signingConfigs.release }
    }
}
"""
        let keystoreBase64 = keystore.base64EncodedString()
        let githubSecrets = """
# Paste each value into GitHub > Settings > Secrets and variables > Actions.
# Keep this file private. It contains passwords and the Base64 keystore.
ANDROID_KEYSTORE_BASE64=\(keystoreBase64)
ANDROID_KEYSTORE_PASSWORD=\(input.storePassword)
ANDROID_KEY_ALIAS=\(input.alias)
ANDROID_KEY_PASSWORD=\(input.keyPassword)
"""
        let signingInfo = """
Android upload-key certificate
Alias: \(input.alias)
RSA key size: \(input.keySize) bits
Valid until: \(ISO8601DateFormatter().string(from: validUntil))
SHA-1: \(sha1)
SHA-256: \(sha256)
"""
        let githubActionsWorkflow = """
name: Android release

on:
  workflow_dispatch:
  push:
    tags:
      - "v*"

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/android
    steps:
      - name: Check out source
        uses: actions/checkout@v4
      - name: Set up Java
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "21"
      - name: Set up Gradle
        uses: gradle/actions/setup-gradle@v4
      - name: Restore upload keystore
        env:
          ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
        run: |
          test -n "$ANDROID_KEYSTORE_BASE64"
          printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode > "$RUNNER_TEMP/upload-keystore.jks"
          chmod 600 "$RUNNER_TEMP/upload-keystore.jks"
      - name: Build signed Android App Bundle
        run: ./gradlew --no-daemon --max-workers=2 -PenvRequireProductionSigning=true :app:bundleRelease
        env:
          ANDROID_KEYSTORE_FILE: ${{ runner.temp }}/upload-keystore.jks
          ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
      - name: Verify signed Android App Bundle
        run: test -s app/build/outputs/bundle/release/app-release.aab && jarsigner -verify -certs app/build/outputs/bundle/release/app-release.aab
      - name: Upload signed App Bundle
        uses: actions/upload-artifact@v4
        with:
          name: android-release-${{ github.sha }}
          path: apps/android/app/build/outputs/bundle/release/app-release.aab
      - name: Remove signing material
        if: always()
        run: rm -f "$RUNNER_TEMP/upload-keystore.jks"
"""
        let handoutReadme = """
# Android upload-key handout

Generated locally by enV. This package contains sensitive signing material.

## Included files
- upload-keystore.jks — password-protected Android upload keystore.
- upload-keystore.base64.txt — one-line Base64 value for GitHub Actions.
- github-secrets.txt — exact secret names and values, including passwords.
- upload_certificate.pem — public certificate for Google Play Console.
- signing-info.txt — alias, validity and SHA fingerprints.
- release-signing.gradle.kts and release-signing.gradle — Gradle signing blocks.
- .github/workflows/android-release.yml — ready GitHub Actions release workflow.

## Add GitHub secrets
Open GitHub repository Settings > Secrets and variables > Actions > New repository secret.
Create ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, and ANDROID_KEY_PASSWORD using the matching values in github-secrets.txt. The Base64 value is one line. Do not add quotation marks or line breaks.

## Connect Gradle and Actions
Copy the matching signing block into the Android app module Gradle file, inside its existing android block. The workflow restores the JKS into the runner's temporary directory, builds bundleRelease, and removes the temporary file.

## Google Play
Upload upload_certificate.pem in Play Console when asked for the upload certificate. SHA-1 and SHA-256 are the upload certificate fingerprints.

## Keep private
This archive includes the JKS, its Base64 representation and both password values in github-secrets.txt. Anyone who obtains the package can attempt to use the upload key. Store it in private encrypted storage, never commit it to Git, and do not share it in public chats or issues. Base64 is encoding, not encryption.

This is the developer upload key. Google separately manages the Play App Signing key when Play App Signing is enabled.
"""
        return NativeGoogleSigningKeyArtifacts(
            keystore: keystore,
            keystoreBase64: keystoreBase64,
            githubSecrets: githubSecrets,
            githubActionsWorkflow: githubActionsWorkflow,
            handoutReadme: handoutReadme,
            signingInfo: signingInfo,
            certificatePEM: pem("CERTIFICATE", certificate),
            sha1: sha1,
            sha256: sha256,
            alias: input.alias,
            validUntil: validUntil,
            gradleKotlin: gradleKotlin,
            gradleGroovy: gradleGroovy
        )
    }

    private static func makeCertificate(privateKey: SecKey, publicKey: Data, subject: [(String, String)], notBefore: Date, notAfter: Date) throws -> Data {
        var serialValue = Data(try randomData(count: 16).enumerated().map { index, byte in index == 0 ? byte & 0x7f : byte })
        if serialValue.allSatisfy({ $0 == 0 }) { serialValue[serialValue.count - 1] = 1 }
        let keyUsage = sequence(oid("2.5.29.15"), der(0x01, Data([0xff])), octet(bitString(Data([0xa0]), unusedBits: 5)))
        let basicConstraints = sequence(oid("2.5.29.19"), der(0x01, Data([0xff])), octet(sequence()))
        let extendedKeyUsage = sequence(oid("2.5.29.37"), octet(sequence(oid("1.3.6.1.5.5.7.3.3"))))
        let subjectKeyIdentifier = sequence(oid("2.5.29.14"), octet(octet(Data(Insecure.SHA1.hash(data: publicKey)))))
        let extensions = der(0xa3, sequence(keyUsage, basicConstraints, extendedKeyUsage, subjectKeyIdentifier))
        let name = try distinguishedName(subject)
        let tbs = sequence(
            der(0xa0, integer(2)), integerBytes(serialValue), algorithmIdentifier(sha256WithRSAOID), name,
            sequence(certificateTime(notBefore), certificateTime(notAfter)), name,
            sequence(algorithmIdentifier(rsaEncryptionOID), bitString(publicKey)), extensions
        )
        var signError: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(privateKey, .rsaSignatureMessagePKCS1v15SHA256, tbs as CFData, &signError) as Data? else {
            throw signError?.takeRetainedValue() ?? failure("The upload certificate could not be signed.")
        }
        return sequence(tbs, algorithmIdentifier(sha256WithRSAOID), bitString(signature))
    }

    private static func protectPrivateKey(_ pkcs8: Data, password: String) throws -> Data {
        let passwordBytes = utf16BE(password)
        let salt = try randomData(count: 20)
        var previous = salt
        var encrypted = Data(count: pkcs8.count)
        let source = [UInt8](pkcs8)
        for offset in stride(from: 0, to: source.count, by: 20) {
            previous = Data(Insecure.SHA1.hash(data: passwordBytes + previous))
            let digest = [UInt8](previous)
            let end = min(offset + 20, source.count)
            for index in offset..<end { encrypted[index] = source[index] ^ digest[index - offset] }
        }
        let checksum = Data(Insecure.SHA1.hash(data: passwordBytes + pkcs8))
        let params = sequence(octet(salt), integer(1))
        return sequence(sequence(oid(keyProtectorOID), params), octet(salt + encrypted + checksum))
    }

    private static func distinguishedName(_ fields: [(String, String)]) throws -> Data {
        let oids = ["CN":"2.5.4.3", "OU":"2.5.4.11", "O":"2.5.4.10", "L":"2.5.4.7", "ST":"2.5.4.8", "C":"2.5.4.6"]
        return sequence(try fields.map { key, value -> Data in
            guard let identifier = oids[key] else { throw failure("Unsupported certificate subject field.") }
            let encoded = key == "C" ? der(0x13, Data(value.utf8)) : der(0x0c, Data(value.utf8))
            return der(0x31, sequence(oid(identifier), encoded))
        })
    }

    private static func certificateTime(_ date: Date) -> Data {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        let year = Calendar(identifier: .gregorian).component(.year, from: date)
        formatter.dateFormat = year >= 2050 ? "yyyyMMddHHmmss'Z'" : "yyMMddHHmmss'Z'"
        return der(year >= 2050 ? 0x18 : 0x17, Data(formatter.string(from: date).utf8))
    }

    private static func pem(_ label: String, _ value: Data) -> String {
        let base64 = value.base64EncodedString(options: [.lineLength64Characters, .endLineWithLineFeed])
        return "-----BEGIN \(label)-----\n\(base64)-----END \(label)-----\n"
    }
    private static func fingerprint<H: Sequence>(_ bytes: H) -> String where H.Element == UInt8 { bytes.map { String(format: "%02X", $0) }.joined(separator: ":") }
    private static func utf16BE(_ value: String) -> Data {
        var result = Data(); for codeUnit in value.utf16 { result.append(UInt8(codeUnit >> 8)); result.append(UInt8(codeUnit & 0xff)) }; return result
    }
    private static func modifiedUTF8(_ value: String) throws -> Data {
        guard value.unicodeScalars.allSatisfy({ $0.value >= 1 && $0.value <= 0x7f }) else { throw failure("Key alias must use ASCII letters, numbers, dots, underscores, or hyphens.") }
        let bytes = Data(value.utf8)
        guard bytes.count <= 65_535 else { throw failure("Key alias is too long.") }
        return Data([UInt8(bytes.count >> 8), UInt8(bytes.count & 0xff)]) + bytes
    }
    private static func randomData(count: Int) throws -> Data {
        var bytes = [UInt8](repeating: 0, count: count)
        let status = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        guard status == errSecSuccess else {
            throw failure("Secure random generation failed (OSStatus \\(status)).")
        }
        return Data(bytes)
    }
    private static func data32(_ value: UInt32) -> Data { Data([UInt8(value >> 24), UInt8((value >> 16) & 0xff), UInt8((value >> 8) & 0xff), UInt8(value & 0xff)]) }
    private static func data64(_ value: UInt64) -> Data { Data((0..<8).reversed().map { UInt8((value >> UInt64($0 * 8)) & 0xff) }) }
    private static func integer(_ value: Int) -> Data {
        var number = value; var bytes = [UInt8]()
        repeat { bytes.insert(UInt8(number & 0xff), at: 0); number >>= 8 } while number > 0
        if let first = bytes.first, first & 0x80 != 0 { bytes.insert(0, at: 0) }
        return der(0x02, Data(bytes))
    }
    private static func integerBytes(_ value: Data) -> Data {
        var bytes = Array(value); while bytes.count > 1 && bytes.first == 0 { bytes.removeFirst() }
        if let first = bytes.first, first & 0x80 != 0 { bytes.insert(0, at: 0) }
        return der(0x02, Data(bytes))
    }
    private static func oid(_ value: String) -> Data {
        let arcs = value.split(separator: ".").compactMap { UInt64($0) }
        guard arcs.count >= 2 else { return der(0x06, Data()) }
        var bytes = [UInt8]()
        func add(_ input: UInt64) { var n = input; var row = [UInt8(n & 0x7f)]; n >>= 7; while n > 0 { row.insert(UInt8((n & 0x7f) | 0x80), at: 0); n >>= 7 }; bytes.append(contentsOf: row) }
        add(arcs[0] * 40 + arcs[1]); arcs.dropFirst(2).forEach(add)
        return der(0x06, Data(bytes))
    }
    private static func algorithmIdentifier(_ algorithm: String) -> Data { sequence(oid(algorithm), der(0x05, Data())) }
    private static func sequence(_ items: Data...) -> Data { der(0x30, items.reduce(into: Data()) { $0 += $1 }) }
    private static func sequence(_ items: [Data]) -> Data { der(0x30, items.reduce(into: Data()) { $0 += $1 }) }
    private static func octet(_ value: Data) -> Data { der(0x04, value) }
    private static func bitString(_ value: Data, unusedBits: UInt8 = 0) -> Data { der(0x03, Data([unusedBits]) + value) }
    private static func der(_ tag: UInt8, _ value: Data) -> Data {
        var result = Data([tag]); let count = value.count
        if count < 128 { result.append(UInt8(count)) }
        else { var number = count; var bytes = [UInt8](); while number > 0 { bytes.insert(UInt8(number & 0xff), at: 0); number >>= 8 }; result.append(0x80 | UInt8(bytes.count)); result.append(contentsOf: bytes) }
        result += value; return result
    }
    private static func failure(_ message: String) -> NSError { NSError(domain: "GoogleSigningKey", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
}

private struct NativeSigningArtifactDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.data, .zip, .plainText] }
    let data: Data
    init(_ data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

struct NativeGoogleSigningKeyView: View {
    @State private var stage = 0
    @State private var alias = "upload"
    @State private var commonName = ""
    @State private var organization = ""
    @State private var organizationalUnit = ""
    @State private var city = ""
    @State private var state = ""
    @State private var country = "NG"
    @State private var storePassword = ""
    @State private var confirmStorePassword = ""
    @State private var keyPassword = ""
    @State private var confirmKeyPassword = ""
    @State private var keySize = 2048
    @State private var validityYears = 25
    @State private var artifacts: NativeGoogleSigningKeyArtifacts?
    @State private var errorMessage: String?
    @State private var notice = ""
    @State private var working = false
    @State private var showGroovy = false
    @State private var showMore = false
    @State private var exportKeystore = false
    @State private var exportCertificate = false
    @State private var exportArchive = false
    @State private var exportBase64 = false
    @State private var exportSecrets = false
    @State private var exportWorkflow = false
    @State private var exportInfo = false
    @State private var archiveData: Data?

    var body: some View {
        attachFileExporters(to: formContent)
    }

    private var formContent: some View {
        VStack(alignment: .leading, spacing: 10) {
            stepNavigation
            stageContent
            if let errorMessage, stage != 1 {
                Text(errorMessage).font(.caption).foregroundStyle(.red)
            }
        }
    }

    private var stepNavigation: some View {
        HStack(spacing: 6) {
            stepButton("Details", index: 0)
            stepButton("Protect", index: 1)
            stepButton("Export", index: 2)
        }
    }

    @ViewBuilder private var stageContent: some View {
        if stage == 0 {
            detailsStep
        } else if stage == 1 {
            protectStep
        } else if let artifacts {
            exportStep(artifacts)
        }
    }

    private var detailsStep: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                NativeGoogleSigningKeyInputField(title: "Alias", text: $alias)
                NativeGoogleSigningKeyInputField(title: "Country", text: $country)
            }
            NativeGoogleSigningKeyInputField(title: "Owner / publisher", text: $commonName)
            HStack(spacing: 8) {
                Picker("RSA", selection: $keySize) {
                    Text("2048").tag(2048); Text("3072").tag(3072); Text("4096").tag(4096)
                }.pickerStyle(.segmented)
                Picker("Validity", selection: $validityYears) {
                    ForEach([10, 15, 20, 25, 30], id: \.self) { Text("\($0)y").tag($0) }
                }.pickerStyle(.menu)
            }
            DisclosureGroup("More certificate details", isExpanded: $showMore) {
                HStack(spacing: 8) {
                    NativeGoogleSigningKeyInputField(title: "Organization", text: $organization)
                    NativeGoogleSigningKeyInputField(title: "Unit", text: $organizationalUnit)
                }
                HStack(spacing: 8) {
                    NativeGoogleSigningKeyInputField(title: "City", text: $city)
                    NativeGoogleSigningKeyInputField(title: "State / region", text: $state)
                }
            }
            Button("Continue") { stage = 1 }.buttonStyle(.borderedProminent)
                .disabled(commonName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }

    private var protectStep: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Set two separate passwords (12–128 characters).")
                .font(.caption).foregroundStyle(Color.envMuted)
            HStack(spacing: 8) {
                SecureField("Keystore password", text: $storePassword).textContentType(.newPassword).textFieldStyle(.roundedBorder)
                SecureField("Confirm", text: $confirmStorePassword).textContentType(.newPassword).textFieldStyle(.roundedBorder)
            }
            HStack(spacing: 8) {
                SecureField("Private key password", text: $keyPassword).textContentType(.newPassword).textFieldStyle(.roundedBorder)
                SecureField("Confirm", text: $confirmKeyPassword).textContentType(.newPassword).textFieldStyle(.roundedBorder)
            }
            if let errorMessage { Text(errorMessage).font(.caption).foregroundStyle(.red) }
            HStack {
                Button("Back") { stage = 0 }.buttonStyle(.bordered)
                Button {
                    generate()
                } label: {
                    HStack { if working { ProgressView() }; Text(working ? "Generating…" : "Generate key") }
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(working || commonName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || storePassword.isEmpty || keyPassword.isEmpty)
            }
        }
    }

    private func exportStep(_ artifacts: NativeGoogleSigningKeyArtifacts) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("\(artifacts.alias) · RSA \(keySize) · \(artifacts.validUntil.formatted(date: .abbreviated, time: .omitted))")
                .font(.caption).foregroundStyle(Color.envMuted)
            HStack(spacing: 8) {
                Button { exportArchive = true } label: { Label("Full ZIP", systemImage: "archivebox") }.buttonStyle(.borderedProminent)
                Button { exportKeystore = true } label: { Label("JKS", systemImage: "key.horizontal") }.buttonStyle(.bordered)
                Button { exportCertificate = true } label: { Label("PEM", systemImage: "doc.text") }.buttonStyle(.bordered)
            }
            HStack(spacing: 8) {
                Button { exportBase64 = true } label: { Label("Base64", systemImage: "doc.on.doc") }.buttonStyle(.bordered)
                Button { exportSecrets = true } label: { Label("GitHub secrets", systemImage: "key.fill") }.buttonStyle(.bordered)
                Button { exportWorkflow = true } label: { Label("Workflow", systemImage: "chevron.left.forwardslash.chevron.right") }.buttonStyle(.bordered)
            }
            HStack(spacing: 8) {
                Button { exportInfo = true } label: { Label("Info", systemImage: "info.circle") }.buttonStyle(.bordered)
                Button { UIPasteboard.general.string = artifacts.keystoreBase64; notice = "Base64 copied." } label: { Label("Copy Base64", systemImage: "doc.on.doc") }.buttonStyle(.bordered)
                Button { UIPasteboard.general.string = artifacts.githubSecrets; notice = "GitHub secrets copied. Keep them private." } label: { Label("Copy secrets", systemImage: "key") }.buttonStyle(.bordered)
            }
            DisclosureGroup("GitHub secrets") {
                Text(artifacts.githubSecrets).font(.system(.caption2, design: .monospaced)).textSelection(.enabled)
                Button("Copy all GitHub secrets") { UIPasteboard.general.string = artifacts.githubSecrets; notice = "GitHub secrets copied. Keep them private." }
            }
            DisclosureGroup("Keystore Base64") {
                Text(artifacts.keystoreBase64).font(.system(.caption2, design: .monospaced)).textSelection(.enabled)
                Button("Copy Base64") { UIPasteboard.general.string = artifacts.keystoreBase64; notice = "Base64 copied." }
            }
            DisclosureGroup("GitHub Actions workflow") {
                Text(artifacts.githubActionsWorkflow).font(.system(.caption2, design: .monospaced)).textSelection(.enabled)
                Button("Copy workflow") { UIPasteboard.general.string = artifacts.githubActionsWorkflow; notice = "Workflow copied." }
            }
            Text("Full ZIP includes Base64 and both password values. Keep it private; Base64 is not encryption.")
                .font(.caption2).foregroundStyle(Color.envMuted)
            DisclosureGroup("Fingerprints") {
                HStack {
                    Text("SHA-1").font(.caption.weight(.semibold))
                    Spacer()
                    Button("Copy") { UIPasteboard.general.string = artifacts.sha1; notice = "Copied." }.font(.caption)
                }
                Text(artifacts.sha1).font(.system(.caption2, design: .monospaced)).textSelection(.enabled).lineLimit(2)
                HStack {
                    Text("SHA-256").font(.caption.weight(.semibold))
                    Spacer()
                    Button("Copy") { UIPasteboard.general.string = artifacts.sha256; notice = "Copied." }.font(.caption)
                }
                Text(artifacts.sha256).font(.system(.caption2, design: .monospaced)).textSelection(.enabled).lineLimit(2)
            }
            DisclosureGroup("Gradle configuration") {
                Picker("Format", selection: $showGroovy) { Text("Kotlin DSL").tag(false); Text("Groovy").tag(true) }.pickerStyle(.segmented)
                Text(showGroovy ? artifacts.gradleGroovy : artifacts.gradleKotlin)
                    .font(.system(.caption2, design: .monospaced)).textSelection(.enabled)
                Button("Copy Gradle") { UIPasteboard.general.string = showGroovy ? artifacts.gradleGroovy : artifacts.gradleKotlin; notice = "Copied." }
            }
            Text("Full ZIP includes the Base64 keystore and both password values. Keep it private. Base64 is not encryption.")
                .font(.caption2).foregroundStyle(Color.envMuted)
            if !notice.isEmpty { Text(notice).font(.caption2).foregroundStyle(Color.envMuted) }
        }
    }

    private func attachFileExporters<Content: View>(to content: Content) -> some View {
        content
            .fileExporter(isPresented: $exportArchive, document: archiveData.map { NativeSigningArtifactDocument($0) }, contentType: .zip, defaultFilename: "android-upload-key-package.zip") { result in
                if case .failure(let error) = result { errorMessage = error.localizedDescription }
            }
            .fileExporter(isPresented: $exportKeystore, document: artifacts.map { NativeSigningArtifactDocument($0.keystore) }, contentType: .data, defaultFilename: "upload-keystore.jks") { result in
                if case .failure(let error) = result { errorMessage = error.localizedDescription }
            }
            .fileExporter(isPresented: $exportCertificate, document: artifacts.map { NativeSigningArtifactDocument(Data($0.certificatePEM.utf8)) }, contentType: .data, defaultFilename: "upload_certificate.pem") { result in
                if case .failure(let error) = result { errorMessage = error.localizedDescription }
            }
            .fileExporter(isPresented: $exportBase64, document: artifacts.map { NativeSigningArtifactDocument(Data($0.keystoreBase64.utf8)) }, contentType: .plainText, defaultFilename: "upload-keystore.base64.txt") { result in
                if case .failure(let error) = result { errorMessage = error.localizedDescription }
            }
            .fileExporter(isPresented: $exportSecrets, document: artifacts.map { NativeSigningArtifactDocument(Data($0.githubSecrets.utf8)) }, contentType: .plainText, defaultFilename: "github-secrets.txt") { result in
                if case .failure(let error) = result { errorMessage = error.localizedDescription }
            }
            .fileExporter(isPresented: $exportWorkflow, document: artifacts.map { NativeSigningArtifactDocument(Data($0.githubActionsWorkflow.utf8)) }, contentType: .plainText, defaultFilename: "android-release.yml") { result in
                if case .failure(let error) = result { errorMessage = error.localizedDescription }
            }
            .fileExporter(isPresented: $exportInfo, document: artifacts.map { NativeSigningArtifactDocument(Data($0.signingInfo.utf8)) }, contentType: .plainText, defaultFilename: "signing-info.txt") { result in
                if case .failure(let error) = result { errorMessage = error.localizedDescription }
            }
    }

    @ViewBuilder private func stepButton(_ title: String, index: Int) -> some View {
        Button(title) { if index != 2 || artifacts != nil { stage = index } }
            .buttonStyle(.borderedProminent)
            .tint(stage == index ? Color.envInk : Color.envSurface2)
            .foregroundStyle(stage == index ? Color.envSurface : Color.envInk)
            .frame(maxWidth: .infinity)
            .disabled(index == 2 && artifacts == nil)
    }

    private func generate() {
        errorMessage = nil; notice = ""; artifacts = nil
        guard storePassword == confirmStorePassword else { errorMessage = "Passwords do not match."; return }
        guard keyPassword == confirmKeyPassword else { errorMessage = "Private key passwords do not match."; return }
        let request = NativeGoogleSigningKeyInput(alias: alias, storePassword: storePassword, keyPassword: keyPassword, commonName: commonName, organization: organization, organizationalUnit: organizationalUnit, city: city, state: state, country: country.uppercased(), keySize: keySize, validityYears: validityYears)
        working = true
        Task.detached(priority: .userInitiated) {
            let result = Result { () throws -> (NativeGoogleSigningKeyArtifacts, Data) in
                let value = try NativeGoogleSigningKeyGenerator.generate(request)
                let zip = try Self.makeArchiveDetached(value)
                return (value, zip)
            }
            await MainActor.run {
                switch result {
                case .success(let pair): artifacts = pair.0; archiveData = pair.1; stage = 2; notice = "Created on this device. Nothing was uploaded."
                case .failure(let error): errorMessage = error.localizedDescription
                }
                storePassword = ""; confirmStorePassword = ""; keyPassword = ""; confirmKeyPassword = ""; working = false
            }
        }
    }

    nonisolated private static func makeArchiveDetached(_ value: NativeGoogleSigningKeyArtifacts) throws -> Data {
        let manager = FileManager.default
        let folder = manager.temporaryDirectory.appendingPathComponent("env-signing-\(UUID().uuidString)", isDirectory: true)
        try manager.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? manager.removeItem(at: folder) }
        let entries: [(String, Data)] = [
            ("upload-keystore.jks", value.keystore),
            ("upload-keystore.base64.txt", Data((value.keystoreBase64 + "\n").utf8)),
            ("upload_certificate.pem", Data(value.certificatePEM.utf8)),
            ("github-secrets.txt", Data(value.githubSecrets.utf8)),
            ("signing-info.txt", Data(value.signingInfo.utf8)),
            ("release-signing.gradle.kts", Data(value.gradleKotlin.utf8)),
            ("release-signing.gradle", Data(value.gradleGroovy.utf8)),
            (".github/workflows/android-release.yml", Data(value.githubActionsWorkflow.utf8)),
            (".gitignore-signing-example", Data(".android-signing/\n/upload-keystore.jks\n/*.jks\n/*.keystore\n".utf8)),
            ("README.md", Data(value.handoutReadme.utf8)),
        ]
        let archiveURL = folder.appendingPathComponent("package.zip")
        let archive = try Archive(url: archiveURL, accessMode: .create)
        for (name, data) in entries {
            let file = folder.appendingPathComponent(name)
            try data.write(to: file, options: .atomic)
            try archive.addEntry(with: name, fileURL: file, compressionMethod: .deflate, bufferSize: 64 * 1024)
        }
        return try Data(contentsOf: archiveURL)
    }
}
