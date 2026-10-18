import Foundation
import XCTest
@testable import enV

final class OfflineWalletProtocolTests: XCTestCase {
    private struct Fixture: Decodable {
        struct Transaction: Decodable {
            let allowanceId: String
            let transactionId: String
            let sequenceNumber: Int64
            let toolId: String
            let pricingVersion: String
            let unitCount: Int64
            let outcome: String
            let recordedAt: String
            let canonical: String
        }
        struct Checkpoint: Decodable {
            let allowanceId: String
            let checkpointSequence: Int64
            let finalized: Bool
            let canonical: String
        }
        let version: Int
        let transaction: Transaction
        let checkpoint: Checkpoint
    }

    private func fixture() throws -> Fixture {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "offline-protocol-v1-fixtures", withExtension: "json"))
        return try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }

    func testTransactionCanonicalBytesMatchSharedProtocolFixture() throws {
        let item = try fixture().transaction
        let record = OfflineWalletJournal.TransactionRecord(transactionId: item.transactionId,
            sequenceNumber: item.sequenceNumber, toolId: item.toolId, pricingVersion: item.pricingVersion,
            unitCount: item.unitCount, outcome: item.outcome, recordedAt: item.recordedAt, signature: "")
        XCTAssertEqual(try OfflineWalletWireProtocol.canonicalTransaction(allowanceID: item.allowanceId, record: record), item.canonical)
    }

    func testCheckpointCanonicalBytesMatchSharedProtocolFixture() throws {
        let item = try fixture().checkpoint
        XCTAssertEqual(try OfflineWalletWireProtocol.canonicalCheckpoint(allowanceID: item.allowanceId,
            sequence: item.checkpointSequence, finalized: item.finalized), item.canonical)
    }
    func testOnlySequenceAndCheckpointMismatchesAllowBatchEnvelopeRetry() {
        XCTAssertTrue(OfflineWalletWireProtocol.isRecoverableBatchRejection("SEQUENCE_GAP"))
        XCTAssertTrue(OfflineWalletWireProtocol.isRecoverableBatchRejection("CHECKPOINT_SEQUENCE_MISMATCH"))
        XCTAssertFalse(OfflineWalletWireProtocol.isRecoverableBatchRejection("FINALIZATION_PROOF_REQUIRED"))
        XCTAssertFalse(OfflineWalletWireProtocol.isRecoverableBatchRejection("TRANSACTION_REPLAY_CONFLICT"))
    }

}
