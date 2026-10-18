package com.chastech.env.billing

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class OfflineWalletWireProtocolTest {
    private fun fixture(): JSONObject {
        val stream = javaClass.classLoader?.getResourceAsStream("offline-protocol-v1-fixtures.json")
            ?: error("Shared offline protocol fixture was not found.")
        return stream.bufferedReader(Charsets.UTF_8).use { JSONObject(it.readText()) }
    }

    @Test fun transactionCanonicalBytesMatchSharedProtocolFixture() {
        val tx = fixture().getJSONObject("transaction")
        val record = OfflineWalletJournal.TransactionRecord(
            transactionId = tx.getString("transactionId"),
            sequenceNumber = tx.getLong("sequenceNumber"),
            toolId = tx.getString("toolId"),
            pricingVersion = tx.getString("pricingVersion"),
            unitCount = tx.getLong("unitCount"),
            outcome = tx.getString("outcome"),
            recordedAt = tx.getString("recordedAt"),
            signature = ""
        )
        assertEquals(tx.getString("canonical"), OfflineWalletWireProtocol.canonicalTransaction(tx.getString("allowanceId"), record))
    }

    @Test fun checkpointCanonicalBytesMatchSharedProtocolFixture() {
        val checkpoint = fixture().getJSONObject("checkpoint")
        assertEquals(checkpoint.getString("canonical"), OfflineWalletWireProtocol.canonicalCheckpoint(
            checkpoint.getString("allowanceId"), checkpoint.getLong("checkpointSequence"), checkpoint.getBoolean("finalized")))
    }
    @Test fun onlySequenceAndCheckpointMismatchesAllowBatchEnvelopeRetry() {
        assertEquals(true, OfflineWalletWireProtocol.isRecoverableBatchRejection("SEQUENCE_GAP"))
        assertEquals(true, OfflineWalletWireProtocol.isRecoverableBatchRejection("CHECKPOINT_SEQUENCE_MISMATCH"))
        assertEquals(false, OfflineWalletWireProtocol.isRecoverableBatchRejection("FINALIZATION_PROOF_REQUIRED"))
        assertEquals(false, OfflineWalletWireProtocol.isRecoverableBatchRejection("TRANSACTION_REPLAY_CONFLICT"))
    }

}
