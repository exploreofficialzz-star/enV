import XCTest
@testable import enV

final class GoogleSigningKeyGeneratorTests: XCTestCase {
    func testCompleteLocalHandoutIncludesExactBase64SecretsAndWorkflow() throws {
        let storePassword = "A-Strong-Store-Password-2026!"
        let keyPassword = "A-Different-Key-Password-2026!"
        let output = try NativeGoogleSigningKeyGenerator.generate(
            NativeGoogleSigningKeyInput(
                alias: "upload",
                storePassword: storePassword,
                keyPassword: keyPassword,
                commonName: "enV Android Upload",
                organization: "chAs Technologies LLC",
                organizationalUnit: "Mobile",
                city: "Port Harcourt",
                state: "Rivers",
                country: "NG",
                keySize: 2048,
                validityYears: 25
            )
        )

        XCTAssertEqual(Data(base64Encoded: output.keystoreBase64), output.keystore)
        XCTAssertTrue(output.githubSecrets.contains("ANDROID_KEYSTORE_BASE64=" + output.keystoreBase64))
        XCTAssertTrue(output.githubSecrets.contains("ANDROID_KEYSTORE_PASSWORD=" + storePassword))
        XCTAssertTrue(output.githubSecrets.contains("ANDROID_KEY_ALIAS=upload"))
        XCTAssertTrue(output.githubSecrets.contains("ANDROID_KEY_PASSWORD=" + keyPassword))
        XCTAssertTrue(output.githubSecrets.contains("\n"))
        XCTAssertFalse(output.githubSecrets.contains("\\n"))
        XCTAssertTrue(output.githubActionsWorkflow.contains("secrets.ANDROID_KEYSTORE_BASE64"))
        XCTAssertTrue(output.githubActionsWorkflow.contains("secrets.ANDROID_KEY_ALIAS"))
        XCTAssertTrue(output.githubActionsWorkflow.contains("bundleRelease"))
        XCTAssertTrue(output.githubActionsWorkflow.contains("working-directory: apps/android"))
        XCTAssertTrue(output.githubActionsWorkflow.contains("envRequireProductionSigning=true"))
        XCTAssertTrue(output.githubActionsWorkflow.contains("jarsigner -verify"))
        XCTAssertTrue(output.githubActionsWorkflow.contains("actions/upload-artifact@v4"))
        XCTAssertTrue(output.githubActionsWorkflow.contains("base64 --decode"))
        XCTAssertTrue(output.githubActionsWorkflow.contains("rm -f"))
        XCTAssertTrue(output.gradleKotlin.contains("ANDROID_KEYSTORE_FILE"))
        XCTAssertTrue(output.gradleKotlin.contains("ANDROID_KEY_ALIAS"))
        XCTAssertTrue(output.signingInfo.contains("SHA-256:"))
        XCTAssertTrue(output.handoutReadme.contains("Settings > Secrets and variables > Actions"))
    }
}
