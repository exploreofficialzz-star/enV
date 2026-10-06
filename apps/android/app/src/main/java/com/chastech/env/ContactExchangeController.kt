package com.chastech.env

import android.Manifest
import android.content.ContentProviderOperation
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.*
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

private const val EXCHANGE_SERVICE_ID = "com.chastech.env.contact-exchange.v1"
private const val EXCHANGE_PROTOCOL_VERSION = 1
private const val MAX_CARD_BYTES = 30_000

/** Native Android transport for Instant Contact Exchange. Both peers must explicitly activate Exchange. */
class ContactExchangeController(private val context: Context) {
    data class Card(val fullName: String, val phone: String, val email: String, val company: String, val jobTitle: String, val website: String) {
        fun selected(): JSONObject = JSONObject().apply {
            putIfNotBlank("fullName", fullName); putIfNotBlank("phone", phone); putIfNotBlank("email", email)
            putIfNotBlank("company", company); putIfNotBlank("jobTitle", jobTitle); putIfNotBlank("website", website)
        }
        private fun JSONObject.putIfNotBlank(key: String, value: String) { if (value.isNotBlank()) put(key, value.trim().take(2_000)) }
    }
    data class Received(val participantId: String, val card: Card)
    var active = false; private set
    var participantId = ""; private set
    val connectedParticipants = mutableSetOf<String>()
    val received = mutableListOf<Received>()
    var error: String? = null
    var onChanged: (() -> Unit)? = null

    private val client by lazy { Nearby.getConnectionsClient(context) }
    private val endpoints = ConcurrentHashMap.newKeySet<String>()
    private val receivedIds = ConcurrentHashMap.newKeySet<String>()
    private var card = JSONObject()

    fun requiredPermissions(): Array<String> = buildList {
        if (Build.VERSION.SDK_INT >= 31) {
            add(Manifest.permission.BLUETOOTH_SCAN); add(Manifest.permission.BLUETOOTH_CONNECT); add(Manifest.permission.BLUETOOTH_ADVERTISE)
            if (Build.VERSION.SDK_INT == 31) add(Manifest.permission.ACCESS_FINE_LOCATION)
        } else if (Build.VERSION.SDK_INT >= 29) add(Manifest.permission.ACCESS_FINE_LOCATION) else add(Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.NEARBY_WIFI_DEVICES)
    }.toTypedArray()

    fun hasTransportPermissions(): Boolean = requiredPermissions().all { context.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }
    fun hasContactWritePermission(): Boolean = Build.VERSION.SDK_INT < 23 || context.checkSelfPermission(Manifest.permission.WRITE_CONTACTS) == PackageManager.PERMISSION_GRANTED

    fun start(nextCard: Card): Boolean {
        if (!hasTransportPermissions()) { fail("Nearby device permissions are required before Exchange can start."); return false }
        val selected = nextCard.selected()
        if (selected.length() == 0) { fail("Add at least one contact field before activating Exchange."); return false }
        val raw = selected.toString().toByteArray(StandardCharsets.UTF_8)
        if (raw.size > MAX_CARD_BYTES) { fail("The selected contact card is too large."); return false }
        stop(false)
        card = selected; participantId = UUID.randomUUID().toString(); active = true; error = null; endpoints.clear(); receivedIds.clear()
        val name = "enV Exchange ${participantId.take(8)}"
        client.startAdvertising(name, EXCHANGE_SERVICE_ID, lifecycle, AdvertisingOptions.Builder().setStrategy(Strategy.P2P_CLUSTER).build())
            .addOnFailureListener { fail(it.message ?: "Nearby advertising failed.") }
        client.startDiscovery(EXCHANGE_SERVICE_ID, discovery, DiscoveryOptions.Builder().setStrategy(Strategy.P2P_CLUSTER).build())
            .addOnFailureListener { fail(it.message ?: "Nearby discovery failed.") }
        changed(); return true
    }

    fun stop(emit: Boolean = true) {
        active = false; client.stopAdvertising(); client.stopDiscovery(); client.stopAllEndpoints(); endpoints.clear(); connectedParticipants.clear();
        if (emit) changed()
    }

    fun saveContact(received: Received): Result<Unit> = runCatching {
        if (!hasContactWritePermission()) error("Contacts permission is required to save this contact.")
        val ops = ArrayList<ContentProviderOperation>()
        ops += ContentProviderOperation.newInsert(android.provider.ContactsContract.RawContacts.CONTENT_URI).withValue(android.provider.ContactsContract.RawContacts.ACCOUNT_TYPE, null).withValue(android.provider.ContactsContract.RawContacts.ACCOUNT_NAME, null).build()
        fun add(type: String, value: String, extra: Pair<String, String>? = null) {
            if (value.isBlank()) return
            var builder = ContentProviderOperation.newInsert(android.provider.ContactsContract.Data.CONTENT_URI)
                .withValueBackReference(android.provider.ContactsContract.Data.RAW_CONTACT_ID, 0)
                .withValue(android.provider.ContactsContract.Data.MIMETYPE, type)
                .withValue(android.provider.ContactsContract.Data.DATA1, value.trim())
            if (extra != null) builder = builder.withValue(extra.first, extra.second)
            ops += builder.build()
        }
        add(android.provider.ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE, received.card.fullName)
        add(android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE, received.card.phone)
        add(android.provider.ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE, received.card.email)
        add(android.provider.ContactsContract.CommonDataKinds.Organization.CONTENT_ITEM_TYPE, received.card.company, android.provider.ContactsContract.CommonDataKinds.Organization.TITLE to received.card.jobTitle)
        context.contentResolver.applyBatch(android.provider.ContactsContract.AUTHORITY, ops)
        Unit
    }

    private val discovery = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            if (!active || endpoints.contains(endpointId)) return
            client.requestConnection("enV Exchange ${participantId.take(8)}", endpointId, lifecycle)
                .addOnFailureListener { fail(it.message ?: "Nearby connection failed.") }
        }
        override fun onEndpointLost(endpointId: String) { endpoints.remove(endpointId); connectedParticipants.remove(endpointId); changed() }
    }

    private val lifecycle = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
            if (active) client.acceptConnection(endpointId, payloads) else client.rejectConnection(endpointId)
        }
        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            if (!active || result.status.statusCode != ConnectionsStatusCodes.STATUS_OK) { endpoints.remove(endpointId); return }
            endpoints.add(endpointId); connectedParticipants.add(endpointId); send(endpointId); changed()
        }
        override fun onDisconnected(endpointId: String) { endpoints.remove(endpointId); connectedParticipants.remove(endpointId); changed() }
    }

    private val payloads = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            val bytes = payload.asBytes() ?: return
            if (bytes.size > MAX_CARD_BYTES) { fail("A nearby participant sent an oversized contact card."); return }
            runCatching {
                val message = JSONObject(String(bytes, StandardCharsets.UTF_8))
                require(message.optInt("version") == EXCHANGE_PROTOCOL_VERSION && message.optString("kind") == "contact-card")
                val remoteId = message.optString("participantId")
                require(remoteId.isNotBlank() && remoteId != participantId && receivedIds.add(remoteId))
                val remote = message.optJSONObject("card") ?: error("Missing contact card")
                val allowed = setOf("fullName","phone","email","company","jobTitle","website")
                val safe = allowed.associateWith { remote.optString(it, "").take(2_000) }
                received += Received(remoteId, Card(safe["fullName"].orEmpty(), safe["phone"].orEmpty(), safe["email"].orEmpty(), safe["company"].orEmpty(), safe["jobTitle"].orEmpty(), safe["website"].orEmpty()))
                changed()
            }.onFailure { fail("A nearby participant sent an invalid contact card.") }
        }
        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) = Unit
    }

    private fun send(endpointId: String) {
        if (!active) return
        val bytes = JSONObject().apply { put("version", EXCHANGE_PROTOCOL_VERSION); put("kind", "contact-card"); put("participantId", participantId); put("card", card) }.toString().toByteArray(StandardCharsets.UTF_8)
        if (bytes.size <= MAX_CARD_BYTES) client.sendPayload(endpointId, Payload.fromBytes(bytes))
    }
    private fun fail(message: String) { error = message; changed() }
    private fun changed() { onChanged?.invoke() }
}
