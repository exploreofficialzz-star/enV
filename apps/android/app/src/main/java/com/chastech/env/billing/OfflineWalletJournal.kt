package com.chastech.env.billing

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

/** Canonical v1 payloads shared byte-for-byte by Web, Android, iOS and the server. */
internal object OfflineWalletWireProtocol {
    /** Only these server rejection codes are safe for local batch-envelope replacement. */
    fun isRecoverableBatchRejection(reasonCode: String): Boolean =
        reasonCode == "SEQUENCE_GAP" || reasonCode == "CHECKPOINT_SEQUENCE_MISMATCH"

    fun canonicalTransaction(allowanceId: String, tx: OfflineWalletJournal.TransactionRecord): String = JSONArray()
        .put(allowanceId).put(tx.transactionId).put(tx.sequenceNumber).put(tx.toolId).put(tx.pricingVersion)
        .put(tx.unitCount).put(tx.outcome).put(tx.recordedAt).toString()

    fun canonicalCheckpoint(allowanceId: String, sequence: Long, finalized: Boolean): String =
        JSONArray().put(allowanceId).put(sequence).put(finalized).toString()
}

/**
 * Durable native offline journal. Persist the reserved operation BEFORE invoking a tool;
 * an abandoned PREPARING row is never guessed successful or refunded automatically.
 * Wallet settlement remains authoritative on the server.
 */
class OfflineWalletJournal(context: Context) : SQLiteOpenHelper(context.applicationContext, DB_NAME, null, DB_VERSION) {
    private val appContext = context.applicationContext
    data class OperationTicket(val allowanceId: String, val sequenceNumber: Long, val transactionId: String, val reservedSubunits: Long)
    data class TransactionRecord(
        val transactionId: String, val sequenceNumber: Long, val toolId: String, val pricingVersion: String,
        val unitCount: Long, val outcome: String, val recordedAt: String, val signature: String
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("transactionId", transactionId).put("sequenceNumber", sequenceNumber)
            .put("toolId", toolId).put("pricingVersion", pricingVersion).put("unitCount", unitCount)
            .put("outcome", outcome).put("recordedAt", recordedAt).put("signature", signature)
    }
    data class SyncBatch(
        val allowanceToken: String, val batchId: String, val transactions: List<TransactionRecord>,
        val checkpointSequence: Long, val checkpointSignature: String, val finalized: Boolean
    ) {
        fun toJson(): JSONObject = JSONObject().put("allowanceToken", allowanceToken).put("batchId", batchId)
            .put("transactions", JSONArray().also { array -> transactions.forEach { array.put(it.toJson()) } })
            .put("checkpointSequence", checkpointSequence).put("checkpointSignature", checkpointSignature).put("finalized", finalized)
    }

    data class EligibleTool(val billingKey: String, val subunitsPerUnit: Long)
    private data class AllowanceRow(
        val allowanceId: String, val deviceKeyId: String, val token: String, val subunits: Long,
        val pricingVersion: String, val issuedAt: String, val expiresAt: String, val nextSequence: Long, val lastAckSequence: Long,
        val spentSubunits: Long, val pendingSubunits: Long, val status: String, val pendingBatch: String?
    )

    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        db.setForeignKeyConstraintsEnabled(true)
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""CREATE TABLE offline_allowances (
            allowance_id TEXT PRIMARY KEY NOT NULL, device_key_id TEXT NOT NULL, allowance_token TEXT NOT NULL,
            allowance_subunits INTEGER NOT NULL CHECK(allowance_subunits > 0), pricing_version TEXT NOT NULL,
            issued_at TEXT NOT NULL, expires_at TEXT NOT NULL, next_sequence INTEGER NOT NULL DEFAULT 1,
            last_ack_sequence INTEGER NOT NULL DEFAULT 0, spent_subunits INTEGER NOT NULL DEFAULT 0,
            pending_subunits INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL,
            pending_batch_json TEXT, CHECK(spent_subunits + pending_subunits <= allowance_subunits)
        )""")
        db.execSQL("""CREATE TABLE offline_transactions (
            allowance_id TEXT NOT NULL REFERENCES offline_allowances(allowance_id), sequence_number INTEGER NOT NULL,
            transaction_id TEXT NOT NULL, tool_id TEXT NOT NULL, pricing_version TEXT NOT NULL, unit_count INTEGER NOT NULL,
            outcome TEXT, recorded_at TEXT NOT NULL, signature TEXT, reserved_subunits INTEGER NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('preparing','finishing','ready')),
            PRIMARY KEY(allowance_id, sequence_number), UNIQUE(allowance_id, transaction_id)
        )""")
        db.execSQL("CREATE INDEX offline_transactions_pending_idx ON offline_transactions(allowance_id, status, sequence_number)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Never silently open an old journal under a newer schema. A future migration must
        // explicitly preserve pending records, signatures, sequence high-water marks and reserves.
        if (newVersion > DB_VERSION) error("Offline wallet journal was created by a newer app version.")
        if (oldVersion < 1) onCreate(db)
        else if (oldVersion < DB_VERSION) error("Missing explicit offline wallet journal migration; preserve the database for recovery.")
    }

    fun installAllowance(
        allowanceId: String, deviceKeyId: String, token: String, allowanceSubunits: Long,
        pricingVersion: String, issuedAt: String, expiresAt: String
    ) {
        require(allowanceId.isNotBlank() && token.isNotBlank() && allowanceSubunits > 0)
        require(Instant.parse(expiresAt).isAfter(Instant.parse(issuedAt)))
        writableDatabase.beginTransaction()
        try {
            val existing = readAllowance(writableDatabase, allowanceId)
            if (existing != null) {
                check(existing.deviceKeyId == deviceKeyId && existing.subunits == allowanceSubunits && existing.token == token &&
                    existing.pricingVersion == pricingVersion && Instant.parse(existing.issuedAt) == Instant.parse(issuedAt) &&
                    Instant.parse(existing.expiresAt) == Instant.parse(expiresAt)) {
                    "An allowance ID cannot be rebound to different device, token, pricing, amount, or validity."
                }
            } else {
                writableDatabase.insertOrThrow("offline_allowances", null, ContentValues().apply {
                    put("allowance_id", allowanceId); put("device_key_id", deviceKeyId); put("allowance_token", token)
                    put("allowance_subunits", allowanceSubunits); put("pricing_version", pricingVersion)
                    put("issued_at", issuedAt); put("expires_at", expiresAt); put("status", "issued")
                })
            }
            writableDatabase.setTransactionSuccessful()
        } finally { writableDatabase.endTransaction() }
    }

    /** Only an existing, unexpired device allowance activates local metering. Without one, local tools remain free. */
    fun activeAllowanceId(): String? {
        val db = readableDatabase
        db.rawQuery("SELECT allowance_id FROM offline_allowances WHERE status IN ('issued','syncing') ORDER BY issued_at DESC", null).use { cursor ->
            while (cursor.moveToNext()) {
                val id = cursor.getString(0)
                val allowance = readAllowance(db, id) ?: continue
                if (runCatching { Instant.now().isBefore(Instant.parse(allowance.expiresAt)) }.getOrDefault(false)) return id
            }
        }
        return null
    }

    fun isEligibleTool(context: Context, toolId: String): Boolean = loadEligibility(context).second[toolId]?.billingKey == "local.calculator"

    fun pendingTransactionCount(allowanceId: String): Int = android.database.DatabaseUtils.longForQuery(readableDatabase,
        "SELECT COUNT(*) FROM offline_transactions WHERE allowance_id=? AND sequence_number > (SELECT last_ack_sequence FROM offline_allowances WHERE allowance_id=?)",
        arrayOf(allowanceId, allowanceId)).toInt()

    fun beginOperation(context: Context, allowanceId: String, toolId: String, unitCount: Long = 1): OperationTicket {
        require(toolId.matches(Regex("[A-Za-z0-9._-]{1,160}")) && unitCount == 1L) { "Protocol v1 meters one fixed-price invocation per signed record." }
        val (pricingVersion, eligibleTools) = loadEligibility(context)
        val profile = eligibleTools[toolId] ?: error("This tool is not approved for offline token metering.")
        require(profile.billingKey in setOf("local.calculator"))
        val cost = Math.multiplyExact(profile.subunitsPerUnit, unitCount)
        require(cost > 0)
        val db = writableDatabase
        db.beginTransaction()
        try {
            val allowance = readAllowance(db, allowanceId) ?: error("Offline allowance was not found.")
            check(allowance.status == "issued" || allowance.status == "syncing") { "Offline allowance requires synchronization or recovery." }
            check(allowance.pendingBatch?.let { JSONObject(it).optBoolean("finalized", false) } != true) {
                "Offline finalization has started; synchronize or recover before starting another operation."
            }
            check(Instant.now().isBefore(Instant.parse(allowance.expiresAt))) { "Offline allowance has expired." }
            check(allowance.pricingVersion == pricingVersion) { "Offline pricing version changed; connect to synchronize." }
            check(allowance.spentSubunits + allowance.pendingSubunits + cost <= allowance.subunits) { "Offline allowance is exhausted." }
            val sequence = allowance.nextSequence
            val transactionId = UUID.randomUUID().toString().replace("-", "")
            val recordedAt = Instant.now().toString().let { normalizeUtcMillis(it) }
            db.insertOrThrow("offline_transactions", null, ContentValues().apply {
                put("allowance_id", allowanceId); put("sequence_number", sequence); put("transaction_id", transactionId)
                put("tool_id", toolId); put("pricing_version", allowance.pricingVersion); put("unit_count", unitCount)
                putNull("outcome"); put("recorded_at", recordedAt); putNull("signature"); put("reserved_subunits", cost); put("status", "preparing")
            })
            val changed = db.update("offline_allowances", ContentValues().apply {
                put("next_sequence", sequence + 1); put("pending_subunits", allowance.pendingSubunits + cost)
            }, "allowance_id=? AND next_sequence=?", arrayOf(allowanceId, sequence.toString()))
            check(changed == 1) { "Offline sequence allocation lost its database lock; no operation should start." }
            db.setTransactionSuccessful()
            return OperationTicket(allowanceId, sequence, transactionId, cost)
        } finally { db.endTransaction() }
    }

    fun finishOperation(context: Context, ticket: OperationTicket, outcome: String): TransactionRecord {
        require(outcome == "succeeded" || outcome == "failed")
        val db = writableDatabase
        var record: TransactionRecord
        var deviceKeyId: String
        db.beginTransaction()
        try {
            val allowance = readAllowance(db, ticket.allowanceId) ?: error("Offline allowance is missing.")
            deviceKeyId = allowance.deviceKeyId
            val row = readTransaction(db, ticket.allowanceId, ticket.sequenceNumber) ?: error("Offline operation ticket is missing.")
            if (row.status == "ready") {
                check(row.outcome == outcome) { "This offline operation already has a different committed outcome." }
                record = row.toRecord()
                db.setTransactionSuccessful()
            } else {
                if (row.status == "preparing") {
                    check(allowance.pendingSubunits >= row.reservedSubunits) { "Offline pending balance invariant failed." }
                    // Outcome is telemetry only: the client can sign a forged failure, so every
                    // durably started metered operation consumes its reserved cost.
                    val newSpent = Math.addExact(allowance.spentSubunits, row.reservedSubunits)
                    db.update("offline_allowances", ContentValues().apply {
                        put("pending_subunits", allowance.pendingSubunits - row.reservedSubunits); put("spent_subunits", newSpent)
                    }, "allowance_id=?", arrayOf(ticket.allowanceId))
                    db.update("offline_transactions", ContentValues().apply {
                        put("outcome", outcome); put("status", "finishing")
                    }, "allowance_id=? AND sequence_number=? AND status='preparing'", arrayOf(ticket.allowanceId, ticket.sequenceNumber.toString()))
                } else check(row.status == "finishing" && row.outcome == outcome) { "This offline operation is already being committed differently." }
                record = row.copy(outcome = outcome, signature = "").toRecord()
                db.setTransactionSuccessful()
            }
        } finally { db.endTransaction() }
        if (record.signature.isNotEmpty()) return record
        val signature = OfflineWalletDeviceKey.signBase64Url(context, deviceKeyId, OfflineWalletWireProtocol.canonicalTransaction(ticket.allowanceId, record))
        val saveDb = writableDatabase
        saveDb.beginTransaction()
        try {
            val current = readTransaction(saveDb, ticket.allowanceId, ticket.sequenceNumber)
                ?: error("Offline operation disappeared while saving its signature.")
            check(current.outcome == outcome) { "Offline operation outcome changed while saving its signature." }
            if (current.status == "finishing") {
                saveDb.update("offline_transactions", ContentValues().apply { put("signature", signature); put("status", "ready") },
                    "allowance_id=? AND sequence_number=? AND status='finishing' AND outcome=?",
                    arrayOf(ticket.allowanceId, ticket.sequenceNumber.toString(), outcome))
            } else check(current.status == "ready") { "Offline operation is not in a signable state." }
            val saved = readTransaction(saveDb, ticket.allowanceId, ticket.sequenceNumber)
            check(saved != null && saved.status == "ready" && saved.outcome == outcome && saved.signature.isNotEmpty()) {
                "Offline operation signature was not durably stored."
            }
            saveDb.setTransactionSuccessful()
            return saved.toRecord()
        } finally { saveDb.endTransaction() }
    }

    fun repairFinishingOperations(context: Context, allowanceId: String): Pair<Int, Int> {
        val db = readableDatabase
        val allowance = readAllowance(db, allowanceId) ?: return 0 to 0
        val rows = mutableListOf<Pair<Long, TransactionRow>>()
        db.rawQuery("SELECT sequence_number, transaction_id, tool_id, pricing_version, unit_count, outcome, recorded_at, signature, reserved_subunits, status FROM offline_transactions WHERE allowance_id=? ORDER BY sequence_number", arrayOf(allowanceId)).use { cursor ->
            while (cursor.moveToNext()) if (cursor.getString(9) == "finishing") rows += cursor.getLong(0) to TransactionRow(
                cursor.getString(1), cursor.getLong(0), cursor.getString(2), cursor.getString(3), cursor.getLong(4),
                cursor.getString(5), cursor.getString(6), cursor.getString(7) ?: "", cursor.getLong(8), cursor.getString(9))
        }
        var repaired = 0
        rows.forEach { (sequence, row) ->
            val outcome = row.outcome ?: error("A finishing record has no committed outcome.")
            val record = row.toRecord()
            val signature = OfflineWalletDeviceKey.signBase64Url(context, allowance.deviceKeyId, OfflineWalletWireProtocol.canonicalTransaction(allowanceId, record))
            db.update("offline_transactions", ContentValues().apply { put("signature", signature); put("status", "ready") },
                "allowance_id=? AND sequence_number=? AND status='finishing'", arrayOf(allowanceId, sequence.toString()))
            repaired++
        }
        val unresolved = android.database.DatabaseUtils.longForQuery(db,
            "SELECT COUNT(*) FROM offline_transactions WHERE allowance_id=? AND status='preparing'", arrayOf(allowanceId)).toInt()
        return repaired to unresolved
    }

    fun buildSyncBatch(allowanceId: String, finalize: Boolean): SyncBatch {
        val db = writableDatabase
        // Serialize the read -> sequence validation -> signature -> pending-batch checkpoint.
        // Without a single write transaction, concurrent callers could upload distinct batches
        // for the same records and overwrite the durable retry ID.
        db.beginTransaction()
        try {
            val allowance = readAllowance(db, allowanceId) ?: error("Offline allowance was not found.")
            allowance.pendingBatch?.let { pending ->
                val existing = parseBatch(allowance, pending)
                db.setTransactionSuccessful()
                return existing
            }
            val all = readTransactionsAfter(db, allowanceId, allowance.lastAckSequence)
            check(all.none { it.status != "ready" }) { "Offline journal contains an unresolved operation; do not sync or finalize it." }
            var expected = allowance.lastAckSequence + 1
            all.forEach { row -> check(row.sequenceNumber == expected++) { "Offline journal has a missing sequence; reserved tokens remain protected." } }
            check(allowance.nextSequence - 1 == expected - 1) { "Offline journal tail is missing; reserved tokens remain protected." }
            val chosen = all.take(MAX_BATCH)
            val actualFinalize = finalize && all.size <= MAX_BATCH
            val checkpoint = chosen.lastOrNull()?.sequenceNumber ?: allowance.lastAckSequence
            val checkpointSignature = OfflineWalletDeviceKey.signBase64Url(appContext, allowance.deviceKeyId,
                OfflineWalletWireProtocol.canonicalCheckpoint(allowanceId, checkpoint, actualFinalize))
            val batch = SyncBatch(allowance.token, UUID.randomUUID().toString().replace("-", ""), chosen.map { it.toRecord() }, checkpoint, checkpointSignature, actualFinalize)
            val sequenceArray = JSONArray().apply { chosen.forEach { put(it.sequenceNumber) } }
            val stored = JSONObject().put("batchId", batch.batchId).put("checkpointSequence", checkpoint)
                .put("finalized", actualFinalize).put("sequenceNumbers", sequenceArray).put("checkpointSignature", checkpointSignature).toString()
            val changed = db.update("offline_allowances", ContentValues().apply { put("pending_batch_json", stored); put("status", "syncing") }, "allowance_id=? AND pending_batch_json IS NULL", arrayOf(allowanceId))
            check(changed == 1) { "Could not persist the pending sync batch; retry without deleting local records." }
            db.setTransactionSuccessful()
            return batch
        } finally { db.endTransaction() }
    }

    /** Delete local rows only after an acknowledged server response for the exact saved batch. */
    fun acknowledgeSyncBatch(allowanceId: String, batchId: String, resultStatus: String) {
        require(resultStatus == "syncing" || resultStatus == "reconciled") { "The server has not accepted this batch." }
        val db = writableDatabase
        db.beginTransaction()
        try {
            val allowance = readAllowance(db, allowanceId) ?: error("Offline allowance is missing.")
            val saved = allowance.pendingBatch?.let(::JSONObject) ?: error("No pending batch is saved.")
            check(saved.optString("batchId") == batchId) { "Server acknowledgement does not match the saved batch." }
            val sequences = saved.getJSONArray("sequenceNumbers")
            for (i in 0 until sequences.length()) db.delete("offline_transactions", "allowance_id=? AND sequence_number=?",
                arrayOf(allowanceId, sequences.getLong(i).toString()))
            db.update("offline_allowances", ContentValues().apply {
                put("last_ack_sequence", maxOf(allowance.lastAckSequence, saved.getLong("checkpointSequence")))
                putNull("pending_batch_json"); put("status", resultStatus)
            }, "allowance_id=?", arrayOf(allowanceId))
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }

    /**
     * The server may safely ask for a fresh envelope only for a sequence/checkpoint repair.
     * This clears the batch wrapper, NOT any transaction rows, spent amounts, or sequence counters.
     * Other rejection reasons remain locked for support/manual recovery.
     */
    fun prepareRetryAfterRecoverableRejection(allowanceId: String, batchId: String, reasonCode: String) {
        require(OfflineWalletWireProtocol.isRecoverableBatchRejection(reasonCode)) {
            "This rejection requires support recovery; local records must be preserved."
        }
        val db = writableDatabase
        db.beginTransaction()
        try {
            val allowance = readAllowance(db, allowanceId) ?: error("Offline allowance is missing.")
            val storedJson = allowance.pendingBatch ?: error("No pending sync batch is saved.")
            val saved = JSONObject(storedJson)
            check(saved.optString("batchId") == batchId) { "Rejection does not match the exact saved batch." }
            check(allowance.status != "reconciled") { "A reconciled allowance cannot be changed locally." }
            val changed = db.update("offline_allowances", ContentValues().apply {
                putNull("pending_batch_json")
                put("status", "syncing")
            }, "allowance_id=? AND pending_batch_json=? AND status!='reconciled'", arrayOf(allowanceId, storedJson))
            check(changed == 1) { "Could not safely replace the rejected batch envelope." }
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }

    fun markNeedsRecovery(allowanceId: String) {
        writableDatabase.update("offline_allowances", ContentValues().apply { put("status", "needs_recovery") },
            "allowance_id=? AND status!='reconciled'", arrayOf(allowanceId))
    }

    override fun close() { super.close() }

    private fun loadEligibility(context: Context): Pair<String, Map<String, EligibleTool>> {
        val json = context.assets.open("offline-eligible-tools.json").bufferedReader(Charsets.UTF_8).use { it.readText() }
        val root = JSONObject(json)
        val version = root.getString("pricingVersion")
        val array = root.getJSONArray("profiles")
        val profiles = HashMap<String, EligibleTool>(array.length())
        for (i in 0 until array.length()) {
            val item = array.getJSONObject(i)
            val id = item.getString("toolId")
            val rate = item.getLong("subunitsPerUnit")
            check(id.matches(Regex("[A-Za-z0-9._-]{1,160}")) && rate > 0)
            check(profiles.put(id, EligibleTool(item.getString("billingKey"), rate)) == null) { "Offline pricing index contains duplicate tool IDs." }
        }
        check(root.getInt("toolCount") == profiles.size) { "Offline pricing index count does not match contents." }
        return version to profiles
    }

    private fun readAllowance(db: SQLiteDatabase, allowanceId: String): AllowanceRow? = db.rawQuery(
        "SELECT allowance_id, device_key_id, allowance_token, allowance_subunits, pricing_version, issued_at, expires_at, next_sequence, last_ack_sequence, spent_subunits, pending_subunits, status, pending_batch_json FROM offline_allowances WHERE allowance_id=?",
        arrayOf(allowanceId)).use { cursor -> if (!cursor.moveToFirst()) null else AllowanceRow(
            cursor.getString(0), cursor.getString(1), cursor.getString(2), cursor.getLong(3), cursor.getString(4), cursor.getString(5), cursor.getString(6),
            cursor.getLong(7), cursor.getLong(8), cursor.getLong(9), cursor.getLong(10), cursor.getString(11), cursor.getString(12).takeUnless { cursor.isNull(12) }) }

    private data class TransactionRow(
        val transactionId: String, val sequenceNumber: Long, val toolId: String, val pricingVersion: String,
        val unitCount: Long, val outcome: String?, val recordedAt: String, val signature: String,
        val reservedSubunits: Long, val status: String
    ) { fun toRecord() = TransactionRecord(transactionId, sequenceNumber, toolId, pricingVersion, unitCount, outcome ?: "succeeded", recordedAt, signature) }

    private fun readTransaction(db: SQLiteDatabase, allowanceId: String, sequence: Long): TransactionRow? = db.rawQuery(
        "SELECT transaction_id, sequence_number, tool_id, pricing_version, unit_count, outcome, recorded_at, signature, reserved_subunits, status FROM offline_transactions WHERE allowance_id=? AND sequence_number=?",
        arrayOf(allowanceId, sequence.toString())).use { cursor -> if (!cursor.moveToFirst()) null else TransactionRow(
            cursor.getString(0), cursor.getLong(1), cursor.getString(2), cursor.getString(3), cursor.getLong(4),
            cursor.getString(5).takeUnless { cursor.isNull(5) }, cursor.getString(6), cursor.getString(7) ?: "", cursor.getLong(8), cursor.getString(9)) }

    private fun readTransactionsAfter(db: SQLiteDatabase, allowanceId: String, ack: Long): List<TransactionRow> = db.rawQuery(
        "SELECT transaction_id, sequence_number, tool_id, pricing_version, unit_count, outcome, recorded_at, signature, reserved_subunits, status FROM offline_transactions WHERE allowance_id=? AND sequence_number>? ORDER BY sequence_number",
        arrayOf(allowanceId, ack.toString())).use { cursor -> buildList {
            while (cursor.moveToNext()) add(TransactionRow(cursor.getString(0), cursor.getLong(1), cursor.getString(2), cursor.getString(3),
                cursor.getLong(4), cursor.getString(5).takeUnless { cursor.isNull(5) }, cursor.getString(6), cursor.getString(7) ?: "", cursor.getLong(8), cursor.getString(9)))
        } }

    private fun parseBatch(allowance: AllowanceRow, stored: String): SyncBatch {
        val json = JSONObject(stored); val sequenceNumbers = json.getJSONArray("sequenceNumbers")
        val rows = (0 until sequenceNumbers.length()).mapNotNull { readTransaction(writableDatabase, allowance.allowanceId, sequenceNumbers.getLong(it)) }
        check(rows.size == sequenceNumbers.length() && rows.all { it.status == "ready" }) { "Saved offline batch records are missing; recovery is required." }
        return SyncBatch(allowance.token, json.getString("batchId"), rows.map { it.toRecord() }, json.getLong("checkpointSequence"),
            json.getString("checkpointSignature"), json.getBoolean("finalized"))
    }

    private fun normalizeUtcMillis(value: String): String {
        val instant = Instant.parse(value)
        return java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(java.time.ZoneOffset.UTC).format(instant)
    }

    companion object {
        private const val DB_NAME = "env_offline_wallet_v1.db"
        private const val DB_VERSION = 1
        private const val MAX_BATCH = 250
    }
}
