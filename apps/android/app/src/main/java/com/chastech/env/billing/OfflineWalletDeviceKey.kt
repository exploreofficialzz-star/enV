package com.chastech.env.billing

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.math.BigInteger
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec

/** Device-bound P-256 key used only to sign offline journal records; private key material never leaves Android Keystore. */
object OfflineWalletDeviceKey {
    private const val STORE = "AndroidKeyStore"
    private const val ALIAS_PREFIX = "com.chastech.env.offline.p256."

    data class PublicJwk(val kty: String, val crv: String, val x: String, val y: String) {
        fun toJson(): JSONObject = JSONObject()
            .put("kty", kty).put("crv", crv).put("x", x).put("y", y)
            .put("ext", true).put("key_ops", org.json.JSONArray().put("verify"))
    }

    private fun alias(deviceKeyId: String): String {
        require(deviceKeyId.matches(Regex("[A-Za-z0-9_-]{8,100}"))) { "Invalid offline device key ID." }
        return ALIAS_PREFIX + deviceKeyId
    }

    fun createOrLoadPublicJwk(context: Context, deviceKeyId: String): PublicJwk {
        // Context is required in this API to make call sites explicit about device-scoped key ownership.
        context.applicationContext
        val keyAlias = alias(deviceKeyId)
        val store = KeyStore.getInstance(STORE).apply { load(null) }
        if (!store.containsAlias(keyAlias)) {
            val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, STORE)
            generator.initialize(
                KeyGenParameterSpec.Builder(
                    keyAlias,
                    KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
                )
                    .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .setUserAuthenticationRequired(false)
                    .build()
            )
            generator.generateKeyPair()
        }
        val certificate = store.getCertificate(keyAlias) ?: error("Offline signing certificate is missing.")
        val publicKey = certificate.publicKey as? ECPublicKey ?: error("Offline signing key is not P-256.")
        return PublicJwk(
            kty = "EC",
            crv = "P-256",
            x = base64Url(fixedCoordinate(publicKey.w.affineX)),
            y = base64Url(fixedCoordinate(publicKey.w.affineY)),
        )
    }

    /** Signature bytes are standard ASN.1 DER ECDSA, accepted by the server verifier. */
    fun signBase64Url(context: Context, deviceKeyId: String, canonicalPayload: String): String {
        context.applicationContext
        val store = KeyStore.getInstance(STORE).apply { load(null) }
        val privateKey = store.getKey(alias(deviceKeyId), null) ?: error("Offline signing key is missing; this allowance requires recovery.")
        val signer = Signature.getInstance("SHA256withECDSA")
        signer.initSign(privateKey as java.security.PrivateKey)
        signer.update(canonicalPayload.toByteArray(Charsets.UTF_8))
        return base64Url(signer.sign())
    }

    private fun fixedCoordinate(value: BigInteger): ByteArray {
        val source = value.toByteArray().let { if (it.size == 33 && it[0] == 0.toByte()) it.copyOfRange(1, 33) else it }
        require(source.size <= 32) { "Invalid P-256 coordinate length." }
        return ByteArray(32 - source.size) + source
    }

    private fun base64Url(value: ByteArray): String =
        Base64.encodeToString(value, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
}
