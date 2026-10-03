package com.chastech.env.contactexchange

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.ConnectionInfo
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionResolution
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo
import com.google.android.gms.nearby.connection.DiscoveryOptions
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadCallback
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import com.google.android.gms.nearby.connection.Strategy
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class ContactExchangeModule : Module() {
  companion object {
    private const val EVENT = "onContactExchangeEvent"
    private const val SERVICE_ID = "com.chastech.env.contact-exchange.v1"
    private const val PROTOCOL_VERSION = 1
    private const val MAX_CARD_BYTES = 30_000
    private val CARD_FIELDS = setOf("fullName", "phone", "whatsapp", "email", "company", "jobTitle", "website", "socialLinks", "notes")
  }

  private val strategy = Strategy.P2P_CLUSTER
  private val connectedEndpoints = ConcurrentHashMap.newKeySet<String>()
  private val receivedParticipants = ConcurrentHashMap.newKeySet<String>()
  private var participantId = ""
  private var active = false
  private var card = JSONObject()

  override fun definition() = ModuleDefinition {
    Name("ContactExchange")
    Events(EVENT)

    AsyncFunction("getPermissionState") { hasPermissions() }
    AsyncFunction("requestPermissions") { requestPermissionsIfNeeded(); true }

    AsyncFunction("startExchange") { profileJson: String, fields: List<String> ->
      if (!hasPermissions()) {
        requestPermissionsIfNeeded()
        emit("permission-needed", mapOf("message" to "Nearby device permissions are required before Exchange can start."))
        return@AsyncFunction false
      }
      val profile = JSONObject(profileJson)
      val selectedCard = JSONObject()
      fields.distinct().filter { it in CARD_FIELDS }.forEach { field ->
        val value = profile.optString(field, "").trim()
        if (value.isNotEmpty()) selectedCard.put(field, value)
      }
      if (selectedCard.length() == 0) {
        emit("error", mapOf("message" to "Select at least one non-empty contact field."))
        return@AsyncFunction false
      }
      if (selectedCard.toString().toByteArray(StandardCharsets.UTF_8).size > MAX_CARD_BYTES) {
        emit("error", mapOf("message" to "The selected contact card is too large."))
        return@AsyncFunction false
      }
      card = selectedCard
      participantId = UUID.randomUUID().toString()
      connectedEndpoints.clear()
      receivedParticipants.clear()
      active = true
      startTransport()
      emit("active", mapOf("participantId" to participantId))
      true
    }

    AsyncFunction("stopExchange") { stopTransport(); true }
  }

  private fun context() = appContext.reactContext ?: throw IllegalStateException("React context is unavailable")
  private fun client() = Nearby.getConnectionsClient(context())

  private fun startTransport() {
    val endpointName = "enV Exchange ${participantId.take(8)}"
    client().startAdvertising(endpointName, SERVICE_ID, lifecycleCallback, AdvertisingOptions.Builder().setStrategy(strategy).build())
      .addOnFailureListener { emit("error", mapOf("message" to (it.message ?: "Nearby advertising failed."))) }
    client().startDiscovery(SERVICE_ID, discoveryCallback, DiscoveryOptions.Builder().setStrategy(strategy).build())
      .addOnFailureListener { emit("error", mapOf("message" to (it.message ?: "Nearby discovery failed."))) }
  }

  private val discoveryCallback = object : EndpointDiscoveryCallback() {
    override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
      if (!active || connectedEndpoints.contains(endpointId)) return
      client().requestConnection("enV Exchange $participantId", endpointId, lifecycleCallback)
        .addOnFailureListener { emit("error", mapOf("message" to (it.message ?: "Nearby connection failed."))) }
    }
    override fun onEndpointLost(endpointId: String) {
      if (connectedEndpoints.remove(endpointId)) emit("participant-left", mapOf("endpointId" to endpointId))
    }
  }

  private val lifecycleCallback = object : ConnectionLifecycleCallback() {
    override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
      if (active) client().acceptConnection(endpointId, payloadCallback) else client().rejectConnection(endpointId)
    }
    override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
      if (!active || result.status.statusCode != ConnectionsStatusCodes.STATUS_OK) {
        connectedEndpoints.remove(endpointId)
        return
      }
      connectedEndpoints.add(endpointId)
      sendCard(endpointId)
      emit("connected", mapOf("endpointId" to endpointId))
    }
    override fun onDisconnected(endpointId: String) {
      connectedEndpoints.remove(endpointId)
      emit("participant-left", mapOf("endpointId" to endpointId))
    }
  }

  private val payloadCallback = object : PayloadCallback() {
    override fun onPayloadReceived(endpointId: String, payload: Payload) {
      val bytes = payload.asBytes() ?: return
      if (bytes.size > MAX_CARD_BYTES) return
      try {
        val message = JSONObject(String(bytes, StandardCharsets.UTF_8))
        if (message.optInt("version") != PROTOCOL_VERSION || message.optString("kind") != "contact-card") return
        val remoteId = message.optString("participantId")
        if (remoteId.isBlank() || remoteId == participantId || !receivedParticipants.add(remoteId)) return
        val remoteCard = message.optJSONObject("card") ?: return
        val safeCard = JSONObject()
        val keys = remoteCard.keys()
        while (keys.hasNext()) {
          val key = keys.next()
          if (key in CARD_FIELDS) safeCard.put(key, remoteCard.optString(key).take(2_000))
        }
        emit("contact-received", mapOf("participantId" to remoteId, "card" to safeCard.toString()))
      } catch (_: Exception) {
        emit("error", mapOf("message" to "A nearby participant sent an invalid contact card."))
      }
    }
    override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) = Unit
  }

  private fun sendCard(endpointId: String) {
    if (!active) return
    val payload = JSONObject().apply {
      put("version", PROTOCOL_VERSION)
      put("kind", "contact-card")
      put("participantId", participantId)
      put("card", card)
    }.toString().toByteArray(StandardCharsets.UTF_8)
    if (payload.size <= MAX_CARD_BYTES) client().sendPayload(endpointId, Payload.fromBytes(payload))
  }

  private fun stopTransport() {
    active = false
    client().stopAdvertising()
    client().stopDiscovery()
    client().stopAllEndpoints()
    connectedEndpoints.clear()
    receivedParticipants.clear()
    emit("stopped", emptyMap<String, Any>())
  }

  private fun requiredPermissions(): List<String> = buildList {
    if (Build.VERSION.SDK_INT >= 31) {
      add(Manifest.permission.BLUETOOTH_SCAN)
      add(Manifest.permission.BLUETOOTH_CONNECT)
      add(Manifest.permission.BLUETOOTH_ADVERTISE)
      if (Build.VERSION.SDK_INT == 31) add(Manifest.permission.ACCESS_FINE_LOCATION)
    } else if (Build.VERSION.SDK_INT >= 29) add(Manifest.permission.ACCESS_FINE_LOCATION)
    else add(Manifest.permission.ACCESS_COARSE_LOCATION)
    if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.NEARBY_WIFI_DEVICES)
  }

  private fun hasPermissions() = requiredPermissions().all { context().checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }

  private fun requestPermissionsIfNeeded() {
    val activity = appContext.currentActivity ?: return
    val missing = requiredPermissions().filter { context().checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
    if (missing.isNotEmpty()) activity.requestPermissions(missing.toTypedArray(), 1984)
  }

  private fun emit(type: String, data: Map<String, Any?>) {
    sendEvent(EVENT, mapOf("type" to type, "data" to data))
  }
}
