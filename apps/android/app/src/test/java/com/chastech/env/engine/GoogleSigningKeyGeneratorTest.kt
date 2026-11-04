package com.chastech.env.engine

import java.io.ByteArrayInputStream
import java.security.KeyStore
import java.security.Signature
import java.security.cert.X509Certificate
import java.util.zip.ZipInputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GoogleSigningKeyGeneratorTest {
    @Test fun createsLoadableJksWithSeparatelyProtectedPrivateKeyAndCertificate() {
        val storePassword = "A-Strong-Store-Password-2026!"
        val keyPassword = "A-Different-Key-Password-2026!"
        val result = GoogleSigningKeyGenerator.generate(
            GoogleSigningKeyGenerator.Input(
                alias = "upload", storePassword = storePassword, keyPassword = keyPassword,
                commonName = "enV Android Upload", organization = "chAs Technologies LLC",
                organizationalUnit = "Mobile", city = "Port Harcourt", state = "Rivers",
                country = "NG", keySize = 2048, validityYears = 25,
            )
        )
        val keyStore = KeyStore.getInstance("JKS")
        keyStore.load(ByteArrayInputStream(result.keystore), storePassword.toCharArray())
        assertTrue(keyStore.isKeyEntry("upload"))
        val certificate = keyStore.getCertificate("upload") as X509Certificate
        certificate.verify(certificate.publicKey)
        assertTrue(certificate.subjectX500Principal.name.contains("CN=enV Android Upload"))
        val privateKey = keyStore.getKey("upload", keyPassword.toCharArray())
        assertNotNull(privateKey)
        val signature = Signature.getInstance("SHA256withRSA")
        signature.initSign(privateKey as java.security.PrivateKey)
        signature.update("enV upload keystore self-test".toByteArray())
        val signed = signature.sign()
        signature.initVerify(certificate.publicKey)
        signature.update("enV upload keystore self-test".toByteArray())
        assertTrue(signature.verify(signed))
        assertTrue(result.certificatePem.startsWith("-----BEGIN CERTIFICATE-----"))
        assertEquals(20, result.sha1.split(":").size)
        assertArrayEquals(result.keystore, java.util.Base64.getDecoder().decode(result.keystoreBase64))
        assertTrue(result.githubSecrets.contains("ANDROID_KEYSTORE_BASE64=" + result.keystoreBase64))
        assertTrue(result.githubSecrets.contains("ANDROID_KEYSTORE_PASSWORD=" + storePassword))
        assertTrue(result.githubSecrets.contains("ANDROID_KEY_ALIAS=upload"))
        assertTrue(result.githubSecrets.contains("ANDROID_KEY_PASSWORD=" + keyPassword))
        assertTrue(!result.githubSecrets.contains("\\n"))
        assertTrue(result.githubActionsWorkflow.contains("secrets.ANDROID_KEYSTORE_BASE64"))
        assertTrue(result.githubActionsWorkflow.contains("secrets.ANDROID_KEY_ALIAS"))
        assertTrue(result.githubActionsWorkflow.contains("bundleRelease"))
        assertTrue(result.githubActionsWorkflow.contains("working-directory: apps/android"))
        assertTrue(result.githubActionsWorkflow.contains("envRequireProductionSigning=true"))
        assertTrue(result.githubActionsWorkflow.contains("jarsigner -verify"))
        assertTrue(result.githubActionsWorkflow.contains("actions/upload-artifact@v4"))
        assertTrue(result.githubActionsWorkflow.contains("base64 --decode"))
        assertTrue(result.githubActionsWorkflow.contains("rm -f"))
        assertTrue(result.gradleKotlin.contains("ANDROID_KEYSTORE_FILE"))
        assertTrue(result.gradleKotlin.contains("ANDROID_KEY_ALIAS"))
        assertTrue(result.signingInfo.contains("SHA-256:"))
        assertTrue(result.handoutReadme.contains("Settings > Secrets and variables > Actions"))
        val zipFiles = mutableMapOf<String, ByteArray>()
        ZipInputStream(ByteArrayInputStream(GoogleSigningKeyGenerator.createHandoutZip(result))).use { zip ->
            var entry = zip.nextEntry
            while (entry != null) {
                zipFiles[entry.name] = zip.readBytes()
                zip.closeEntry()
                entry = zip.nextEntry
            }
        }
        assertArrayEquals(result.keystore, zipFiles["upload-keystore.jks"])
        assertEquals(result.keystoreBase64, zipFiles["upload-keystore.base64.txt"]?.toString(Charsets.US_ASCII)?.trim())
        assertEquals(result.githubSecrets, zipFiles["github-secrets.txt"]?.toString(Charsets.UTF_8))
        assertTrue(zipFiles.keys.contains("upload_certificate.pem"))
        assertTrue(zipFiles.keys.contains("signing-info.txt"))
        assertTrue(zipFiles.keys.contains("release-signing.gradle.kts"))
        assertTrue(zipFiles.keys.contains(".github/workflows/android-release.yml"))
        assertTrue(zipFiles.keys.contains("README.md"))
        assertTrue(zipFiles[".gitignore-signing-example"]?.toString(Charsets.UTF_8)?.contains("\n") == true)
        assertTrue(zipFiles[".gitignore-signing-example"]?.toString(Charsets.UTF_8)?.contains("\\n") == false)
        val entries = ZipInputStream(ByteArrayInputStream(GoogleSigningKeyGenerator.createHandoutZip(result))).use { zip ->
            val names = linkedSetOf<String>()
            var entry = zip.nextEntry
            while (entry != null) {
                names += entry.name
                entry = zip.nextEntry
            }
            names
        }
        assertTrue(entries.contains("upload-keystore.jks"))
        assertTrue(entries.contains("upload-keystore.base64.txt"))
        assertTrue(entries.contains("upload_certificate.pem"))
        assertTrue(entries.contains("github-secrets.txt"))
        assertTrue(entries.contains("signing-info.txt"))
        assertTrue(entries.contains(".github/workflows/android-release.yml"))
        assertTrue(entries.contains("release-signing.gradle.kts"))
        assertTrue(entries.contains("README.md"))
    }

    @Test fun rejectsWeakPasswordsAndUnsafeKeySettings() {
        val base = GoogleSigningKeyGenerator.Input(
            alias = "upload", storePassword = "A-Strong-Store-Password-2026!", keyPassword = "A-Different-Key-Password-2026!",
            commonName = "enV", country = "NG", keySize = 2048, validityYears = 25,
        )
        assertTrue(runCatching { GoogleSigningKeyGenerator.generate(base.copy(storePassword = "short")) }.isFailure)
        assertTrue(runCatching { GoogleSigningKeyGenerator.generate(base.copy(country = "Nigeria")) }.isFailure)
        assertTrue(runCatching { GoogleSigningKeyGenerator.generate(base.copy(keySize = 1024)) }.isFailure)
        assertTrue(runCatching { GoogleSigningKeyGenerator.generate(base.copy(validityYears = 0)) }.isFailure)
    }
}
