import Foundation
import SQLite3

/// iOS offline journal. An operation is persisted before it runs; unresolved records prevent
/// finalization. This type does not enable charging or bypass the server's production lock.
final class OfflineWalletJournal {
    struct Allowance {
        let allowanceID: String
        let deviceKeyID: String
        let token: String
        let allowanceSubunits: Int64
        let pricingVersion: String
        let issuedAt: String
        let expiresAt: String
    }

    struct OperationTicket {
        let allowanceID: String
        let sequenceNumber: Int64
        let transactionID: String
        let reservedSubunits: Int64
    }

    struct TransactionRecord: Codable, Equatable {
        let transactionId: String
        let sequenceNumber: Int64
        let toolId: String
        let pricingVersion: String
        let unitCount: Int64
        let outcome: String
        let recordedAt: String
        let signature: String
    }

    struct SyncBatch: Codable {
        let allowanceToken: String
        let batchId: String
        let transactions: [TransactionRecord]
        let checkpointSequence: Int64
        let checkpointSignature: String
        let finalized: Bool
    }

    private struct EligibleIndex: Decodable {
        let pricingVersion: String
        let toolCount: Int
        let profiles: [EligibleProfile]
    }

    private struct EligibleProfile: Decodable {
        let toolId: String
        let billingKey: String
        let subunitsPerUnit: Int64
    }

    private struct AllowanceRow {
        let allowanceID: String
        let deviceKeyID: String
        let token: String
        let allowanceSubunits: Int64
        let pricingVersion: String
        let issuedAt: String
        let expiresAt: String
        let nextSequence: Int64
        let lastAckSequence: Int64
        let spentSubunits: Int64
        let pendingSubunits: Int64
        let status: String
        let pendingBatchJSON: String?
    }

    private struct TransactionRow {
        let transactionId: String
        let sequenceNumber: Int64
        let toolId: String
        let pricingVersion: String
        let unitCount: Int64
        let outcome: String?
        let recordedAt: String
        let signature: String
        let reservedSubunits: Int64
        let status: String

        var record: TransactionRecord {
            TransactionRecord(transactionId: transactionId, sequenceNumber: sequenceNumber,
                              toolId: toolId, pricingVersion: pricingVersion, unitCount: unitCount,
                              outcome: outcome ?? "succeeded", recordedAt: recordedAt, signature: signature)
        }
    }

    private struct PendingBatch: Codable {
        let batchId: String
        let checkpointSequence: Int64
        let finalized: Bool
        let sequenceNumbers: [Int64]
        let checkpointSignature: String
    }

    private let lock = NSRecursiveLock()
    private var database: OpaquePointer?
    private let pricingVersion: String
    private let eligibleByID: [String: EligibleProfile]
    private let allowedBillingKeys: Set<String> = ["local.calculator"]
    private let maxBatchRecords = 250
    private static let schemaVersion: Int64 = 1

    init(databaseURL: URL? = nil, bundle: Bundle = .main) throws {
        let indexURL = bundle.url(forResource: "offline-eligible-tools", withExtension: "json")
        guard let indexURL else { throw OfflineWalletJournalError.eligibilityIndexMissing }
        let index = try JSONDecoder().decode(EligibleIndex.self, from: Data(contentsOf: indexURL))
        guard index.toolCount == index.profiles.count,
              Set(index.profiles.map(\.toolId)).count == index.profiles.count,
              index.profiles.allSatisfy({ $0.subunitsPerUnit > 0 && Self.allowedToolKey($0.billingKey) }) else {
            throw OfflineWalletJournalError.eligibilityIndexInvalid
        }
        self.pricingVersion = index.pricingVersion
        self.eligibleByID = Dictionary(uniqueKeysWithValues: index.profiles.map { ($0.toolId, $0) })

        let fileManager = FileManager.default
        let url: URL
        if let databaseURL {
            url = databaseURL
        } else {
            let base = try fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            let directory = base.appendingPathComponent("OfflineWallet", isDirectory: true)
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true,
                                            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
            url = directory.appendingPathComponent("env_offline_wallet_v1.sqlite")
        }
        var opened: OpaquePointer?
        let result = sqlite3_open_v2(url.path, &opened, SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil)
        guard result == SQLITE_OK, let opened else {
            if let opened { sqlite3_close(opened) }
            throw OfflineWalletJournalError.database("SQLite open failed (\(result)).")
        }
        self.database = opened
        if databaseURL == nil {
            try? fileManager.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
        }
        do {
            try exec("PRAGMA foreign_keys=ON;")
            try exec("PRAGMA journal_mode=DELETE;")
            try exec("PRAGMA synchronous=FULL;")
            try exec("PRAGMA secure_delete=ON;")
            let storedSchemaVersion = try query("PRAGMA user_version").first.map { integer($0, "user_version") } ?? 0
            guard storedSchemaVersion == 0 || storedSchemaVersion == Self.schemaVersion else {
                throw OfflineWalletJournalError.database("Unsupported offline wallet journal schema version. Preserve this database for recovery.")
            }
            try exec("""
                CREATE TABLE IF NOT EXISTS offline_allowances (
                    allowance_id TEXT PRIMARY KEY NOT NULL,
                    device_key_id TEXT NOT NULL,
                    allowance_token TEXT NOT NULL,
                    allowance_subunits INTEGER NOT NULL CHECK(allowance_subunits > 0),
                    pricing_version TEXT NOT NULL,
                    issued_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    next_sequence INTEGER NOT NULL DEFAULT 1,
                    last_ack_sequence INTEGER NOT NULL DEFAULT 0,
                    spent_subunits INTEGER NOT NULL DEFAULT 0,
                    pending_subunits INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL,
                    pending_batch_json TEXT,
                    CHECK(spent_subunits >= 0 AND pending_subunits >= 0),
                    CHECK(spent_subunits + pending_subunits <= allowance_subunits)
                );
                """)
            try exec("""
                CREATE TABLE IF NOT EXISTS offline_transactions (
                    allowance_id TEXT NOT NULL REFERENCES offline_allowances(allowance_id),
                    sequence_number INTEGER NOT NULL CHECK(sequence_number > 0),
                    transaction_id TEXT NOT NULL,
                    tool_id TEXT NOT NULL,
                    pricing_version TEXT NOT NULL,
                    unit_count INTEGER NOT NULL CHECK(unit_count > 0),
                    outcome TEXT CHECK(outcome IS NULL OR outcome IN ('succeeded','failed')),
                    recorded_at TEXT NOT NULL,
                    signature TEXT,
                    reserved_subunits INTEGER NOT NULL CHECK(reserved_subunits > 0),
                    status TEXT NOT NULL CHECK(status IN ('preparing','finishing','ready')),
                    PRIMARY KEY(allowance_id, sequence_number),
                    UNIQUE(allowance_id, transaction_id)
                );
                CREATE INDEX IF NOT EXISTS offline_transactions_pending_idx
                    ON offline_transactions(allowance_id, status, sequence_number);
                """)
            if storedSchemaVersion == 0 { try exec("PRAGMA user_version=1;") }
        } catch {
            sqlite3_close(opened)
            self.database = nil
            throw error
        }
    }

    deinit {
        if let database { sqlite3_close(database) }
    }

    /// Creates/loads the device key and returns only public coordinates for server registration.
    func publicDeviceKey(deviceKeyID: String) throws -> OfflineWalletDeviceKey.PublicJWK {
        try lock.withLock { try OfflineWalletDeviceKey.publicJWK(deviceKeyID: deviceKeyID) }
    }

    func installAllowance(_ allowance: Allowance) throws {
        guard !allowance.allowanceID.isEmpty, !allowance.token.isEmpty, allowance.allowanceSubunits > 0,
              let issued = parseDate(allowance.issuedAt), let expiry = parseDate(allowance.expiresAt), expiry > issued else {
            throw OfflineWalletJournalError.invalidAllowance
        }
        try locked {
            try transaction {
                if let current = try query("SELECT allowance_id, device_key_id, allowance_token, allowance_subunits, pricing_version, issued_at, expires_at FROM offline_allowances WHERE allowance_id=?",
                                            [allowance.allowanceID]).first {
                    guard string(current, "device_key_id") == allowance.deviceKeyID,
                          string(current, "allowance_token") == allowance.token,
                          integer(current, "allowance_subunits") == allowance.allowanceSubunits,
                          string(current, "pricing_version") == allowance.pricingVersion,
                          parseDate(string(current, "issued_at")) == parseDate(allowance.issuedAt),
                          parseDate(string(current, "expires_at")) == parseDate(allowance.expiresAt) else {
                        throw OfflineWalletJournalError.allowanceConflict
                    }
                    return
                }
                try execute("""
                    INSERT INTO offline_allowances
                    (allowance_id, device_key_id, allowance_token, allowance_subunits, pricing_version, issued_at, expires_at, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'issued')
                    """, [allowance.allowanceID, allowance.deviceKeyID, allowance.token, allowance.allowanceSubunits,
                           allowance.pricingVersion, allowance.issuedAt, allowance.expiresAt])
            }
        }
    }

    /// Must succeed durably before the caller starts the local tool operation.
    func beginOperation(allowanceID: String, toolID: String, unitCount: Int64 = 1) throws -> OperationTicket {
        guard toolID.range(of: "^[A-Za-z0-9._-]{1,160}$", options: .regularExpression) != nil, unitCount == 1,
              let profile = eligibleByID[toolID], allowedBillingKeys.contains(profile.billingKey) else {
            throw OfflineWalletJournalError.toolNotEligible
        }
        let (cost, overflow) = profile.subunitsPerUnit.multipliedReportingOverflow(by: unitCount)
        guard !overflow, cost > 0 else { throw OfflineWalletJournalError.invalidCost }
        return try locked {
            try transaction {
                guard let allowance = try readAllowance(allowanceID) else { throw OfflineWalletJournalError.allowanceMissing }
                guard allowance.status == "issued" || allowance.status == "syncing" else { throw OfflineWalletJournalError.recoveryRequired }
                if let pending = allowance.pendingBatchJSON,
                   let decoded = try? JSONDecoder().decode(PendingBatch.self, from: Data(pending.utf8)), decoded.finalized {
                    throw OfflineWalletJournalError.recoveryRequired
                }
                guard let expiry = parseDate(allowance.expiresAt), Date() < expiry else { throw OfflineWalletJournalError.allowanceExpired }
                guard allowance.pricingVersion == pricingVersion else { throw OfflineWalletJournalError.pricingVersionMismatch }
                let (used, usedOverflow) = allowance.spentSubunits.addingReportingOverflow(allowance.pendingSubunits)
                let (next, nextOverflow) = used.addingReportingOverflow(cost)
                guard !usedOverflow, !nextOverflow, next <= allowance.allowanceSubunits else { throw OfflineWalletJournalError.allowanceExhausted }
                let sequence = allowance.nextSequence
                let transactionID = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
                let recordedAt = formatDate(Date())
                try execute("""
                    INSERT INTO offline_transactions
                    (allowance_id, sequence_number, transaction_id, tool_id, pricing_version, unit_count, outcome, recorded_at, signature, reserved_subunits, status)
                    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, 'preparing')
                    """, [allowanceID, sequence, transactionID, toolID, allowance.pricingVersion, unitCount, recordedAt, cost])
                try execute("UPDATE offline_allowances SET next_sequence=?, pending_subunits=? WHERE allowance_id=?",
                            [sequence + 1, allowance.pendingSubunits + cost, allowanceID])
                return OperationTicket(allowanceID: allowanceID, sequenceNumber: sequence, transactionID: transactionID, reservedSubunits: cost)
            }
        }
    }

    /// Commits the outcome before signing. If app termination occurs after commit, repairFinishingOperations re-signs it.
    func finishOperation(_ ticket: OperationTicket, outcome: String) throws -> TransactionRecord {
        guard outcome == "succeeded" || outcome == "failed" else { throw OfflineWalletJournalError.invalidOutcome }
        let (record, deviceKeyID) = try locked { () throws -> (TransactionRecord, String) in
            try transaction {
                guard let allowance = try readAllowance(ticket.allowanceID) else { throw OfflineWalletJournalError.allowanceMissing }
                guard var row = try readTransaction(ticket.allowanceID, ticket.sequenceNumber) else { throw OfflineWalletJournalError.operationMissing }
                if row.status == "ready" {
                    guard row.outcome == outcome else { throw OfflineWalletJournalError.outcomeConflict }
                    return (row.record, allowance.deviceKeyID)
                }
                if row.status == "preparing" {
                    guard allowance.pendingSubunits >= row.reservedSubunits else { throw OfflineWalletJournalError.balanceInvariant }
                    // A modified client can sign a forged failed outcome. Started operations are charged either way;
                    // validate inputs before beginOperation and use outcome only for diagnostics.
                    let newSpent = allowance.spentSubunits.addingReportingOverflow(row.reservedSubunits)
                    guard !newSpent.overflow else { throw OfflineWalletJournalError.invalidCost }
                    try execute("UPDATE offline_allowances SET pending_subunits=?, spent_subunits=? WHERE allowance_id=?",
                                [allowance.pendingSubunits - row.reservedSubunits, newSpent.partialValue, ticket.allowanceID])
                    try execute("UPDATE offline_transactions SET outcome=?, status='finishing' WHERE allowance_id=? AND sequence_number=? AND status='preparing'",
                                [outcome, ticket.allowanceID, ticket.sequenceNumber])
                    row = TransactionRow(transactionId: row.transactionId, sequenceNumber: row.sequenceNumber,
                        toolId: row.toolId, pricingVersion: row.pricingVersion, unitCount: row.unitCount,
                        outcome: outcome, recordedAt: row.recordedAt, signature: "", reservedSubunits: row.reservedSubunits, status: "finishing")
                } else {
                    guard row.status == "finishing", row.outcome == outcome else { throw OfflineWalletJournalError.outcomeConflict }
                }
                return (row.record, allowance.deviceKeyID)
            }
        }
        if !record.signature.isEmpty { return record }
        let signature = try OfflineWalletDeviceKey.sign(deviceKeyID: deviceKeyID, message: try OfflineWalletWireProtocol.canonicalTransaction(allowanceID: ticket.allowanceID, record: record))
        return try locked {
            try transaction {
                guard let current = try readTransaction(ticket.allowanceID, ticket.sequenceNumber), current.outcome == outcome else {
                    throw OfflineWalletJournalError.operationMissing
                }
                if current.status == "finishing" {
                    _ = try execute("UPDATE offline_transactions SET signature=?, status='ready' WHERE allowance_id=? AND sequence_number=? AND status='finishing' AND outcome=?",
                                     [signature, ticket.allowanceID, ticket.sequenceNumber, outcome])
                } else if current.status != "ready" {
                    throw OfflineWalletJournalError.operationMissing
                }
                guard let saved = try readTransaction(ticket.allowanceID, ticket.sequenceNumber), saved.status == "ready",
                      saved.outcome == outcome, !saved.signature.isEmpty else {
                    throw OfflineWalletJournalError.operationMissing
                }
                return saved.record
            }
        }
    }

    func repairFinishingOperations(allowanceID: String) throws -> (repaired: Int, unresolvedPreparing: Int) {
        let rows = try locked { try readTransactions(allowanceID, after: 0) }
        guard let allowance = try locked({ try readAllowance(allowanceID) }) else { return (0, 0) }
        var repaired = 0
        for row in rows where row.status == "finishing" {
            guard let outcome = row.outcome else { throw OfflineWalletJournalError.balanceInvariant }
            let ticket = OperationTicket(allowanceID: allowanceID, sequenceNumber: row.sequenceNumber,
                                         transactionID: row.transactionId, reservedSubunits: row.reservedSubunits)
            _ = try finishOperation(ticket, outcome: outcome)
            repaired += 1
        }
        let unresolved = rows.filter { $0.status == "preparing" }.count
        _ = allowance
        return (repaired, unresolved)
    }

    /// Returns an identical saved batch after retry; it never creates a new ID while one is pending.
    func buildSyncBatch(allowanceID: String, finalize: Bool) throws -> SyncBatch {
        try locked {
            try transaction {
                guard let allowance = try readAllowance(allowanceID) else { throw OfflineWalletJournalError.allowanceMissing }
                if let json = allowance.pendingBatchJSON, let pending = try? JSONDecoder().decode(PendingBatch.self, from: Data(json.utf8)) {
                    let selected = try readTransactions(allowanceID, after: pending.sequenceNumbers.first.map { $0 - 1 } ?? allowance.lastAckSequence)
                        .filter { pending.sequenceNumbers.contains($0.sequenceNumber) }
                    guard selected.count == pending.sequenceNumbers.count, selected.allSatisfy({ $0.status == "ready" }) else {
                        throw OfflineWalletJournalError.journalGap
                    }
                    return SyncBatch(allowanceToken: allowance.token, batchId: pending.batchId, transactions: selected.map(\.record),
                                     checkpointSequence: pending.checkpointSequence, checkpointSignature: pending.checkpointSignature, finalized: pending.finalized)
                }
                let all = try readTransactions(allowanceID, after: allowance.lastAckSequence)
                guard all.allSatisfy({ $0.status == "ready" }) else { throw OfflineWalletJournalError.unresolvedOperation }
                var expected = allowance.lastAckSequence + 1
                for row in all {
                    guard row.sequenceNumber == expected else { throw OfflineWalletJournalError.journalGap }
                    expected += 1
                }
                guard allowance.nextSequence - 1 == expected - 1 else { throw OfflineWalletJournalError.journalGap }
                let chosen = Array(all.prefix(maxBatchRecords))
                let actualFinalize = finalize && all.count <= maxBatchRecords
                let checkpoint = chosen.last?.sequenceNumber ?? allowance.lastAckSequence
                let checkpointSignature = try OfflineWalletDeviceKey.sign(deviceKeyID: allowance.deviceKeyID,
                    message: try OfflineWalletWireProtocol.canonicalCheckpoint(allowanceID: allowanceID, sequence: checkpoint, finalized: actualFinalize))
                let batch = SyncBatch(allowanceToken: allowance.token, batchId: UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased(),
                    transactions: chosen.map(\.record), checkpointSequence: checkpoint, checkpointSignature: checkpointSignature, finalized: actualFinalize)
                let pending = PendingBatch(batchId: batch.batchId, checkpointSequence: checkpoint, finalized: actualFinalize,
                                           sequenceNumbers: chosen.map(\.sequenceNumber), checkpointSignature: checkpointSignature)
                let stored = try String(decoding: JSONEncoder().encode(pending), as: UTF8.self)
                guard try execute("UPDATE offline_allowances SET pending_batch_json=?, status='syncing' WHERE allowance_id=? AND pending_batch_json IS NULL", [stored, allowanceID]) == 1 else {
                    throw OfflineWalletJournalError.batchMismatch
                }
                return batch
            }
        }
    }

    /// Local rows are deleted only after the server acknowledges the exact saved batch.
    func acknowledgeSyncBatch(allowanceID: String, batchID: String, resultStatus: String) throws {
        guard resultStatus == "syncing" || resultStatus == "reconciled" else { throw OfflineWalletJournalError.syncNotAccepted }
        try locked {
            try transaction {
                guard let allowance = try readAllowance(allowanceID), let json = allowance.pendingBatchJSON,
                      let pending = try? JSONDecoder().decode(PendingBatch.self, from: Data(json.utf8)), pending.batchId == batchID else {
                    throw OfflineWalletJournalError.batchMismatch
                }
                for sequence in pending.sequenceNumbers {
                    try execute("DELETE FROM offline_transactions WHERE allowance_id=? AND sequence_number=?", [allowanceID, sequence])
                }
                try execute("UPDATE offline_allowances SET last_ack_sequence=?, pending_batch_json=NULL, status=? WHERE allowance_id=?",
                            [max(allowance.lastAckSequence, pending.checkpointSequence), resultStatus, allowanceID])
            }
        }
    }

    ///
    /// Only repairs a rejected batch envelope. It does not delete journal rows, refund
    /// spent subunits, or lower sequence counters. Other failures remain locked for review.
    func prepareRetryAfterRecoverableRejection(allowanceID: String, batchID: String, reasonCode: String) throws {
        guard OfflineWalletWireProtocol.isRecoverableBatchRejection(reasonCode) else {
            throw OfflineWalletJournalError.recoveryRequired
        }
        try locked {
            try transaction {
                guard let allowance = try readAllowance(allowanceID), let json = allowance.pendingBatchJSON,
                      let pending = try? JSONDecoder().decode(PendingBatch.self, from: Data(json.utf8)),
                      pending.batchId == batchID, allowance.status != "reconciled" else {
                    throw OfflineWalletJournalError.batchMismatch
                }
                let changed = try execute("UPDATE offline_allowances SET pending_batch_json=NULL, status='syncing' WHERE allowance_id=? AND pending_batch_json=? AND status!='reconciled'",
                                          [allowanceID, json])
                guard changed == 1 else { throw OfflineWalletJournalError.batchMismatch }
            }
        }
    }

    func markNeedsRecovery(allowanceID: String) throws {
        try locked { try execute("UPDATE offline_allowances SET status='needs_recovery' WHERE allowance_id=? AND status!='reconciled'", [allowanceID]) }
    }

    /// Returns the current non-final local allowance, if one exists. No allowance means calculators remain free.
    func activeAllowanceID() throws -> String? {
        try locked {
            let rows = try query("SELECT allowance_id FROM offline_allowances WHERE status IN ('issued','syncing') ORDER BY issued_at DESC", [])
            for row in rows {
                let id = string(row, "allowance_id")
                guard let allowance = try readAllowance(id), let expiry = parseDate(allowance.expiresAt), Date() < expiry else { continue }
                return id
            }
            return nil
        }
    }

    func isEligibleTool(_ toolID: String) -> Bool {
        guard let profile = eligibleByID[toolID] else { return false }
        return allowedBillingKeys.contains(profile.billingKey)
    }

    func pendingTransactionCount(allowanceID: String) throws -> Int {
        try locked {
            guard let allowance = try readAllowance(allowanceID) else { return 0 }
            let rows = try query("SELECT COUNT(*) AS pending_count FROM offline_transactions WHERE allowance_id=? AND sequence_number>?", [allowanceID, allowance.lastAckSequence])
            return rows.first.map { Int(integer($0, "pending_count")) } ?? 0
        }
    }

    func localState(allowanceID: String) throws -> [String: Any]? {
        try locked {
            guard let allowance = try readAllowance(allowanceID) else { return nil }
            let rows = try readTransactions(allowanceID, after: allowance.lastAckSequence)
            return ["allowanceID": allowance.allowanceID, "reservedSubunits": allowance.allowanceSubunits,
                    "spentSubunits": allowance.spentSubunits, "pendingSubunits": allowance.pendingSubunits,
                    "availableOfflineSubunits": max(0, allowance.allowanceSubunits - allowance.spentSubunits - allowance.pendingSubunits),
                    "lastAckSequence": allowance.lastAckSequence, "nextSequence": allowance.nextSequence,
                    "pendingRecords": rows.count, "preparingRecords": rows.filter { $0.status == "preparing" }.count,
                    "status": allowance.status, "expiresAt": allowance.expiresAt,
                    "syncPending": allowance.pendingBatchJSON != nil]
        }
    }

    private func readAllowance(_ id: String) throws -> AllowanceRow? {
        guard let row = try query("SELECT * FROM offline_allowances WHERE allowance_id=?", [id]).first else { return nil }
        return AllowanceRow(allowanceID: string(row, "allowance_id"), deviceKeyID: string(row, "device_key_id"),
            token: string(row, "allowance_token"), allowanceSubunits: integer(row, "allowance_subunits"),
            pricingVersion: string(row, "pricing_version"), issuedAt: string(row, "issued_at"), expiresAt: string(row, "expires_at"),
            nextSequence: integer(row, "next_sequence"), lastAckSequence: integer(row, "last_ack_sequence"),
            spentSubunits: integer(row, "spent_subunits"), pendingSubunits: integer(row, "pending_subunits"),
            status: string(row, "status"), pendingBatchJSON: optionalString(row, "pending_batch_json"))
    }

    private func readTransaction(_ allowanceID: String, _ sequence: Int64) throws -> TransactionRow? {
        guard let row = try query("SELECT * FROM offline_transactions WHERE allowance_id=? AND sequence_number=?", [allowanceID, sequence]).first else { return nil }
        return transactionRow(row)
    }

    private func readTransactions(_ allowanceID: String, after sequence: Int64) throws -> [TransactionRow] {
        try query("SELECT * FROM offline_transactions WHERE allowance_id=? AND sequence_number>? ORDER BY sequence_number", [allowanceID, sequence]).map(transactionRow)
    }

    private func transactionRow(_ row: [String: Any]) -> TransactionRow {
        TransactionRow(transactionId: string(row, "transaction_id"), sequenceNumber: integer(row, "sequence_number"),
            toolId: string(row, "tool_id"), pricingVersion: string(row, "pricing_version"), unitCount: integer(row, "unit_count"),
            outcome: optionalString(row, "outcome"), recordedAt: string(row, "recorded_at"), signature: optionalString(row, "signature") ?? "",
            reservedSubunits: integer(row, "reserved_subunits"), status: string(row, "status"))
    }

    private func exec(_ sql: String) throws {
        var errorMessage: UnsafeMutablePointer<CChar>?
        guard sqlite3_exec(database, sql, nil, nil, &errorMessage) == SQLITE_OK else {
            let message = errorMessage.map { String(cString: $0) } ?? sqliteError
            sqlite3_free(errorMessage)
            throw OfflineWalletJournalError.database(message)
        }
    }

    @discardableResult
    private func execute(_ sql: String, _ values: [Any?] = []) throws -> Int {
        guard let database else { throw OfflineWalletJournalError.database("Database is closed.") }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw OfflineWalletJournalError.database(sqliteError)
        }
        defer { sqlite3_finalize(statement) }
        try bind(values, to: statement)
        guard sqlite3_step(statement) == SQLITE_DONE else { throw OfflineWalletJournalError.database(sqliteError) }
        return Int(sqlite3_changes(database))
    }

    private func query(_ sql: String, _ values: [Any?] = []) throws -> [[String: Any]] {
        guard let database else { throw OfflineWalletJournalError.database("Database is closed.") }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw OfflineWalletJournalError.database(sqliteError)
        }
        defer { sqlite3_finalize(statement) }
        try bind(values, to: statement)
        var rows: [[String: Any]] = []
        while true {
            let result = sqlite3_step(statement)
            if result == SQLITE_DONE { break }
            guard result == SQLITE_ROW else { throw OfflineWalletJournalError.database(sqliteError) }
            var row: [String: Any] = [:]
            for index in 0..<sqlite3_column_count(statement) {
                let name = String(cString: sqlite3_column_name(statement, index))
                switch sqlite3_column_type(statement, index) {
                case SQLITE_INTEGER: row[name] = sqlite3_column_int64(statement, index)
                case SQLITE_FLOAT: row[name] = sqlite3_column_double(statement, index)
                case SQLITE_TEXT:
                    if let pointer = sqlite3_column_text(statement, index) { row[name] = String(cString: pointer) }
                case SQLITE_NULL: row[name] = NSNull()
                default: row[name] = NSNull()
                }
            }
            rows.append(row)
        }
        return rows
    }

    private func bind(_ values: [Any?], to statement: OpaquePointer) throws {
        for (offset, value) in values.enumerated() {
            let index = Int32(offset + 1)
            if value == nil || value is NSNull {
                sqlite3_bind_null(statement, index)
            } else if let string = value as? String {
                let result = string.withCString { sqlite3_bind_text(statement, index, $0, -1, sqliteTransient) }
                guard result == SQLITE_OK else { throw OfflineWalletJournalError.database(sqliteError) }
            } else if let number = value as? Int64 {
                guard sqlite3_bind_int64(statement, index, number) == SQLITE_OK else { throw OfflineWalletJournalError.database(sqliteError) }
            } else if let number = value as? Int {
                guard sqlite3_bind_int64(statement, index, Int64(number)) == SQLITE_OK else { throw OfflineWalletJournalError.database(sqliteError) }
            } else if let bool = value as? Bool {
                guard sqlite3_bind_int(statement, index, bool ? 1 : 0) == SQLITE_OK else { throw OfflineWalletJournalError.database(sqliteError) }
            } else {
                throw OfflineWalletJournalError.database("Unsupported SQLite parameter type.")
            }
        }
    }

    private func transaction<T>(_ body: () throws -> T) throws -> T {
        try exec("BEGIN IMMEDIATE;")
        do {
            let result = try body()
            try exec("COMMIT;")
            return result
        } catch {
            try? exec("ROLLBACK;")
            throw error
        }
    }

    private func locked<T>(_ body: () throws -> T) rethrows -> T {
        lock.lock()
        defer { lock.unlock() }
        return try body()
    }

    private var sqliteError: String {
        guard let database, let message = sqlite3_errmsg(database) else { return "Unknown SQLite error." }
        return String(cString: message)
    }

    private func string(_ row: [String: Any], _ key: String) -> String { row[key] as? String ?? "" }
    private func integer(_ row: [String: Any], _ key: String) -> Int64 { (row[key] as? Int64) ?? 0 }
    private func optionalString(_ row: [String: Any], _ key: String) -> String? { row[key] as? String }

    private func formatDate(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.string(from: date)
    }

    private func parseDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let result = fractional.date(from: value) { return result }
        let ordinary = ISO8601DateFormatter()
        ordinary.formatOptions = [.withInternetDateTime]
        return ordinary.date(from: value)
    }

    private static func allowedToolKey(_ key: String) -> Bool {
        ["local.calculator", "local.text", "local.converter", "local.general"].contains(key)
    }
}

enum OfflineWalletWireProtocol {
    /// Only these server rejection codes may replace a pending batch envelope.
    static func isRecoverableBatchRejection(_ reasonCode: String) -> Bool {
        reasonCode == "SEQUENCE_GAP" || reasonCode == "CHECKPOINT_SEQUENCE_MISMATCH"
    }

    static func canonicalTransaction(allowanceID: String, record: OfflineWalletJournal.TransactionRecord) throws -> String {
        try canonicalJSON([allowanceID, record.transactionId, record.sequenceNumber, record.toolId, record.pricingVersion,
                           record.unitCount, record.outcome, record.recordedAt])
    }

    static func canonicalCheckpoint(allowanceID: String, sequence: Int64, finalized: Bool) throws -> String {
        try canonicalJSON([allowanceID, sequence, finalized])
    }

    private static func canonicalJSON(_ array: [Any]) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: array, options: [])
        guard let value = String(data: data, encoding: .utf8) else { throw OfflineWalletJournalError.canonicalEncoding }
        return value
    }
}

private let sqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

private extension NSRecursiveLock {
    func withLock<T>(_ body: () throws -> T) rethrows -> T {
        lock(); defer { unlock() }; return try body()
    }
}

enum OfflineWalletJournalError: Error {
    case eligibilityIndexMissing
    case eligibilityIndexInvalid
    case invalidAllowance
    case allowanceConflict
    case allowanceMissing
    case recoveryRequired
    case allowanceExpired
    case pricingVersionMismatch
    case allowanceExhausted
    case toolNotEligible
    case invalidCost
    case invalidOutcome
    case operationMissing
    case outcomeConflict
    case balanceInvariant
    case journalGap
    case unresolvedOperation
    case canonicalEncoding
    case syncNotAccepted
    case batchMismatch
    case database(String)
}
