package com.chastech.env.engine

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.math.BigInteger
import java.nio.charset.StandardCharsets
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.Signature
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/** Creates a developer-held Android upload key entirely in memory. No key material is sent over a network. */
object GoogleSigningKeyGenerator {
    data class Input(
        val alias: String,
        val storePassword: String,
        val keyPassword: String,
        val commonName: String,
        val organization: String = "",
        val organizationalUnit: String = "",
        val city: String = "",
        val state: String = "",
        val country: String,
        val keySize: Int = 2048,
        val validityYears: Int = 25,
    )

    data class Artifacts(
        val keystore: ByteArray,
        val keystoreBase64: String,
        val githubSecrets: String,
        val githubActionsWorkflow: String,
        val handoutReadme: String,
        val signingInfo: String,
        val certificatePem: String,
        val sha1: String,
        val sha256: String,
        val alias: String,
        val validFrom: Date,
        val validUntil: Date,
        val gradleKotlin: String,
        val gradleGroovy: String,
    )

    fun generate(input: Input): Artifacts {
        require(input.alias.matches(Regex("[A-Za-z0-9._-]{1,64}"))) {
            "Alias must use 1–64 letters, numbers, dots, underscores, or hyphens."
        }
        fun validPassword(value: String) = value.length in 12..128 && value.all { it.code in 0x20..0x7e }
        require(validPassword(input.storePassword)) { "Use a keystore password of 12–128 printable ASCII characters." }
        require(validPassword(input.keyPassword)) { "Use a key password of 12–128 printable ASCII characters." }
        require(input.commonName.isNotBlank() && input.commonName.length <= 128) { "Enter a certificate owner name up to 128 characters." }
        require(input.country.matches(Regex("[A-Z]{2}"))) { "Country must be a two-letter uppercase ISO country code." }
        require(input.keySize in setOf(2048, 3072, 4096)) { "Choose an RSA key size of 2048, 3072, or 4096 bits." }
        require(input.validityYears in 1..30) { "Certificate validity must be from 1 to 30 years." }

        val generator = KeyPairGenerator.getInstance("RSA")
        generator.initialize(input.keySize, SecureRandom())
        val pair = generator.generateKeyPair()
        val now = System.currentTimeMillis()
        val validFrom = Date(now - 5 * 60_000L)
        val calendar = java.util.Calendar.getInstance(TimeZone.getTimeZone("UTC"), Locale.ROOT).apply {
            time = validFrom
            add(java.util.Calendar.YEAR, input.validityYears)
        }
        val validUntil = calendar.time
        val subject = listOf(
            "CN" to input.commonName.trim(), "OU" to input.organizationalUnit.trim(),
            "O" to input.organization.trim(), "L" to input.city.trim(),
            "ST" to input.state.trim(), "C" to input.country,
        ).filter { it.second.isNotEmpty() }
        val certificateDer = createCertificate(pair.private, pair.public.encoded, subject, validFrom, validUntil)
        val certificate = CertificateFactory.getInstance("X.509")
            .generateCertificate(ByteArrayInputStream(certificateDer)) as X509Certificate
        certificate.verify(pair.public)

        val storePassword = input.storePassword.toCharArray()
        val keyPassword = input.keyPassword.toCharArray()
        try {
            val keyStore = KeyStore.getInstance("JKS")
            keyStore.load(null, storePassword)
            keyStore.setKeyEntry(input.alias, pair.private, keyPassword, arrayOf(certificate))
            val output = ByteArrayOutputStream()
            output.use { keyStore.store(it, storePassword) }
            val sha1 = fingerprint("SHA-1", certificate.encoded)
            val sha256 = fingerprint("SHA-256", certificate.encoded)
            val gradleKotlin = """android {
    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("ANDROID_KEYSTORE_FILE") ?: "upload-keystore.jks")
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("ANDROID_KEY_ALIAS") ?: "${input.alias}"
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes {
        getByName("release") { signingConfig = signingConfigs.getByName("release") }
    }
}"""
            val gradleGroovy = """android {
    signingConfigs {
        release {
            storeFile file(System.getenv("ANDROID_KEYSTORE_FILE") ?: "upload-keystore.jks")
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS") ?: "${input.alias}"
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes {
        release { signingConfig signingConfigs.release }
    }
}"""
            val keystoreBytes = output.toByteArray()
            val keystoreBase64 = java.util.Base64.getEncoder().encodeToString(keystoreBytes)
            val githubSecrets = listOf(
                "# Paste each value into GitHub > Settings > Secrets and variables > Actions.",
                "# Keep this file private. It contains passwords and the Base64 keystore.",
                "ANDROID_KEYSTORE_BASE64=$keystoreBase64",
                "ANDROID_KEYSTORE_PASSWORD=${input.storePassword}",
                "ANDROID_KEY_ALIAS=${input.alias}",
                "ANDROID_KEY_PASSWORD=${input.keyPassword}",
            ).joinToString("\n", postfix = "\n")
            val signingInfo = listOf(
                "Android upload-key certificate",
                "Alias: ${input.alias}",
                "RSA key size: ${input.keySize} bits",
                "Valid from: ${validFrom.toInstant()}",
                "Valid until: ${validUntil.toInstant()}",
                "SHA-1: $sha1",
                "SHA-256: $sha256",
            ).joinToString("\n", postfix = "\n")
            val dollar = "$"
            val githubActionsWorkflow = listOf(
                "name: Android release",
                "",
                "on:",
                "  workflow_dispatch:",
                "  push:",
                "    tags:",
                "      - \"v*\"",
                "",
                "permissions:",
                "  contents: read",
                "",
                "jobs:",
                "  build:",
                "    runs-on: ubuntu-latest",
                "    steps:",
                "      - name: Check out source",
                "        uses: actions/checkout@v4",
                "      - name: Set up Java",
                "        uses: actions/setup-java@v4",
                "        with:",
                "          distribution: temurin",
                "          java-version: \"17\"",
                "      - name: Set up Gradle",
                "        uses: gradle/actions/setup-gradle@v4",
                "      - name: Restore upload keystore",
                "        env:",
                "          ANDROID_KEYSTORE_BASE64: " + dollar + "{{ secrets.ANDROID_KEYSTORE_BASE64 }}",
                "        run: |",
                "          test -n \"" + dollar + "ANDROID_KEYSTORE_BASE64\"",
                "          printf \"%s\" \"" + dollar + "ANDROID_KEYSTORE_BASE64\" | base64 --decode > \"" + dollar + "RUNNER_TEMP/upload-keystore.jks\"",
                "          chmod 600 \"" + dollar + "RUNNER_TEMP/upload-keystore.jks\"",
                "      - name: Build signed Android App Bundle",
                "        run: ./gradlew bundleRelease",
                "        env:",
                "          ANDROID_KEYSTORE_FILE: " + dollar + "{{ runner.temp }}/upload-keystore.jks",
                "          ANDROID_KEYSTORE_PASSWORD: " + dollar + "{{ secrets.ANDROID_KEYSTORE_PASSWORD }}",
                "          ANDROID_KEY_ALIAS: " + dollar + "{{ secrets.ANDROID_KEY_ALIAS }}",
                "          ANDROID_KEY_PASSWORD: " + dollar + "{{ secrets.ANDROID_KEY_PASSWORD }}",
                "      - name: Remove signing material",
                "        if: always()",
                "        run: rm -f \"" + dollar + "RUNNER_TEMP/upload-keystore.jks\"",
            ).joinToString("\n", postfix = "\n")
            val handoutReadme = listOf(
                "# Android upload-key handout",
                "",
                "Generated locally by enV. This package contains sensitive signing material.",
                "",
                "## Included files",
                "- upload-keystore.jks — password-protected Android upload keystore.",
                "- upload-keystore.base64.txt — one-line Base64 value for GitHub Actions.",
                "- github-secrets.txt — exact secret names and values, including passwords.",
                "- upload_certificate.pem — public upload certificate for Google Play Console.",
                "- signing-info.txt — alias, validity and SHA fingerprints.",
                "- release-signing.gradle.kts and release-signing.gradle — Gradle signing snippets.",
                "- .github/workflows/android-release.yml — ready GitHub Actions workflow.",
                "",
                "## Add GitHub secrets",
                "Open GitHub repository Settings > Secrets and variables > Actions > New repository secret.",
                "Create ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, and ANDROID_KEY_PASSWORD using github-secrets.txt.",
                "The Base64 value is one line. Do not add quotation marks or line breaks.",
                "",
                "## Connect Gradle and Actions",
                "Copy the matching signing block into the Android app module Gradle file, inside its existing android block.",
                "The workflow restores the JKS to the runner temporary directory, builds bundleRelease, and removes the temporary file.",
                "",
                "## Google Play",
                "Upload upload_certificate.pem in Play Console when asked for the upload certificate. SHA-1 and SHA-256 are its fingerprints.",
                "",
                "## Keep private",
                "This ZIP includes the JKS, its Base64 representation and both password values in github-secrets.txt.",
                "Store it in private encrypted storage, never commit it to Git, and never share it publicly. Base64 is encoding, not encryption.",
                "",
                "This is your developer upload key. Google separately manages the Play App Signing key when enabled."
            ).joinToString("\n", postfix = "\n")
            return Artifacts(keystoreBytes, keystoreBase64, githubSecrets, githubActionsWorkflow, handoutReadme, signingInfo, toPem(certificate.encoded), sha1, sha256, input.alias, validFrom, validUntil, gradleKotlin, gradleGroovy)
        } finally {
            storePassword.fill('\u0000')
            keyPassword.fill('\u0000')
        }
    }

    fun createHandoutZip(artifacts: Artifacts): ByteArray {
        val output = ByteArrayOutputStream()
        ZipOutputStream(output).use { zip ->
            fun add(name: String, value: ByteArray) {
                zip.putNextEntry(ZipEntry(name))
                zip.write(value)
                zip.closeEntry()
            }
            add("upload-keystore.jks", artifacts.keystore)
            add("upload-keystore.base64.txt", (artifacts.keystoreBase64 + "\n").toByteArray(Charsets.US_ASCII))
            add("upload_certificate.pem", artifacts.certificatePem.toByteArray(Charsets.US_ASCII))
            add("github-secrets.txt", artifacts.githubSecrets.toByteArray(Charsets.UTF_8))
            add("signing-info.txt", artifacts.signingInfo.toByteArray(Charsets.UTF_8))
            add("release-signing.gradle.kts", artifacts.gradleKotlin.toByteArray(Charsets.UTF_8))
            add("release-signing.gradle", artifacts.gradleGroovy.toByteArray(Charsets.UTF_8))
            add(".github/workflows/android-release.yml", artifacts.githubActionsWorkflow.toByteArray(Charsets.UTF_8))
            add(".gitignore-signing-example", ".android-signing/\n/upload-keystore.jks\n/*.jks\n/*.keystore\n".toByteArray(Charsets.UTF_8))
            add("README.md", artifacts.handoutReadme.toByteArray(Charsets.UTF_8))
        }
        return output.toByteArray()
    }

    private fun createCertificate(
        privateKey: java.security.PrivateKey,
        subjectPublicKeyInfo: ByteArray,
        subjectFields: List<Pair<String, String>>,
        notBefore: Date,
        notAfter: Date,
    ): ByteArray {
        val keyUsage = sequence(oid("2.5.29.15"), der(0x01, byteArrayOf(0xff.toByte())), octet(bitString(byteArrayOf(0xa0.toByte()), 5)))
        val basicConstraints = sequence(oid("2.5.29.19"), der(0x01, byteArrayOf(0xff.toByte())), octet(sequence()))
        val extendedKeyUsage = sequence(oid("2.5.29.37"), octet(sequence(oid("1.3.6.1.5.5.7.3.3"))))
        val publicKeyBits = subjectPublicKeyBits(subjectPublicKeyInfo)
        val subjectKeyId = sequence(oid("2.5.29.14"), octet(octet(sha1(publicKeyBits))))
        val extensions = der(0xa3, sequence(keyUsage, basicConstraints, extendedKeyUsage, subjectKeyId))
        val serialBytes = ByteArray(16).also { SecureRandom().nextBytes(it); it[0] = (it[0].toInt() and 0x7f).toByte(); if (it.all { b -> b == 0.toByte() }) it[15] = 1 }
        val tbs = sequence(
            der(0xa0, integer(BigInteger.valueOf(2))), integer(BigInteger(1, serialBytes)),
            algorithmIdentifier("1.2.840.113549.1.1.11"), distinguishedName(subjectFields),
            sequence(certificateTime(notBefore), certificateTime(notAfter)), distinguishedName(subjectFields),
            subjectPublicKeyInfo, extensions,
        )
        val signer = Signature.getInstance("SHA256withRSA")
        signer.initSign(privateKey, SecureRandom())
        signer.update(tbs)
        return sequence(tbs, algorithmIdentifier("1.2.840.113549.1.1.11"), bitString(signer.sign()))
    }

    private fun subjectPublicKeyBits(spki: ByteArray): ByteArray {
        val outer = readDer(spki, 0)
        require(outer.tag == 0x30)
        val algorithm = readDer(spki, outer.content)
        val bits = readDer(spki, algorithm.end)
        require(bits.tag == 0x03 && spki[bits.content].toInt() == 0)
        return spki.copyOfRange(bits.content + 1, bits.end)
    }

    private data class DerSpan(val tag: Int, val content: Int, val end: Int)
    private fun readDer(bytes: ByteArray, offset: Int): DerSpan {
        val tag = bytes[offset].toInt() and 0xff
        var length = bytes[offset + 1].toInt() and 0xff
        var header = 2
        if (length and 0x80 != 0) {
            val count = length and 0x7f
            length = 0
            for (index in 0 until count) length = length * 256 + (bytes[offset + 2 + index].toInt() and 0xff)
            header += count
        }
        return DerSpan(tag, offset + header, offset + header + length)
    }

    private fun distinguishedName(fields: List<Pair<String, String>>): ByteArray {
        val attributes = mapOf("CN" to "2.5.4.3", "OU" to "2.5.4.11", "O" to "2.5.4.10", "L" to "2.5.4.7", "ST" to "2.5.4.8", "C" to "2.5.4.6")
        return sequence(*fields.map { (key, value) ->
            val valueDer = if (key == "C") der(0x13, value.toByteArray(StandardCharsets.US_ASCII)) else der(0x0c, value.toByteArray(StandardCharsets.UTF_8))
            der(0x31, sequence(oid(attributes.getValue(key)), valueDer))
        }.toTypedArray())
    }

    private fun certificateTime(date: Date): ByteArray {
        val year = java.time.Instant.ofEpochMilli(date.time).atZone(java.time.ZoneOffset.UTC).year
        val pattern = if (year >= 2050) "yyyyMMddHHmmss'Z'" else "yyMMddHHmmss'Z'"
        val tag = if (year >= 2050) 0x18 else 0x17
        val formatter = java.time.format.DateTimeFormatter.ofPattern(pattern, Locale.ROOT).withZone(java.time.ZoneOffset.UTC)
        return der(tag, formatter.format(date.toInstant()).toByteArray(StandardCharsets.US_ASCII))
    }

    private fun algorithmIdentifier(algorithm: String) = sequence(oid(algorithm), der(0x05, byteArrayOf()))
    private fun sequence(vararg items: ByteArray) = der(0x30, items.fold(ByteArray(0)) { acc, item -> acc + item })
    private fun octet(value: ByteArray) = der(0x04, value)
    private fun bitString(value: ByteArray, unusedBits: Int = 0) = der(0x03, byteArrayOf(unusedBits.toByte()) + value)
    private fun integer(value: BigInteger): ByteArray = der(0x02, value.toByteArray())
    private fun der(tag: Int, value: ByteArray): ByteArray = byteArrayOf(tag.toByte()) + length(value.size) + value
    private fun length(value: Int): ByteArray {
        if (value < 128) return byteArrayOf(value.toByte())
        var current = value
        val bytes = ArrayList<Byte>()
        while (current > 0) { bytes.add(0, (current and 0xff).toByte()); current = current ushr 8 }
        return byteArrayOf((0x80 or bytes.size).toByte()) + bytes.toByteArray()
    }
    private fun oid(value: String): ByteArray {
        val arcs = value.split('.').map { it.toLong() }
        require(arcs.size >= 2 && arcs[0] in 0..2 && (arcs[0] == 2L || arcs[1] < 40))
        val bytes = ArrayList<Byte>()
        fun appendArc(input: Long) {
            var number = input
            val encoded = ArrayList<Byte>()
            encoded.add((number and 0x7f).toByte()); number = number ushr 7
            while (number > 0) { encoded.add(0, ((number and 0x7f) or 0x80).toByte()); number = number ushr 7 }
            bytes.addAll(encoded)
        }
        appendArc(arcs[0] * 40 + arcs[1]); arcs.drop(2).forEach(::appendArc)
        return der(0x06, bytes.toByteArray())
    }
    private fun sha1(data: ByteArray) = MessageDigest.getInstance("SHA-1").digest(data)
    private fun fingerprint(algorithm: String, data: ByteArray) = MessageDigest.getInstance(algorithm).digest(data).joinToString(":") { "%02X".format(it) }
    private fun toPem(value: ByteArray): String = "-----BEGIN CERTIFICATE-----\n" + java.util.Base64.getMimeEncoder(64, "\n".toByteArray()).encodeToString(value) + "\n-----END CERTIFICATE-----\n"
}
